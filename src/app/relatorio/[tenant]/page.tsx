import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DailyBarsSvg } from "@/components/report/daily-bars-svg";
import { AlarmsTable, Kpi, ReportSection, ReportShell } from "@/components/report/report-shell";
import { formatChange, formatMoney, formatNumber } from "@/lib/format";
import { plantTag } from "@/lib/meter-label";
import { PERIOD_LABEL, TARIFF_MODALITY_LABEL } from "@/lib/tariff";
import type { BillingResponse } from "@/lib/telemetry-types";
import { requireTenant } from "@/server/auth/dal";
import { db } from "@/server/db";
import { getSiteBilling, getSiteMonthConsumption } from "@/server/queries/billing";
import { reportContext, resolveReportMonth } from "@/server/reports/context";

export const metadata: Metadata = { title: "Relatório mensal" };

/**
 * Relatório mensal de energia de uma unidade, pronto para imprimir ou salvar em
 * PDF: consumo, custo, fatura estimada, setores e alarmes do mês.
 */
export default function ReportPage(props: PageProps<"/relatorio/[tenant]">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted-foreground">Montando o relatório…</p>}>
      <Report {...props} />
    </Suspense>
  );
}

async function Report({ params, searchParams }: PageProps<"/relatorio/[tenant]">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const search = await searchParams;
  const { energySites: sites, available } = await reportContext(tenant);
  if (sites.length === 0) notFound();
  const site = sites.find((s) => s.id === search.unidade) ?? sites[0];
  const { month, maxMonth, start, stop, name: monthName } = resolveReportMonth(search.mes, site.timezone);

  const [consumption, billingResult, alarms] = await Promise.all([
    getSiteMonthConsumption(tenant.id, site.id, month),
    getSiteBilling(tenant.id, site.id, month),
    db.alarm.findMany({
      where: {
        tenantId: tenant.id,
        startedAt: { gte: start, lt: stop },
        OR: [{ siteId: site.id }, { meter: { siteId: site.id } }],
      },
      orderBy: [{ severity: "desc" }, { startedAt: "asc" }],
      take: 200,
      select: { id: true, severity: true, title: true, startedAt: true, clearedAt: true },
    }),
  ]);
  if (!consumption) notFound();
  const billing = billingResult && "bill" in billingResult ? (billingResult as BillingResponse) : null;
  const feeders = consumption.entrance.fromMain ? consumption.sectors.filter((s) => !s.isMain) : consumption.sectors;
  const total = consumption.entrance.total;
  const share = (v: number) => (total > 0 ? `${formatNumber((v / total) * 100, 1)} %` : "—");
  const inProgress = consumption.comparison.partial;
  const mainDemand = billing?.bill.demand.find((d) => d.period !== "peak") ?? null;

  return (
    <ReportShell
      tenant={tenant}
      kind="energia"
      available={available}
      sites={sites}
      siteId={site.id}
      subtitle={site.name}
      month={month}
      maxMonth={maxMonth}
      title={`Relatório de energia — ${monthName}`}
      inProgress={inProgress}
      timeZone={site.timezone}
      footer={
        <>
          Valores estimados a partir das medições do gateway da unidade e da tarifa cadastrada, no mês do calendário. A
          fatura da distribuidora usa o ciclo de leitura e pode ter outros itens.{" "}
          {inProgress && "Mês em andamento: as comparações usam o mesmo trecho do mês anterior."}
        </>
      }
    >
      <section className="report-card grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label={inProgress ? "Consumo até agora" : "Consumo do mês"}
          value={`${formatNumber(total, 0)} kWh`}
          detail={
            formatChange(total, consumption.entrance.previousTotal)
              ? `${formatChange(total, consumption.entrance.previousTotal)} vs. mês anterior`
              : "Sem base no mês anterior"
          }
        />
        <Kpi
          label="Custo da energia"
          value={consumption.entrance.cost === null ? "—" : formatMoney(consumption.entrance.cost, true)}
          detail={consumption.hasTariff ? "Com impostos, por posto tarifário" : "Tarifa não cadastrada"}
        />
        <Kpi
          label={billing && inProgress && billing.bill.projection ? "Fatura projetada" : "Fatura estimada"}
          value={
            billing
              ? formatMoney(
                  inProgress && billing.bill.projection ? billing.bill.projection.total : billing.bill.total,
                  true,
                )
              : "—"
          }
          detail={billing ? TARIFF_MODALITY_LABEL[billing.tariff.modality] : "Tarifa não cadastrada"}
        />
        <Kpi
          label={mainDemand ? "Demanda máxima" : "Fator de potência"}
          value={
            mainDemand
              ? `${formatNumber(mainDemand.measured, 0)} kW`
              : billing?.bill.averagePowerFactor
                ? formatNumber(billing.bill.averagePowerFactor, 3)
                : "—"
          }
          detail={
            mainDemand
              ? `Contratada ${formatNumber(mainDemand.contracted, 0)} kW${mainDemand.overrun > 0 ? " · ultrapassou" : ""}`
              : "Média do mês"
          }
        />
      </section>

      <section className="report-card space-y-2">
        <h2 className="font-semibold">Consumo por dia (kWh)</h2>
        <div className="rounded-lg border p-3">
          <DailyBarsSvg days={consumption.days} values={consumption.entrance.kwh} timeZone={consumption.timeZone} />
        </div>
      </section>

      <section className="report-card space-y-2">
        <h2 className="font-semibold">Consumo por setor</h2>
        <table className="w-full border-collapse text-left">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 font-medium">Setor</th>
              <th className="py-1.5 text-right font-medium">kWh</th>
              <th className="py-1.5 text-right font-medium">%</th>
              {consumption.hasTariff && <th className="py-1.5 text-right font-medium">Custo</th>}
              <th className="py-1.5 text-right font-medium">vs. mês anterior</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[...feeders]
              .sort((a, b) => b.total - a.total)
              .map((s) => (
                <tr key={s.id}>
                  <td className="py-1.5">
                    {plantTag(s.tag) && (
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{plantTag(s.tag)}</span>
                    )}
                    {s.name}
                  </td>
                  <td className="py-1.5 text-right tabular">{formatNumber(s.total, 0)}</td>
                  <td className="py-1.5 text-right text-muted-foreground tabular">{share(s.total)}</td>
                  {consumption.hasTariff && <td className="py-1.5 text-right tabular">{formatMoney(s.cost)}</td>}
                  <td className="py-1.5 text-right text-muted-foreground tabular">
                    {formatChange(s.total, s.previousTotal) ?? "—"}
                  </td>
                </tr>
              ))}
            {consumption.unmeasured && (
              <tr className="text-muted-foreground">
                <td className="py-1.5">Não medido</td>
                <td className="py-1.5 text-right tabular">{formatNumber(consumption.unmeasured.total, 0)}</td>
                <td className="py-1.5 text-right tabular">{share(consumption.unmeasured.total)}</td>
                {consumption.hasTariff && (
                  <td className="py-1.5 text-right tabular">{formatMoney(consumption.unmeasured.cost)}</td>
                )}
                <td />
              </tr>
            )}
          </tbody>
          <tfoot className="border-t font-medium">
            <tr>
              <td className="py-1.5">{consumption.entrance.fromMain ? "Entrada geral" : "Total"}</td>
              <td className="py-1.5 text-right tabular">{formatNumber(total, 0)}</td>
              <td className="py-1.5 text-right tabular">100 %</td>
              {consumption.hasTariff && (
                <td className="py-1.5 text-right tabular">{formatMoney(consumption.entrance.cost)}</td>
              )}
              <td className="py-1.5 text-right tabular">
                {formatChange(total, consumption.entrance.previousTotal) ?? "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {billing && (
        <section className="report-card space-y-2">
          <h2 className="font-semibold">Fatura estimada {inProgress ? "até agora" : "do mês"}</h2>
          <table className="w-full border-collapse text-left">
            <tbody className="divide-y">
              {billing.bill.energy.map((l) => (
                <tr key={l.period}>
                  <td className="py-1.5">
                    Energia
                    {billing.tariff.modality === "CONVENTIONAL" ? "" : ` — ${PERIOD_LABEL[l.period].toLowerCase()}`}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground tabular">
                    {formatNumber(l.kwh, 0)} kWh × {formatMoney(l.price)}
                  </td>
                  <td className="py-1.5 text-right tabular">{formatMoney(l.cost)}</td>
                </tr>
              ))}
              {billing.bill.demand.map((d) => (
                <tr key={d.period}>
                  <td className="py-1.5">
                    Demanda{d.period === "peak" ? " na ponta" : d.period === "offPeak" ? " fora ponta" : ""}
                    {d.overrun > 0 &&
                      ` (ultrapassagem de ${formatNumber(d.overrun, 1)} kW: ${formatMoney(d.overrunCost)})`}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground tabular">
                    {formatNumber(d.billed, 1)} kW × {formatMoney(d.price)}
                  </td>
                  <td className="py-1.5 text-right tabular">{formatMoney(d.cost + d.overrunCost)}</td>
                </tr>
              ))}
              {billing.bill.reactive && billing.bill.reactive.cost > 0 && (
                <tr>
                  <td className="py-1.5">Excedente de reativo (estimado)</td>
                  <td className="py-1.5 text-right text-muted-foreground tabular">
                    {formatNumber(billing.bill.reactive.kvarh, 0)} kvarh
                  </td>
                  <td className="py-1.5 text-right tabular">{formatMoney(billing.bill.reactive.cost)}</td>
                </tr>
              )}
              {billing.bill.taxes > 0 && (
                <tr>
                  <td className="py-1.5">Impostos</td>
                  <td className="py-1.5 text-right text-muted-foreground tabular">
                    {formatNumber(billing.tariff.taxRate, 1)} %
                  </td>
                  <td className="py-1.5 text-right tabular">{formatMoney(billing.bill.taxes)}</td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t font-semibold">
              <tr>
                <td className="py-1.5" colSpan={2}>
                  Total estimado
                </td>
                <td className="py-1.5 text-right tabular">{formatMoney(billing.bill.total)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      <ReportSection title="Alarmes do mês">
        <AlarmsTable alarms={alarms} timeZone={site.timezone} empty="Nenhum alarme nesta unidade no mês." />
      </ReportSection>
    </ReportShell>
  );
}
