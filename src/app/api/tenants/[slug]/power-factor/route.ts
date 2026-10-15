import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeTenantApi, jsonError, NO_STORE_HEADERS } from "@/server/http";
import { getPowerFactorAnalysis } from "@/server/queries/power-factor";

/** Fator de potência da entrada (30 dias) e o banco de capacitores recomendado. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tenants/[slug]/power-factor">) {
  const { slug } = await ctx.params;
  const access = await authorizeTenantApi(slug);
  if (!access.ok) return access.response;
  const site = z.uuid().safeParse(request.nextUrl.searchParams.get("site"));
  if (!site.success) return jsonError(400, "Unidade inválida");
  const data = await getPowerFactorAnalysis(access.context.tenant.id, site.data);
  if (!data) return jsonError(404, "Unidade não encontrada");
  return NextResponse.json(data, { headers: NO_STORE_HEADERS });
}
