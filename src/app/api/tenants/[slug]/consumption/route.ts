import { NextResponse, type NextRequest } from "next/server";
import { consumptionParams, searchParamsObject } from "@/lib/api-contracts";
import { authorizeTenantApi, jsonError, NO_STORE_HEADERS } from "@/server/http";
import { getSiteMonthConsumption } from "@/server/queries/billing";
import { getSiteDayConsumption } from "@/server/queries/consumption";

/**
 * Consumo de uma unidade por setor, no fuso da unidade: num dia (`date`, hora
 * a hora; `grandeza=aparente` para kVAh) ou num mês (`month`, dia a dia, com
 * custo e comparações).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tenants/[slug]/consumption">) {
  const { slug } = await ctx.params;
  const access = await authorizeTenantApi(slug);
  if (!access.ok) return access.response;

  const params = consumptionParams.safeParse(searchParamsObject(request.nextUrl.searchParams));
  if (!params.success) return jsonError(400, "Unidade ou data inválida");

  const { tenant } = access.context;
  const data =
    "date" in params.data
      ? await getSiteDayConsumption(
          tenant.id,
          params.data.site,
          params.data.date,
          params.data.grandeza === "aparente" ? "APPARENT" : "ACTIVE",
        )
      : await getSiteMonthConsumption(tenant.id, params.data.site, params.data.month);
  if (!data) return jsonError(404, "Unidade não encontrada");
  return NextResponse.json(data, { headers: NO_STORE_HEADERS });
}
