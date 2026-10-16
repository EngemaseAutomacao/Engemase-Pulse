import { NextResponse } from "next/server";
import type { TvResponse } from "@/lib/telemetry-types";
import { authorizeTenantApi, NO_STORE_HEADERS } from "@/server/http";
import { countActiveAlarms, listActiveAlarms } from "@/server/queries/alarms";
import { getSiteDayConsumption } from "@/server/queries/consumption";
import { getTenantTopology } from "@/server/telemetry/topology";
import { meterLabel } from "@/lib/meter-label";

/** Dados da tela de TV que mudam devagar: alarmes abertos e o consumo de hoje por setor. */
export async function GET(_request: Request, ctx: RouteContext<"/api/tenants/[slug]/tv">) {
  const { slug } = await ctx.params;
  const access = await authorizeTenantApi(slug);
  if (!access.ok) return access.response;
  const tenantId = access.context.tenant.id;
  const sites = (await getTenantTopology(tenantId)).filter((s) => s.meters.length > 0);
  const now = new Date();
  const [alarms, alarmCount, days] = await Promise.all([
    listActiveAlarms(tenantId, 12),
    countActiveAlarms(tenantId),
    Promise.all(
      sites.map((site) =>
        getSiteDayConsumption(
          tenantId,
          site.id,
          new Intl.DateTimeFormat("en-CA", { timeZone: site.timezone }).format(now),
        ).then((day) => ({ site, day })),
      ),
    ),
  ]);
  const body: TvResponse = {
    alarms: alarms.map((a) => ({
      id: a.id,
      severity: a.severity,
      title: a.title,
      message: a.message,
      startedAt: a.startedAt.toISOString(),
      acknowledged: a.acknowledgedAt !== null,
    })),
    alarmCount,
    today: days.map(({ site, day }) => ({
      siteId: site.id,
      siteName: site.name,
      total: day?.entrance.total ?? 0,
      sectors: (day?.sectors ?? [])
        .filter((s) => !s.isMain && s.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 8)
        .map((s) => ({ id: s.id, label: meterLabel(s), kwh: s.total })),
    })),
    fetchedAt: now.toISOString(),
  };
  return NextResponse.json(body, { headers: NO_STORE_HEADERS });
}
