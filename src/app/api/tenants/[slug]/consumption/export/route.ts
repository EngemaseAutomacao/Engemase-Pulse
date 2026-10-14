import type { NextRequest } from "next/server";
import { z } from "zod";
import { calendarMonth } from "@/lib/api-contracts";
import { tableToCsv } from "@/server/csv-export";
import { authorizeTenantApi, jsonError } from "@/server/http";
import { getSiteMonthConsumption } from "@/server/queries/billing";
import { getTenantTopology } from "@/server/telemetry/topology";

const params = z.object({ site: z.uuid(), month: calendarMonth });

/**
 * Consumo do mês por setor e por dia, em planilha (padrão do Excel em
 * português: ";" e vírgula decimal). Uma linha por dia, uma coluna por setor,
 * e no fim o total e o custo de cada setor.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tenants/[slug]/consumption/export">) {
  const { slug } = await ctx.params;
  const access = await authorizeTenantApi(slug);
  if (!access.ok) return access.response;

  const parsed = params.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return jsonError(400, "Unidade ou mês inválido");
  const { tenant } = access.context;
  const data = await getSiteMonthConsumption(tenant.id, parsed.data.site, parsed.data.month);
  if (!data) return jsonError(404, "Unidade não encontrada");
  if (data.error) return jsonError(502, data.error);

  const site = (await getTenantTopology(tenant.id)).find((s) => s.id === data.siteId);
  const feeders = data.entrance.fromMain ? data.sectors.filter((s) => !s.isMain) : data.sectors;
  const dateFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: data.timeZone, dateStyle: "short" });
  const headers = [
    "Data",
    ...feeders.map((s) => `${s.tag} ${s.name} (kWh)`),
    ...(data.unmeasured ? ["Não medido (kWh)"] : []),
    data.entrance.fromMain ? "Entrada geral (kWh)" : "Total (kWh)",
  ];
  const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
  const rows: (string | number | null)[][] = data.days.map((day, i) => [
    dateFormat.format(day),
    ...feeders.map((s) => r2(s.kwh[i])),
    ...(data.unmeasured ? [r2(data.unmeasured.kwh[i])] : []),
    r2(data.entrance.kwh[i]),
  ]);
  rows.push([
    "Total",
    ...feeders.map((s) => r2(s.total)),
    ...(data.unmeasured ? [r2(data.unmeasured.total)] : []),
    r2(data.entrance.total),
  ]);
  if (data.hasTariff) {
    rows.push([
      "Custo da energia (R$)",
      ...feeders.map((s) => r2(s.cost)),
      ...(data.unmeasured ? [r2(data.unmeasured.cost)] : []),
      r2(data.entrance.cost),
    ]);
  }

  const name = `consumo_${tenant.slug}_${site?.name ?? "unidade"}_${data.month}.csv`;
  return new Response(tableToCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name.normalize("NFD").replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
