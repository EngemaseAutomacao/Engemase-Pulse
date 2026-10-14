import { NextResponse, type NextRequest } from "next/server";
import { billingParams, searchParamsObject } from "@/lib/api-contracts";
import { authorizeTenantApi, jsonError, NO_STORE_HEADERS } from "@/server/http";
import { getSiteBilling } from "@/server/queries/billing";

/** Fatura estimada de uma unidade num mês (energia por posto, demanda, ultrapassagem, reativo). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tenants/[slug]/billing">) {
  const { slug } = await ctx.params;
  const access = await authorizeTenantApi(slug);
  if (!access.ok) return access.response;

  const params = billingParams.safeParse(searchParamsObject(request.nextUrl.searchParams));
  if (!params.success) return jsonError(400, "Unidade ou mês inválido");

  const data = await getSiteBilling(access.context.tenant.id, params.data.site, params.data.month);
  if (!data) return jsonError(404, "Unidade não encontrada");
  return NextResponse.json(data, { headers: NO_STORE_HEADERS });
}
