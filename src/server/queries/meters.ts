import "server-only";
import type { MeterSummary } from "@/components/meters/meter-card";
import { getTenantTopology } from "@/server/telemetry/topology";

/** Unidades e medidores ativos de um cliente, já no formato das telas (vem do cache de cadastro). */
export async function listTenantMeters(tenantId: string): Promise<{
  sites: { id: string; name: string }[];
  meters: MeterSummary[];
}> {
  const sites = await getTenantTopology(tenantId);
  return {
    sites: sites.map((s) => ({ id: s.id, name: s.name })),
    meters: sites.flatMap((site) =>
      site.meters.map((m) => ({
        id: m.id,
        tag: m.tag,
        name: m.name,
        location: m.location,
        siteId: site.id,
        siteName: site.name,
        isMain: m.isMain,
        breakerAmps: m.breakerAmps,
      })),
    ),
  };
}
