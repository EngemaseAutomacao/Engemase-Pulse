import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { historyParams, searchParamsObject } from "@/lib/api-contracts";
import { resolveCustomRange, resolveHistoryRange } from "@/lib/time-range";
import { authorizeTenantApi, jsonError, NO_STORE_HEADERS } from "@/server/http";
import { findTenantMeter, getMeterHistory } from "@/server/telemetry/service";

/** Série histórica (média por janela) dos campos pedidos de um medidor. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/tenants/[slug]/meters/[meterId]/history">,
) {
  const { slug, meterId } = await ctx.params;
  const access = await authorizeTenantApi(slug);
  if (!access.ok) return access.response;

  const params = historyParams.safeParse(searchParamsObject(request.nextUrl.searchParams));
  if (!params.success) return jsonError(400, z.prettifyError(params.error));

  const meter = z.uuid().safeParse(meterId).success
    ? await findTenantMeter(access.context.tenant.id, meterId)
    : null;
  if (!meter) return jsonError(404, "Medidor não encontrado");

  const { fields, range, from, to } = params.data;
  const resolved = range ? resolveHistoryRange(range, new Date()) : resolveCustomRange(from!, to!);
  const result = await getMeterHistory(meter, fields, resolved);

  return NextResponse.json(
    {
      series: result.data,
      error: result.error,
      start: resolved.start.toISOString(),
      stop: resolved.stop.toISOString(),
      every: resolved.every,
    },
    { headers: NO_STORE_HEADERS },
  );
}
