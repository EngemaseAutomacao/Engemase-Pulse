import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { UTILITY_MODULES } from "@/lib/utilities";
import { authorizeTenantApi, jsonError, NO_STORE_HEADERS } from "@/server/http";
import { visibleModules } from "@/server/utilities/catalog";
import { getUtilitiesView } from "@/server/utilities/views";

/** Reservatórios (?module=agua) ou geradores (?module=gerador) do cliente, ao vivo e com os indicadores. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tenants/[slug]/utilities">) {
  const { slug } = await ctx.params;
  const access = await authorizeTenantApi(slug);
  if (!access.ok) return access.response;
  const params = request.nextUrl.searchParams;
  const chosen = z.enum(UTILITY_MODULES).safeParse(params.get("module"));
  if (!chosen.success) return jsonError(400, "Módulo inválido");
  const site = params.get("site");
  if (site && !z.uuid().safeParse(site).success) return jsonError(400, "Unidade inválida");
  const { tenant } = access.context;
  if (!(await visibleModules(tenant)).includes(chosen.data)) return jsonError(404, "Módulo não disponível");
  return NextResponse.json(await getUtilitiesView(tenant.id, chosen.data, site ?? undefined), { headers: NO_STORE_HEADERS });
}
