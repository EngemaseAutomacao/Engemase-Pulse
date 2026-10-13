import { NextResponse, type NextRequest } from "next/server";
import { liveParams, searchParamsObject } from "@/lib/api-contracts";
import { authorizeTenantApi, jsonError, NO_STORE_HEADERS } from "@/server/http";
import { getTenantLive } from "@/server/telemetry/service";

/** Última leitura dos medidores do cliente (todos, de uma unidade ou de um medidor). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tenants/[slug]/live">) {
  const { slug } = await ctx.params;
  const access = await authorizeTenantApi(slug);
  if (!access.ok) return access.response;

  const params = liveParams.safeParse(searchParamsObject(request.nextUrl.searchParams));
  if (!params.success) return jsonError(400, "Parâmetros inválidos");

  const { site, meter, view } = params.data;
  const snapshot = await getTenantLive(access.context.tenant.id, {
    siteId: site,
    meterId: meter,
    fields: meter || view === "full" ? "all" : "summary",
  });
  return NextResponse.json(snapshot, { headers: NO_STORE_HEADERS });
}
