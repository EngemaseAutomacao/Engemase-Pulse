import "server-only";
import { cached, configTtlMs, getCache } from "@/server/cache";
import { db } from "@/server/db";

/**
 * "Topologia" de um cliente: unidades (com a configuração de telemetria) e
 * medidores ativos. É lida a cada atualização das telas e pelo avaliador de
 * alarmes, então fica em cache e é invalidada quando a administração altera algo.
 */

export type MeterTopology = {
  id: string;
  tag: string;
  name: string;
  location: string | null;
  siteId: string;
  influxMeasurement: string;
  influxTagKey: string | null;
  influxTagValue: string | null;
};

export type SiteTopology = {
  id: string;
  name: string;
  timezone: string;
  telemetrySource: "INFLUXDB" | "SIMULATED";
  influxUrl: string | null;
  influxOrg: string | null;
  influxBucket: string | null;
  influxRollupBucket: string | null;
  /** Cifrado (AES-256-GCM); só é decifrado na hora da consulta. */
  influxTokenEncrypted: string | null;
  meters: MeterTopology[];
};

const topologyKey = (tenantId: string) => `topology:v1:${tenantId}`;

export function getTenantTopology(tenantId: string): Promise<SiteTopology[]> {
  return cached(topologyKey(tenantId), configTtlMs(), () => loadTopology(tenantId));
}

export async function invalidateTenantTopology(...tenantIds: string[]): Promise<void> {
  await getCache().del(...tenantIds.map(topologyKey));
}

async function loadTopology(tenantId: string): Promise<SiteTopology[]> {
  const sites = await db.site.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      timezone: true,
      telemetrySource: true,
      influxUrl: true,
      influxOrg: true,
      influxBucket: true,
      influxRollupBucket: true,
      influxTokenEncrypted: true,
      meters: {
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { tag: "asc" }],
        select: {
          id: true,
          tag: true,
          name: true,
          location: true,
          siteId: true,
          influxMeasurement: true,
          influxTagKey: true,
          influxTagValue: true,
        },
      },
    },
  });
  return sites;
}
