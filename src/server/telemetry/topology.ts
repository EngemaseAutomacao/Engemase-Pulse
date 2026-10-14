import "server-only";
import { cached, configTtlMs, getCache } from "@/server/cache";
import { db } from "@/server/db";

/**
 * "Topologia" de um cliente: unidades e medidores ativos. É lida a cada atualização das telas e pelo avaliador de
 * alarmes, então fica em cache e é invalidada quando a administração altera algo.
 */

export type MeterTopology = {
  id: string;
  tag: string;
  name: string;
  location: string | null;
  siteId: string;
  /** Entrada geral da unidade (os demais medidores são alimentadores dela). */
  isMain: boolean;
};

export type SiteTopology = {
  id: string;
  name: string;
  timezone: string;
  meters: MeterTopology[];
};

const topologyKey = (tenantId: string) => `topology:v3:${tenantId}`;

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
      meters: {
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { tag: "asc" }],
        select: {
          id: true,
          tag: true,
          name: true,
          location: true,
          siteId: true,
          isMain: true,
        },
      },
    },
  });
  return sites;
}
