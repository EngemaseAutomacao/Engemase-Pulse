import type { NextRequest } from "next/server";
import { z } from "zod";
import { historyParams, searchParamsObject } from "@/lib/api-contracts";
import { FIELD_BY_KEY } from "@/lib/meter-fields";
import { resolveCustomRange, resolveHistoryRange } from "@/lib/time-range";
import { authorizeTenantApi, jsonError } from "@/server/http";
import { findTenantMeter, getMeterHistory } from "@/server/telemetry/service";
import { toCsv } from "@/server/csv-export";

/**
 * Exporta o histórico em CSV no padrão do Excel em português
 * (separador ";", vírgula decimal, UTF-8 com BOM). Exige papel de operador.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/tenants/[slug]/meters/[meterId]/export">,
) {
  const { slug, meterId } = await ctx.params;
  const access = await authorizeTenantApi(slug, "OPERATOR");
  if (!access.ok) return access.response;

  const params = historyParams.safeParse(searchParamsObject(request.nextUrl.searchParams));
  if (!params.success) return jsonError(400, z.prettifyError(params.error));

  const meter = z.uuid().safeParse(meterId).success
    ? await findTenantMeter(access.context.tenant.id, meterId)
    : null;
  if (!meter) return jsonError(404, "Medidor não encontrado");

  const { fields, range, from, to } = params.data;
  const resolved = range ? resolveHistoryRange(range, new Date()) : resolveCustomRange(from!, to!);
  const { data, error } = await getMeterHistory(meter, fields, resolved);
  if (error) return jsonError(502, error);

  const headers = ["Data/hora", ...fields.map((f) => {
    const field = FIELD_BY_KEY.get(f);
    return field?.unit ? `${field.label} (${field.unit})` : (field?.label ?? f);
  })];
  const csv = toCsv(headers, data, fields, meter.site.timezone);
  const fileName = `${meter.tag}_${resolved.start.toISOString().slice(0, 10)}_${resolved.stop.toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
