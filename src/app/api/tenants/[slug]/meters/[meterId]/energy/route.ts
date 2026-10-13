import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { energyParams, searchParamsObject } from "@/lib/api-contracts";
import { energyBucketStarts } from "@/lib/time-range";
import { authorizeTenantApi, jsonError, NO_STORE_HEADERS } from "@/server/http";
import { findTenantMeter, getMeterEnergy } from "@/server/telemetry/service";

/** Consumo de energia (kWh) por hora, dia ou mês, no fuso da unidade. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/tenants/[slug]/meters/[meterId]/energy">,
) {
  const { slug, meterId } = await ctx.params;
  const access = await authorizeTenantApi(slug);
  if (!access.ok) return access.response;

  const params = energyParams.safeParse(searchParamsObject(request.nextUrl.searchParams));
  if (!params.success) return jsonError(400, "Período inválido");

  const meter = z.uuid().safeParse(meterId).success
    ? await findTenantMeter(access.context.tenant.id, meterId)
    : null;
  if (!meter) return jsonError(404, "Medidor não encontrado");

  const { data, error } = await getMeterEnergy(meter, params.data.period);
  const byStart = new Map(data.buckets.map((b) => [b.start, b.kwh]));

  return NextResponse.json(
    {
      interval: data.window.interval,
      timeZone: data.window.timeZone,
      // Eixo completo do período; janelas sem dado ficam null.
      buckets: energyBucketStarts(data.window).map((start) => ({
        start: start.getTime(),
        kwh: byStart.get(start.getTime()) ?? null,
      })),
      totalKwh: data.buckets.reduce((sum, b) => sum + b.kwh, 0),
      error,
    },
    { headers: NO_STORE_HEADERS },
  );
}
