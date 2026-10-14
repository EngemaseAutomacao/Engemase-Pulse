import { NextResponse, type NextRequest } from "next/server";
import { consumptionParams, searchParamsObject } from "@/lib/api-contracts";
import { authorizeTenantApi, jsonError, NO_STORE_HEADERS } from "@/server/http";
import { getSiteDayConsumption } from "@/server/queries/consumption";

/** Consumo de uma unidade num dia, hora a hora e por setor (no fuso da unidade). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tenants/[slug]/consumption">) {
  const { slug } = await ctx.params;
  const access = await authorizeTenantApi(slug);
  if (!access.ok) return access.response;

  const params = consumptionParams.safeParse(searchParamsObject(request.nextUrl.searchParams));
  if (!params.success) return jsonError(400, "Unidade ou data inválida");

  const data = await getSiteDayConsumption(access.context.tenant.id, params.data.site, params.data.date);
  if (!data) return jsonError(404, "Unidade não encontrada");
  return NextResponse.json(data, { headers: NO_STORE_HEADERS });
}
