import "server-only";
import type { RankingResponse, StoreRank } from "@/lib/ranking";
import { db } from "@/server/db";
import { getSiteBilling, getSiteMonthConsumption } from "@/server/queries/billing";
import { getTenantTopology } from "@/server/telemetry/topology";

/** As lojas do cliente lado a lado num mês: consumo, custo, eficiência por m², FP e demanda. */
export async function getStoreRanking(tenantId: string, month: string, now = new Date()): Promise<RankingResponse> {
  const sites = (await getTenantTopology(tenantId)).filter((s) => s.meters.length > 0);
  const areas = new Map(
    (await db.site.findMany({ where: { tenantId }, select: { id: true, areaM2: true } })).map((s) => [s.id, s.areaM2]),
  );
  let partial = false;
  const stores = await Promise.all(
    sites.map(async (site): Promise<StoreRank> => {
      const [consumption, billing] = await Promise.all([
        getSiteMonthConsumption(tenantId, site.id, month, now),
        getSiteBilling(tenantId, site.id, month, now),
      ]);
      if (consumption?.comparison.partial) partial = true;
      const bill = billing && "bill" in billing ? billing : null;
      const mainDemand = bill?.bill.demand.find((d) => d.period !== "peak") ?? null;
      return {
        siteId: site.id,
        siteName: site.name,
        areaM2: areas.get(site.id) ?? null,
        kwh: consumption?.entrance.total ?? 0,
        kwhPrevious: consumption?.entrance.previousTotal ?? null,
        cost: bill ? bill.bill.total : null,
        costProjected: bill ? (bill.bill.projection?.total ?? bill.bill.total) : null,
        powerFactor: bill?.bill.averagePowerFactor ?? null,
        maxDemand: mainDemand?.measured ?? null,
        contracted: mainDemand?.contracted ?? null,
        hasTariff: bill !== null,
        noMainMeter: !site.meters.some((m) => m.isMain),
      };
    }),
  );
  return { month, partial, stores };
}
