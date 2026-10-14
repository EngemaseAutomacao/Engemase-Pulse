import "server-only";
import { createHash } from "node:crypto";
import type { AgentEquipment } from "@/lib/agent-payload";
import { audit } from "@/server/audit";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";
import { invalidateTenantTopology } from "@/server/telemetry/topology";
import type { AgentSite } from "./token";

/**
 * Medidores das unidades com Painel local nascem e se atualizam a partir da
 * lista de equipamentos que o Painel envia: o cadastro da loja (nome, entrada
 * geral, disjuntor, endereço) é a referência. Só equipamentos do grupo
 * "energia" viram medidor; CLP, reservatório e gerador ficam para depois.
 *
 * A lista chega a cada envio, mas quase nunca muda: uma assinatura dela fica
 * em cache e o banco só é tocado quando a assinatura muda.
 */

/** id do equipamento no Painel → id do medidor. */
export type MeterIndex = Record<string, string>;

type CachedIndex = { signature: string; meters: MeterIndex };

const INDEX_TTL_MS = 24 * 3_600_000;
const indexKey = (siteId: string) => `agent:meters:v1:${siteId}`;

export const isEnergyEquipment = (e: AgentEquipment) => (e.grupo ?? "energia") === "energia";

function signatureOf(equipment: AgentEquipment[]): string {
  const relevant = equipment.map((e) => [
    e.id,
    e.nome,
    e.tag_isa ?? null,
    Boolean(e.principal),
    e.disjuntor_a ?? null,
    e.endereco ?? null,
    e.perfil ?? null,
  ]);
  return createHash("sha256").update(JSON.stringify(relevant)).digest("hex");
}

/** Índice dos medidores, sincronizando o cadastro se a lista de equipamentos mudou. */
export async function ensureAgentMeters(site: AgentSite, equipment: AgentEquipment[]): Promise<MeterIndex> {
  const energy = equipment.filter(isEnergyEquipment);
  const signature = signatureOf(energy);
  const cache = getCache();
  const current = await cache.get<CachedIndex>(indexKey(site.id));
  if (current?.signature === signature) return current.meters;

  const meters = await syncMeters(site, energy);
  await cache.set(indexKey(site.id), { signature, meters }, INDEX_TTL_MS);
  return meters;
}

/** Depois de alterar ou apagar medidores na administração. */
export async function invalidateAgentMeterIndex(...siteIds: string[]): Promise<void> {
  if (siteIds.length > 0) await getCache().del(...siteIds.map(indexKey));
}

/** Índice sem sincronizar (envios só de histórico, sem a lista de equipamentos). */
export async function loadAgentMeterIndex(siteId: string): Promise<MeterIndex> {
  const cache = getCache();
  const current = await cache.get<CachedIndex>(indexKey(siteId));
  if (current) return current.meters;
  const rows = await db.meter.findMany({
    where: { siteId, externalId: { not: null } },
    select: { id: true, externalId: true },
  });
  const meters = Object.fromEntries(rows.map((m) => [m.externalId!, m.id]));
  // Assinatura vazia: o próximo envio com a lista de equipamentos sincroniza de verdade.
  await cache.set(indexKey(siteId), { signature: "", meters }, INDEX_TTL_MS);
  return meters;
}

async function syncMeters(site: AgentSite, energy: AgentEquipment[]): Promise<MeterIndex> {
  const existing = await db.meter.findMany({
    where: { siteId: site.id },
    select: { id: true, tag: true, externalId: true, name: true, isMain: true, breakerAmps: true, modbusAddress: true },
  });
  const byExternalId = new Map(existing.filter((m) => m.externalId).map((m) => [m.externalId!, m]));
  const usedTags = new Set(existing.map((m) => m.tag));
  const index: MeterIndex = {};
  let changed = false;

  for (const [position, e] of energy.entries()) {
    const data = {
      name: e.nome,
      isMain: Boolean(e.principal),
      breakerAmps: e.disjuntor_a ?? null,
      modbusAddress: e.endereco ?? null,
    };
    const current = byExternalId.get(e.id);
    if (current) {
      index[e.id] = current.id;
      const differs = (Object.keys(data) as (keyof typeof data)[]).some((k) => current[k] !== data[k]);
      if (differs) {
        await db.meter.update({ where: { id: current.id }, data });
        changed = true;
      }
      continue;
    }

    const tag = uniqueTag(e.tag_isa || e.id, usedTags);
    usedTags.add(tag);
    const meter = await db.meter.upsert({
      where: { siteId_externalId: { siteId: site.id, externalId: e.id } },
      create: {
        siteId: site.id,
        externalId: e.id,
        influxMeasurement: e.id,
        tag,
        model: e.perfil ?? null,
        sortOrder: position,
        ...data,
      },
      update: data,
      select: { id: true },
    });
    index[e.id] = meter.id;
    changed = true;
    await audit({
      actorId: null,
      action: "create",
      entityType: "meter",
      entityId: meter.id,
      details: { origem: "painel-local", equipamento: e.id, nome: e.nome, tag },
    });
  }

  if (changed) await invalidateTenantTopology(site.tenantId);
  return index;
}

/** TAG livre na unidade: "QD-02", ou "QD-02 (2)" se já existir. */
function uniqueTag(base: string, used: Set<string>): string {
  const tag = base.slice(0, 40);
  if (!used.has(tag)) return tag;
  for (let n = 2; ; n++) {
    const candidate = `${tag.slice(0, 34)} (${n})`;
    if (!used.has(candidate)) return candidate;
  }
}
