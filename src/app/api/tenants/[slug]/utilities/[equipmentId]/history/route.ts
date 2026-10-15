import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { MODULE_BY_KIND } from "@/lib/utilities";
import { authorizeTenantApi, jsonError, NO_STORE_HEADERS } from "@/server/http";
import { getUtilityCatalog, visibleModules } from "@/server/utilities/catalog";
import { findEquipment, getUtilityHistory, HISTORY_RANGES, type HistoryRange } from "@/server/utilities/views";

const tagList = z
  .string()
  .transform((v) => v.split(",").map((t) => t.trim()).filter(Boolean))
  .pipe(z.array(z.string().regex(/^[\w.-]{1,100}$/)).min(1).max(6));

/** Tendência de até 6 tags de um reservatório ou gerador. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tenants/[slug]/utilities/[equipmentId]/history">) {
  const { slug, equipmentId } = await ctx.params;
  const access = await authorizeTenantApi(slug);
  if (!access.ok) return access.response;
  if (!z.uuid().safeParse(equipmentId).success) return jsonError(404, "Equipamento não encontrado");
  const params = request.nextUrl.searchParams;
  const range = (params.get("range") ?? "24h") as HistoryRange;
  if (!(range in HISTORY_RANGES)) return jsonError(400, "Período inválido");
  const tags = tagList.safeParse(params.get("tags") ?? "");
  if (!tags.success) return jsonError(400, "Informe de 1 a 6 grandezas");

  const { tenant } = access.context;
  const equipment = findEquipment(await getUtilityCatalog(tenant.id), equipmentId);
  if (!equipment || !(await visibleModules(tenant)).includes(MODULE_BY_KIND[equipment.kind])) {
    return jsonError(404, "Equipamento não encontrado");
  }
  return NextResponse.json(await getUtilityHistory(equipment.id, tags.data, range), { headers: NO_STORE_HEADERS });
}
