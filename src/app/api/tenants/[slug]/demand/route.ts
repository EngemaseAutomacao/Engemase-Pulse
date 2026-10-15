import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeTenantApi, jsonError, NO_STORE_HEADERS } from "@/server/http";
import { getTenantDemandNow } from "@/server/demand-now";

/** Demanda da janela de 15 min em andamento das unidades com tarifa verde ou azul. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tenants/[slug]/demand">) {
  const { slug } = await ctx.params;
  const access = await authorizeTenantApi(slug);
  if (!access.ok) return access.response;
  const site = request.nextUrl.searchParams.get("site");
  if (site && !z.uuid().safeParse(site).success) return jsonError(400, "Unidade inválida");
  const sites = await getTenantDemandNow(access.context.tenant.id, site ?? undefined);
  return NextResponse.json({ sites }, { headers: NO_STORE_HEADERS });
}
