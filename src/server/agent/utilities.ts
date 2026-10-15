import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { AgentEquipment, AgentGeneratorRun, AgentPayload } from "@/lib/agent-payload";
import { kindForGroup, normalizeDeclared, type TagInfo, type UtilityKind } from "@/lib/utilities";
import { audit } from "@/server/audit";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";
import { invalidateUtilities } from "@/server/utilities/catalog";
import type { AgentSite } from "./token";

/**
 * Equipamentos dos módulos Água e Gerador: nascem e se atualizam pela lista de
 * equipamentos do Painel (grupos "agua" e "gerador"), como os medidores de
 * energia. Os valores ficam com os nomes de tag do Painel — não há tradução.
 */

/** id do equipamento no Painel → id na nuvem e tipo. */
export type UtilityIndex = Record<string, { id: string; kind: UtilityKind }>;

type CachedIndex = { signature: string; equipment: UtilityIndex };

const INDEX_TTL_MS = 24 * 3_600_000;
const indexKey = (siteId: string) => `agent:utilities:v1:${siteId}`;

export const utilityKindOf = (e: AgentEquipment) => kindForGroup(e.grupo);

function tagInfoOf(e: AgentEquipment): Record<string, TagInfo> | null {
  if (!e.tags?.length) return null;
  return Object.fromEntries(
    e.tags.map((t) => [t.nome, { label: t.rotulo || t.nome, unit: t.unidade ?? null, decimals: t.decimais ?? null }]),
  );
}

function signatureOf(equipment: AgentEquipment[]): string {
  const relevant = equipment.map((e) => [e.id, e.nome, e.grupo, e.tag_isa ?? null, e.perfil ?? null, e.parametros ?? null, e.tags ?? null]);
  return createHash("sha256").update(JSON.stringify(relevant)).digest("hex");
}

/** Índice dos equipamentos de água e gerador, sincronizando o cadastro se a lista mudou. */
export async function ensureUtilityEquipment(site: AgentSite, equipment: AgentEquipment[]): Promise<UtilityIndex> {
  const relevant = equipment.filter((e) => utilityKindOf(e) !== null);
  const signature = signatureOf(relevant);
  const cache = getCache();
  const current = await cache.get<CachedIndex>(indexKey(site.id));
  if (current?.signature === signature) return current.equipment;

  const index = await syncEquipment(site, relevant);
  await cache.set(indexKey(site.id), { signature, equipment: index }, INDEX_TTL_MS);
  return index;
}

/** Índice sem sincronizar (envios só de histórico). */
export async function loadUtilityIndex(siteId: string): Promise<UtilityIndex> {
  const cache = getCache();
  const current = await cache.get<CachedIndex>(indexKey(siteId));
  if (current) return current.equipment;
  const rows = await db.utilityEquipment.findMany({ where: { siteId }, select: { id: true, externalId: true, kind: true } });
  const equipment: UtilityIndex = Object.fromEntries(rows.map((r) => [r.externalId, { id: r.id, kind: r.kind }]));
  await cache.set(indexKey(siteId), { signature: "", equipment }, INDEX_TTL_MS);
  return equipment;
}

export async function invalidateUtilityIndex(...siteIds: string[]): Promise<void> {
  if (siteIds.length > 0) await getCache().del(...siteIds.map(indexKey));
}

async function syncEquipment(site: AgentSite, relevant: AgentEquipment[]): Promise<UtilityIndex> {
  const existing = await db.utilityEquipment.findMany({ where: { siteId: site.id }, select: { id: true, externalId: true } });
  const known = new Map(existing.map((e) => [e.externalId, e.id]));
  const index: UtilityIndex = {};

  for (const [position, e] of relevant.entries()) {
    const kind = utilityKindOf(e)!;
    const data = {
      kind,
      name: e.nome,
      tag: e.tag_isa ?? null,
      profile: e.perfil ?? null,
      settings: (e.parametros ?? undefined) as Prisma.InputJsonValue | undefined,
      tagInfo: (tagInfoOf(e) ?? undefined) as Prisma.InputJsonValue | undefined,
      sortOrder: position,
    };
    const row = await db.utilityEquipment.upsert({
      where: { siteId_externalId: { siteId: site.id, externalId: e.id } },
      create: { siteId: site.id, externalId: e.id, ...data },
      update: data,
      select: { id: true },
    });
    index[e.id] = { id: row.id, kind };
    if (!known.has(e.id)) {
      await audit({
        actorId: null,
        action: "create",
        entityType: "utility-equipment",
        entityId: row.id,
        details: { origem: "painel-local", equipamento: e.id, nome: e.nome, tipo: kind },
      });
    }
  }

  await invalidateUtilities(site.tenantId);
  return index;
}

/** Leitura atual de um equipamento de água ou gerador (nomes de tag do Painel). */
export type UtilityReading = { time: string | null; online: boolean; values: Record<string, number> };

/** Leituras ao vivo por id do equipamento na nuvem, com o horário corrigido pelo relógio da loja. */
export function utilityLiveReadings(
  payload: AgentPayload,
  index: UtilityIndex,
  receivedAt: number,
): Record<string, UtilityReading> {
  const skew = receivedAt - payload.ts;
  const readings: Record<string, UtilityReading> = {};
  for (const e of payload.equipamentos ?? []) {
    const ref = index[e.id];
    if (!ref) continue;
    const readAt = e.lido_em ?? (e.online ? payload.ts : null);
    const values: Record<string, number> = {};
    for (const [name, value] of Object.entries(e.valores)) if (value !== null && Number.isFinite(value)) values[name] = value;
    readings[ref.id] = { time: readAt === null ? null : new Date(readAt + skew).toISOString(), online: e.online, values };
  }
  return readings;
}

type Reading5mRow = { equipmentId: string; ts: string; values: Record<string, [number, number, number]> };

/** Resumo de 5 min dos equipamentos de água e gerador. Devolve as linhas gravadas. */
export async function upsertUtilityReadings(
  windows: NonNullable<AgentPayload["resumo_5min"]>,
  index: UtilityIndex,
): Promise<number> {
  const byKey = new Map<string, Reading5mRow>();
  for (const w of windows) {
    const ref = index[w.medidor];
    if (!ref || Object.keys(w.valores).length === 0) continue;
    const ts = new Date(w.ts).toISOString();
    byKey.set(`${ref.id}|${ts}`, { equipmentId: ref.id, ts, values: w.valores });
  }
  const rows = [...byKey.values()];
  if (rows.length === 0) return 0;
  return db.$executeRaw`
    INSERT INTO utility_readings_5m (equipment_id, ts, "values")
    SELECT x.e, x.t::timestamp, x.v::jsonb
    FROM unnest(${rows.map((r) => r.equipmentId)}::uuid[], ${rows.map((r) => r.ts)}::text[], ${rows.map((r) => JSON.stringify(r.values))}::text[]) AS x(e, t, v)
    WHERE EXISTS (SELECT 1 FROM utility_equipment u WHERE u.id = x.e)
    ON CONFLICT (equipment_id, ts) DO UPDATE SET "values" = EXCLUDED."values"`;
}

const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : v);
const iso = (v: number | null | undefined) => (v === null || v === undefined ? null : new Date(v).toISOString());

/** Corridas do gerador (a em andamento vem de novo até terminar). Devolve as gravadas. */
export async function upsertGeneratorRuns(runs: AgentGeneratorRun[], index: UtilityIndex, skewMs: number): Promise<number> {
  const rows = runs.flatMap((r) => {
    const ref = index[r.medidor];
    if (!ref || ref.kind !== "GENERATOR") return [];
    return [
      {
        equipmentId: ref.id,
        externalId: r.id,
        startedAt: iso(r.inicio + skewMs)!,
        endedAt: iso(r.fim === null || r.fim === undefined ? null : r.fim + skewMs),
        reason: r.motivo ?? null,
        result: r.resultado ?? null,
        batteryRest: num(r.bateria_repouso),
        batteryMin: num(r.bateria_minima),
        startSeconds: num(r.tempo_partida_s),
        durationSeconds: num(r.duracao_s),
        kwh: num(r.kwh),
        liters: num(r.litros),
        peakKw: num(r.pico_kw),
        levelStart: num(r.nivel_inicial),
        levelEnd: num(r.nivel_final),
      },
    ];
  });
  const unique = [...new Map(rows.map((r) => [`${r.equipmentId}|${r.externalId}`, r])).values()];
  if (unique.length === 0) return 0;
  const col = <K extends keyof (typeof unique)[number]>(k: K) => unique.map((r) => r[k]);
  return db.$executeRaw`
    INSERT INTO generator_runs (equipment_id, external_id, started_at, ended_at, reason, result, battery_rest, battery_min,
                                start_seconds, duration_seconds, kwh, liters, peak_kw, level_start, level_end)
    SELECT x.e, x.i, x.s::timestamp, x.f::timestamp, x.mo, x.re, x.br, x.bm, x.ts, x.du, x.kw, x.li, x.pk, x.ni, x.nf
    FROM unnest(
      ${col("equipmentId")}::uuid[], ${col("externalId")}::int[], ${col("startedAt")}::text[], ${col("endedAt")}::text[],
      ${col("reason")}::text[], ${col("result")}::text[], ${col("batteryRest")}::float8[], ${col("batteryMin")}::float8[],
      ${col("startSeconds")}::float8[], ${col("durationSeconds")}::float8[], ${col("kwh")}::float8[], ${col("liters")}::float8[],
      ${col("peakKw")}::float8[], ${col("levelStart")}::float8[], ${col("levelEnd")}::float8[]
    ) AS x(e, i, s, f, mo, re, br, bm, ts, du, kw, li, pk, ni, nf)
    WHERE EXISTS (SELECT 1 FROM utility_equipment u WHERE u.id = x.e)
    ON CONFLICT (equipment_id, external_id) DO UPDATE SET
      started_at = EXCLUDED.started_at, ended_at = EXCLUDED.ended_at, reason = EXCLUDED.reason, result = EXCLUDED.result,
      battery_rest = EXCLUDED.battery_rest, battery_min = EXCLUDED.battery_min, start_seconds = EXCLUDED.start_seconds,
      duration_seconds = EXCLUDED.duration_seconds, kwh = EXCLUDED.kwh, liters = EXCLUDED.liters, peak_kw = EXCLUDED.peak_kw,
      level_start = EXCLUDED.level_start, level_end = EXCLUDED.level_end`;
}

const modulesKey = (siteId: string) => `agent:modules:v1:${siteId}`;

/** Módulos declarados pelo configurador da loja; o banco só é tocado quando a lista muda. */
export async function syncDeclaredModules(site: AgentSite, declared: readonly string[] | null | undefined): Promise<void> {
  if (!declared) return; // Painel antigo: não declara
  const list = normalizeDeclared(declared);
  const signature = list.join(",");
  const cache = getCache();
  if ((await cache.get<string>(modulesKey(site.id))) === signature) return;
  await db.site.update({ where: { id: site.id }, data: { modules: list } });
  await cache.set(modulesKey(site.id), signature, INDEX_TTL_MS);
  await invalidateUtilities(site.tenantId);
}
