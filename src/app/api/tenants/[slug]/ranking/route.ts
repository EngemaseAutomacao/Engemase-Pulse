import { NextResponse, type NextRequest } from "next/server";
import { calendarMonth } from "@/lib/api-contracts";
import { authorizeTenantApi, jsonError, NO_STORE_HEADERS } from "@/server/http";
import { getStoreRanking } from "@/server/queries/ranking";

/** Lojas do cliente comparadas num mês. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tenants/[slug]/ranking">) {
  const { slug } = await ctx.params;
  const access = await authorizeTenantApi(slug);
  if (!access.ok) return access.response;
  const month = calendarMonth.safeParse(request.nextUrl.searchParams.get("month"));
  if (!month.success) return jsonError(400, "Mês inválido");
  const data = await getStoreRanking(access.context.tenant.id, month.data);
  return NextResponse.json(data, { headers: NO_STORE_HEADERS });
}
