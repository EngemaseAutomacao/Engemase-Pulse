import "server-only";
import type { GeneratorRunView, GeneratorView, UtilitiesResponse, UtilityLive, UtilitySiteView, WaterView } from "@/lib/utility-types";
import {
  activeFaults,
  generatorRunning,
  generatorStateLabel,
  generatorStats,
  leakCheck,
  recentUsageRate,
  reservoirAutonomyHours,
  runFailed,
  runTripped,
  waterDays,
  waterUsage,
  type GeneratorRunLite,
  type UtilityModule,
  type WaterSample,
} from "@/lib/utilities";
import { zonedParts } from "@/lib/tz";
import { readAgentLive, type AgentLive } from "@/server/agent/live-store";
import { cached } from "@/server/cache";
import { db } from "@/server/db";
import {
  getUtilityCatalog,
  numericSetting,
  sitesWithModule,
  type UtilityCatalog,
  type UtilityEquipmentRef,
} from "./catalog";

/**
 * O que as telas dos módulos mostram: leitura ao vivo do Painel (cache) mais as
 * contas sobre o resumo de 5 min (consumo por dia, vazamento, corridas). As
 * contas pesadas ficam 5 min em cache por equipamento.
 */

const DAY = 86_400_000;
/** Dias de resumo lidos para a água: 14 noites de referência para o vazamento + folga. */
const WATER_DAYS = 21;
const STATS_TTL_MS = 5 * 60_000;
/** Leitura ao vivo mais velha que isso: equipamento "sem leitura recente". */
const LIVE_FRESH_MS = 5 * 60_000;

const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : v);
const bool = (v: number | null | undefined) => (num(v) === null ? null : v! >= 0.5);

export async function getUtilitiesView(
  tenantId: string,
  module: UtilityModule,
  siteId?: string,
  now = Date.now(),
): Promise<UtilitiesResponse> {
  const catalog = await getUtilityCatalog(tenantId);
  const sites = sitesWithModule(catalog, module).filter((s) => !siteId || s.id === siteId);
  const kind = module === "agua" ? "WATER" : "GENERATOR";
  const lives = new Map(await Promise.all(sites.map(async (s) => [s.id, await readAgentLive(s.id)] as const)));

  const views: UtilitySiteView[] = await Promise.all(
    sites.map(async (site) => {
      const live = lives.get(site.id) ?? null;
      const equipment = catalog.equipment.filter((e) => e.siteId === site.id && e.kind === kind);
      return {
        id: site.id,
        name: site.name,
        timeZone: site.timeZone,
        receivedAt: live?.receivedAt ?? null,
        equipment: await Promise.all(
          equipment.map((e) => (kind === "WATER" ? waterView(e, live, now) : generatorView(e, live, now))),
        ),
      };
    }),
  );
  return { module, sites: views, fetchedAt: new Date(now).toISOString() };
}

function liveOf(ref: UtilityEquipmentRef, live: AgentLive | null, now: number): UtilityLive | null {
  const reading = live?.utilities?.[ref.id];
  if (!reading) return null;
  const fresh = reading.time !== null && now - Date.parse(reading.time) <= LIVE_FRESH_MS;
  return { time: reading.time, online: reading.online && fresh, values: reading.values };
}

// ---------------------------------------------------------------------------
// Água
// ---------------------------------------------------------------------------

export async function waterSamples(equipmentId: string, now: number): Promise<WaterSample[]> {
  const bucket = Math.floor(now / STATS_TTL_MS);
  return cached(`utility:water:v1:${equipmentId}:${bucket}`, STATS_TTL_MS, async () => {
    const rows = await db.$queryRaw<{ ts: number; level: number | null; inflow: number | null; pump: number | null }[]>`
      SELECT extract(epoch FROM ts)::float8 * 1000 AS ts,
             ("values" -> 'nivel' ->> 0)::float8 AS level,
             ("values" -> 'vazao_entrada' ->> 0)::float8 AS inflow,
             ("values" -> 'bomba_ligada' ->> 0)::float8 AS pump
        FROM utility_readings_5m
       WHERE equipment_id = ${equipmentId}::uuid
         AND ts >= ${new Date(now - WATER_DAYS * DAY).toISOString()}::timestamp
       ORDER BY ts`;
    return rows.map((r) => ({ ts: Number(r.ts), level: num(r.level), inflow: num(r.inflow), pump: num(r.pump) }));
  });
}

export function localDay(ts: number, timeZone: string): { day: string; hour: number } {
  const p = zonedParts(new Date(ts), timeZone);
  return { day: `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`, hour: p.hour };
}

async function waterView(ref: UtilityEquipmentRef, live: AgentLive | null, now: number): Promise<WaterView> {
  const current = liveOf(ref, live, now);
  const values = current?.values ?? {};
  const capacityL = numericSetting(ref, "capacidade_litros");
  const samples = await waterSamples(ref.id, now);
  const levelPct = num(values.nivel) ?? [...samples].reverse().find((s) => s.level !== null)?.level ?? null;
  const days = capacityL ? waterDays(samples, capacityL, ref.timeZone) : [];
  const usage = capacityL ? waterUsage(samples, capacityL) : [];
  const usageLh = recentUsageRate(usage, now);

  // A madrugada de hoje só está completa depois das 6h; antes disso, vale a de ontem.
  const { day: today, hour } = localDay(now, ref.timeZone);
  const leakDay = hour >= 6 ? today : localDay(now - DAY, ref.timeZone).day;

  return {
    kind: "WATER",
    ...base(ref, current),
    capacityL,
    levelPct,
    volumeL: levelPct !== null && capacityL ? (levelPct / 100) * capacityL : null,
    usageLh,
    autonomyH: reservoirAutonomyHours(levelPct, capacityL, usageLh),
    levelOnly: !samples.some((s) => s.inflow !== null),
    hasPumpSignal: samples.some((s) => s.pump !== null) || "bomba_ligada" in values,
    pumpOn: bool(values.bomba_ligada),
    pressure: num(values.pressao_recalque),
    inflow: num(values.vazao_entrada),
    days: days.slice(-15),
    leak: { ...leakCheck(days, leakDay), day: days.some((d) => d.day === leakDay) ? leakDay : null },
  };
}

// ---------------------------------------------------------------------------
// Gerador
// ---------------------------------------------------------------------------

type GeneratorHistory = { runs: (GeneratorRunLite & { id: number; startSeconds: number | null })[]; readiness30: number | null };

async function generatorHistory(equipmentId: string, now: number): Promise<GeneratorHistory> {
  const bucket = Math.floor(now / 60_000); // corridas mudam enquanto o grupo roda: 1 min
  return cached(`utility:generator:v1:${equipmentId}:${bucket}`, 60_000, async () => {
    const since = new Date(now - 90 * DAY);
    const [runs, readiness] = await Promise.all([
      db.generatorRun.findMany({
        where: { equipmentId, startedAt: { gte: since } },
        orderBy: { startedAt: "desc" },
        take: 300,
      }),
      db.$queryRaw<{ ready: number | null }[]>`
        SELECT avg(("values" -> 'pronto' ->> 0)::float8)::float8 AS ready
          FROM utility_readings_5m
         WHERE equipment_id = ${equipmentId}::uuid
           AND ts >= ${new Date(now - 30 * DAY).toISOString()}::timestamp
           AND "values" ? 'pronto'`,
    ]);
    return {
      runs: runs.map((r) => ({
        id: r.externalId,
        startedAt: r.startedAt.getTime(),
        endedAt: r.endedAt?.getTime() ?? null,
        reason: r.reason,
        result: r.result,
        durationSeconds: r.durationSeconds,
        liters: r.liters,
        kwh: r.kwh,
        batteryRest: r.batteryRest,
        batteryMin: r.batteryMin,
        startSeconds: r.startSeconds,
      })),
      readiness30: num(readiness[0]?.ready ?? null),
    };
  });
}

function runView(r: GeneratorHistory["runs"][number]): GeneratorRunView {
  const status = r.endedAt === null ? "running" : runFailed(r) ? "failed" : runTripped(r) ? "tripped" : "ok";
  return {
    id: r.id,
    startedAt: new Date(r.startedAt).toISOString(),
    endedAt: r.endedAt === null ? null : new Date(r.endedAt).toISOString(),
    reason: r.reason,
    result: r.result,
    status,
    durationSeconds: r.durationSeconds,
    liters: r.liters,
    kwh: r.kwh,
    batteryDrop:
      r.batteryRest !== null && r.batteryMin !== null ? Math.max(0, r.batteryRest - r.batteryMin) : null,
    startSeconds: r.startSeconds,
  };
}

async function generatorView(ref: UtilityEquipmentRef, live: AgentLive | null, now: number): Promise<GeneratorView> {
  const current = liveOf(ref, live, now);
  const values = current?.values ?? {};
  const history = await generatorHistory(ref.id, now);
  const estado = num(values.estado);
  return {
    kind: "GENERATOR",
    ...base(ref, current),
    state: current?.online ? generatorStateLabel(estado) : null,
    running: current?.online ? generatorRunning(estado) : false,
    ready: current?.online ? bool(values.pronto) : null,
    dieselPct: num(values.nivel_diesel),
    dieselL: num(values.diesel_litros),
    tankL: numericSetting(ref, "capacidade_tanque_litros"),
    autonomyH: num(values.autonomia_h),
    batteryV: num(values.tensao_bateria),
    powerKw: num(values.potencia),
    nominalKw: numericSetting(ref, "potencia_nominal_kw"),
    daysSinceRun: num(values.dias_sem_teste),
    mainsPresent: bool(values.rede_presente),
    breakerClosed: bool(values.disjuntor_fechado),
    hourMeter: num(values.horimetro),
    stats30: generatorStats(history.runs, now - 30 * DAY),
    readiness30: history.readiness30,
    runs: history.runs.slice(0, 20).map(runView),
  };
}

function base(ref: UtilityEquipmentRef, live: UtilityLive | null) {
  return {
    id: ref.id,
    name: ref.name,
    tag: ref.tag,
    siteId: ref.siteId,
    siteName: ref.siteName,
    timeZone: ref.timeZone,
    live,
    faults: live?.online ? activeFaults(live.values, ref.kind, ref.tagInfo) : [],
    tagInfo: ref.tagInfo,
  };
}

// ---------------------------------------------------------------------------
// Histórico (gráficos)
// ---------------------------------------------------------------------------

export const HISTORY_RANGES = { "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY } as const;
export type HistoryRange = keyof typeof HISTORY_RANGES;

/** Médias por tag, em pontos de 5 min (24 h), 15 min (7 dias) ou 1 h (30 dias). */
export async function getUtilityHistory(
  equipmentId: string,
  tags: string[],
  range: HistoryRange,
  now = Date.now(),
): Promise<{ series: Record<string, [number, number][]>; everyMs: number }> {
  const span = HISTORY_RANGES[range];
  const everyMs = range === "24h" ? 300_000 : range === "7d" ? 900_000 : 3_600_000;
  const interval = range === "24h" ? "5 minutes" : range === "7d" ? "15 minutes" : "1 hour";
  const start = new Date(now - span).toISOString();
  const entries = await Promise.all(
    tags.map(async (tag) => {
      const rows = await db.$queryRaw<{ t: number; v: number }[]>`
        SELECT extract(epoch FROM date_bin(${interval}::interval, ts, TIMESTAMP '2000-01-01'))::float8 * 1000 AS t,
               avg(("values" -> ${tag} ->> 0)::float8)::float8 AS v
          FROM utility_readings_5m
         WHERE equipment_id = ${equipmentId}::uuid
           AND ts >= ${start}::timestamp
           AND "values" ? ${tag}
         GROUP BY 1
         ORDER BY 1`;
      return [tag, rows.map((r) => [Number(r.t), Number(r.v)] as [number, number])] as const;
    }),
  );
  return { series: Object.fromEntries(entries), everyMs };
}

/** Equipamento do cliente (para conferir o acesso nas rotas). */
export function findEquipment(catalog: UtilityCatalog, equipmentId: string): UtilityEquipmentRef | null {
  return catalog.equipment.find((e) => e.id === equipmentId) ?? null;
}
