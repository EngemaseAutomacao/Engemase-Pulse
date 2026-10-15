import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";
import type { Reading } from "@/server/telemetry/types";
import type { UtilityReading } from "./utilities";

/**
 * Última leitura enviada pelo Painel local de cada unidade.
 *
 * Com Redis, fica só no cache: o Painel envia a cada ~10 s e gravar isso no
 * Postgres manteria o banco acordado o tempo todo. Sem Redis, cada instância
 * do servidor tem a própria memória, então a leitura vai para o banco (é o
 * único lugar que todas as instâncias enxergam).
 */

export type AgentLive = {
  receivedAt: string;
  /** Por id do medidor. */
  readings: Record<string, Reading>;
  /** Por id do equipamento de água ou gerador (ausente em leitura gravada antes dos módulos). */
  utilities?: Record<string, UtilityReading>;
};

/** Painel parado continua aparecendo (como "sem comunicação") por um dia. */
const LIVE_TTL_MS = 24 * 3_600_000;

const liveKey = (siteId: string) => `agent:live:v1:${siteId}`;

export async function writeAgentLive(siteId: string, live: AgentLive): Promise<void> {
  const cache = getCache();
  if (cache.shared) {
    await cache.set(liveKey(siteId), live, LIVE_TTL_MS);
    return;
  }
  const data = {
    receivedAt: new Date(live.receivedAt),
    readings: live.readings as unknown as Prisma.InputJsonValue,
    utilities: (live.utilities ?? {}) as unknown as Prisma.InputJsonValue,
  };
  await db.siteLiveSnapshot.upsert({ where: { siteId }, create: { siteId, ...data }, update: data });
}

export async function readAgentLive(siteId: string): Promise<AgentLive | null> {
  const cache = getCache();
  if (cache.shared) return cache.get<AgentLive>(liveKey(siteId));
  const row = await db.siteLiveSnapshot.findUnique({ where: { siteId } });
  if (!row || Date.now() - row.receivedAt.getTime() > LIVE_TTL_MS) return null;
  return {
    receivedAt: row.receivedAt.toISOString(),
    readings: row.readings as unknown as Record<string, Reading>,
    utilities: (row.utilities ?? {}) as unknown as Record<string, UtilityReading>,
  };
}
