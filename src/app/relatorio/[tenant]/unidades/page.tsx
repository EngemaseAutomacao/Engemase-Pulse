import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Kpi, ReportSection, ReportShell } from "@/components/report/report-shell";
import { formatChange, formatMoney, formatNumber } from "@/lib/format";
import { metricValue, rankStores } from "@/lib/ranking";
import { PF_MINIMUM } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { requireTenant } from "@/server/auth/dal";
import { getStoreRanking } from "@/server/queries/ranking";
import { reportContext, resolveReportMonth } from "@/server/reports/context";

export const metadata: Metadata = { title: "Comparativo entre unidades" };

/** Todas as unidades do cliente lado a lado no mês, para imprimir ou salvar em PDF. */
export default function UnitsReportPage(props: PageProps<"/relatorio/[tenant]/unidades">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted-foreground">Montando o relatório…</p>}>
      <Report {...props} />
    </Suspense>
  );
}

async function Report({ params, searchParams }: PageProps<"/relatorio/[tenant]/unidades">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const search = await searchParams;
  const { energySites, available } = await reportContext(tenant);
  if (energySites.length === 0) notFound();
  const tz = energySites[0].timezone;
  const r = resolveReportMonth(search.mes, tz);
  const ranking = await getStoreRanking(tenant.id, r.month);
  const stores = rankStores(ranking.stores, "kwh").reverse(); // maior consumo primeiro
  const total = stores.reduce((s, x) => s + x.kwh, 0);
  const totalPrevious = stores.every((s) => s.kwhPrevious !== null)
    ? stores.reduce((s, x) => s + (x.kwhPrevious ?? 0), 0)
    : null;
  const withCost = stores.filter((s) => s.cost !== null);
  const totalCost = withCost.reduce((s, x) => s + (x.cost ?? 0), 0);
  const withArea = stores.filter((s) => metricValue(s, "kwhPerM2") !== null);
  const best = rankStores(withArea, "kwhPerM2")[0] ?? null;
  const worst = rankStores(withArea, "kwhPerM2").at(-1) ?? null;
  const maxKwh = Math.max(1, ...stores.map((s) => s.kwh));
  const anyArea = withArea.length > 0;
  const anyCost = withCost.length > 0;

  return (
    <ReportShell
      tenant={tenant}
      kind="unidades"
      available={available}
      subtitle={`${stores.length} unidades`}
      month={r.month}
      maxMonth={r.maxMonth}
      title={`Comparativo entre unidades — ${r.name}`}
      inProgress={ranking.partial}
      timeZone={tz}
      footer={
        <>
          Consumo da entrada geral de cada unidade (ou a soma dos medidores, sem entrada geral). Custo pela fatura
          estimada, só nas unidades com tarifa cadastrada; kWh/m² só com a área cadastrada.{" "}
          {ranking.partial && "Mês em andamento: a variação compara com o mesmo trecho do mês anterior."}
        </>
      }
    >
      <section className="report-card grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label={ranking.partial ? "Consumo até agora" : "Consumo das unidades"}
          value={`${formatNumber(total, 0)} kWh`}
          detail={
            formatChange(total, totalPrevious)
              ? `${formatChange(total, totalPrevious)} vs. mês anterior`
              : "sem base no mês anterior"
          }
        />
        <Kpi
          label="Custo estimado"
          value={anyCost ? formatMoney(totalCost, true) : "—"}
          detail={anyCost ? `${withCost.length} de ${stores.length} unidades com tarifa` : "nenhuma tarifa cadastrada"}
        />
        <Kpi
          label="Mais eficiente"
          value={best ? best.siteName : "—"}
          detail={best ? `${formatNumber(metricValue(best, "kwhPerM2"), 1)} kWh/m²` : "cadastre a área das unidades"}
        />
        <Kpi
          label="Menos eficiente"
          value={worst && worst !== best ? worst.siteName : "—"}
          detail={worst && worst !== best ? `${formatNumber(metricValue(worst, "kwhPerM2"), 1)} kWh/m²` : ""}
        />
      </section>

      <ReportSection title="Unidades lado a lado" note="Do maior para o menor consumo.">
        <table className="w-full border-collapse text-left">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 font-medium">Unidade</th>
              <th className="py-1.5 text-right font-medium">kWh</th>
              <th className="w-24 py-1.5 font-medium print:w-20" aria-label="Participação" />
              <th className="py-1.5 text-right font-medium">vs. mês anterior</th>
              {anyArea && <th className="py-1.5 text-right font-medium">kWh/m²</th>}
              {anyCost && <th className="py-1.5 text-right font-medium">Custo</th>}
              <th className="py-1.5 text-right font-medium">FP</th>
              <th className="py-1.5 text-right font-medium">Demanda</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stores.map((s) => {
              const ratio = metricValue(s, "demandRatio");
              return (
                <tr key={s.siteId}>
                  <td className="py-1.5">
                    {s.siteName}
                    {s.noMainMeter && <span className="ml-1 text-xs text-muted-foreground">(sem entrada geral)</span>}
                  </td>
                  <td className="py-1.5 text-right tabular">{formatNumber(s.kwh, 0)}</td>
                  <td className="py-1.5 pl-3">
                    <span className="block h-2 rounded-sm bg-muted" aria-hidden>
                      <span
                        className="block h-full rounded-sm bg-primary"
                        style={{ width: `${(s.kwh / maxKwh) * 100}%` }}
                      />
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground tabular">
                    {formatChange(s.kwh, s.kwhPrevious) ?? "—"}
                  </td>
                  {anyArea && (
                    <td className="py-1.5 text-right tabular">{formatNumber(metricValue(s, "kwhPerM2"), 1)}</td>
                  )}
                  {anyCost && <td className="py-1.5 text-right tabular">{formatMoney(s.cost, true)}</td>}
                  <td
                    className={cn(
                      "py-1.5 text-right tabular",
                      s.powerFactor !== null && s.powerFactor < PF_MINIMUM && "text-destructive",
                    )}
                  >
                    {formatNumber(s.powerFactor, 3)}
                  </td>
                  <td className={cn("py-1.5 text-right tabular", ratio !== null && ratio > 105 && "text-destructive")}>
                    {s.maxDemand === null ? "—" : `${formatNumber(s.maxDemand, 0)} kW`}
                    {ratio !== null && (
                      <span className="ml-1 text-xs text-muted-foreground">({formatNumber(ratio, 0)} %)</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t font-medium">
            <tr>
              <td className="py-1.5">Total</td>
              <td className="py-1.5 text-right tabular">{formatNumber(total, 0)}</td>
              <td />
              <td className="py-1.5 text-right tabular">{formatChange(total, totalPrevious) ?? "—"}</td>
              {anyArea && <td />}
              {anyCost && <td className="py-1.5 text-right tabular">{formatMoney(totalCost, true)}</td>}
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
        <p className="text-xs text-muted-foreground">
          FP: fator de potência médio do mês (pela fatura estimada). Demanda: a maior do mês e, entre parênteses, quanto
          ela é da contratada.
        </p>
      </ReportSection>
    </ReportShell>
  );
}
