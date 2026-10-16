import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DailyBarsSvg } from "@/components/report/daily-bars-svg";
import { Kpi, ReportSection, ReportShell } from "@/components/report/report-shell";
import { formatDateTimeIn, formatNumber } from "@/lib/format";
import { meterLabel } from "@/lib/meter-label";
import { PF_MINIMUM } from "@/lib/reports";
import { TARIFF_MODALITY_LABEL } from "@/lib/tariff";
import { requireTenant } from "@/server/auth/dal";
import { reportContext, resolveReportMonth } from "@/server/reports/context";
import { getDemandReport, type DemandPeriod } from "@/server/reports/demand";

export const metadata: Metadata = { title: "Relatório de demanda e fator de potência" };

const PERIOD_TEXT: Record<DemandPeriod, string> = { peak: "ponta", offPeak: "fora ponta", single: "" };

/** Demanda e fator de potência da entrada geral de uma unidade no mês, para imprimir ou salvar em PDF. */
export default function DemandReportPage(props: PageProps<"/relatorio/[tenant]/demanda">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted-foreground">Montando o relatório…</p>}>
      <Report {...props} />
    </Suspense>
  );
}

async function Report({ params, searchParams }: PageProps<"/relatorio/[tenant]/demanda">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const search = await searchParams;
  const { energySites: sites, available } = await reportContext(tenant);
  if (sites.length === 0) notFound();
  const site = sites.find((s) => s.id === search.unidade) ?? sites[0];
  const r = resolveReportMonth(search.mes, site.timezone);
  const report = await getDemandReport(site, r.start, r.stop);
  const tz = site.timezone;
  const day = (t: number) =>
    new Date(t).toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" });

  return (
    <ReportShell
      tenant={tenant}
      kind="demanda"
      available={available}
      sites={sites}
      siteId={site.id}
      subtitle={report ? `${site.name} · ${meterLabel(report.meter)}` : site.name}
      month={r.month}
      maxMonth={r.maxMonth}
      title={`Demanda e fator de potência — ${r.name}`}
      inProgress={r.inProgress}
      timeZone={tz}
      footer={
        <>
          Demanda: média da potência ativa da entrada geral em janelas de 15 min, como a distribuidora mede; a
          ultrapassagem conta acima da contratada mais 5 % de tolerância. Fator de potência: média de cada hora com
          consumo; abaixo de {formatNumber(PF_MINIMUM, 2)} a distribuidora cobra o reativo excedente. Valores estimados
          pelo gateway da unidade; a fatura usa o ciclo de leitura.
        </>
      }
    >
      {!report ? (
        <p className="rounded-lg border border-warning/50 p-3">
          Esta unidade não tem a entrada geral marcada no gateway. Marque o medidor da entrada como principal no Pulse
          Configurador para ver a demanda e o fator de potência da instalação.
        </p>
      ) : (
        <>
          <section className="report-card grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi
              label={report.splitPeak ? "Demanda máxima fora ponta" : "Demanda máxima"}
              value={report.monthMax.offPeak ? `${formatNumber(report.monthMax.offPeak.kw, 0)} kW` : "—"}
              detail={
                report.monthMax.offPeak
                  ? `em ${formatDateTimeIn(report.monthMax.offPeak.at, tz)}${report.contracted.offPeak ? ` · contratada ${formatNumber(report.contracted.offPeak, 0)} kW` : ""}`
                  : ""
              }
              alert={report.overruns.some((o) => o.period !== "peak")}
            />
            {report.splitPeak ? (
              <Kpi
                label="Demanda máxima na ponta"
                value={report.monthMax.peak ? `${formatNumber(report.monthMax.peak.kw, 0)} kW` : "—"}
                detail={
                  report.monthMax.peak
                    ? `em ${formatDateTimeIn(report.monthMax.peak.at, tz)}${report.contracted.peak ? ` · contratada ${formatNumber(report.contracted.peak, 0)} kW` : ""}`
                    : "sem leitura no horário de ponta"
                }
                alert={report.overruns.some((o) => o.period === "peak")}
              />
            ) : (
              <Kpi
                label="Tarifa"
                value={report.tariff ? TARIFF_MODALITY_LABEL[report.tariff.modality] : "—"}
                detail={report.tariff ? "sem demanda por posto" : "tarifa não cadastrada"}
              />
            )}
            <Kpi
              label="Dias com ultrapassagem"
              value={
                report.contracted.offPeak || report.contracted.peak
                  ? String(new Set(report.overruns.map((o) => o.day)).size)
                  : "—"
              }
              detail={
                report.contracted.offPeak || report.contracted.peak
                  ? "acima da contratada + 5 %"
                  : "demanda contratada não cadastrada"
              }
              alert={report.overruns.length > 0}
            />
            <Kpi
              label="Fator de potência do mês"
              value={report.pf.month === null ? "—" : formatNumber(report.pf.month, 3)}
              detail={report.pf.fromEnergy ? "kWh ÷ kVAh do mês" : "média das horas com consumo"}
              alert={report.pf.month !== null && report.pf.month < PF_MINIMUM}
            />
            <Kpi
              label={`Horas abaixo de ${formatNumber(PF_MINIMUM, 2)}`}
              value={String(report.pf.hoursBelow)}
              detail={
                report.pf.hoursMeasured
                  ? `${formatNumber((report.pf.hoursBelow / report.pf.hoursMeasured) * 100, 1)} % das horas com consumo`
                  : "sem leitura de fator de potência"
              }
              alert={report.pf.hoursBelow > 0}
            />
            <Kpi
              label="Reativo excedente"
              value={`${formatNumber(report.pf.excessKvarh, 0)} kvarh`}
              detail="estimado nas horas abaixo do mínimo"
              alert={report.pf.excessKvarh > 0}
            />
            <Kpi label="Energia ativa" value={`${formatNumber(report.kwh, 0)} kWh`} detail="entrada geral" />
            <Kpi
              label="Energia aparente"
              value={report.kvah === null ? "—" : `${formatNumber(report.kvah, 0)} kVAh`}
              detail={report.kvah === null ? "o gateway não enviou" : "entrada geral"}
            />
          </section>

          <ReportSection
            title={report.splitPeak ? "Maior demanda de cada dia, fora ponta (kW)" : "Maior demanda de cada dia (kW)"}
          >
            <div className="rounded-lg border p-3">
              <DailyBarsSvg
                days={report.days}
                values={report.dailyMax.offPeak}
                timeZone={tz}
                unit="kW"
                label="Maior demanda de cada dia (kW)"
                reference={
                  report.contracted.offPeak
                    ? {
                        value: report.contracted.offPeak,
                        label: `contratada ${formatNumber(report.contracted.offPeak, 0)} kW`,
                      }
                    : undefined
                }
              />
            </div>
          </ReportSection>

          {report.splitPeak && (
            <ReportSection title="Maior demanda de cada dia, na ponta (kW)">
              <div className="rounded-lg border p-3">
                <DailyBarsSvg
                  days={report.days}
                  values={report.dailyMax.peak}
                  timeZone={tz}
                  unit="kW"
                  label="Maior demanda de cada dia na ponta (kW)"
                  reference={
                    (report.contracted.peak ?? report.contracted.offPeak)
                      ? {
                          value: (report.contracted.peak ?? report.contracted.offPeak)!,
                          label: `contratada ${formatNumber((report.contracted.peak ?? report.contracted.offPeak)!, 0)} kW`,
                        }
                      : undefined
                  }
                />
              </div>
            </ReportSection>
          )}

          <ReportSection title="Maiores picos do mês" note="O pico de cada dia, do maior para o menor.">
            {report.topWindows.length === 0 ? (
              <p className="text-muted-foreground">Sem leitura de demanda no mês.</p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 font-medium">Janela de 15 min</th>
                    {report.splitPeak && <th className="py-1.5 font-medium">Posto</th>}
                    <th className="py-1.5 text-right font-medium">Demanda</th>
                    <th className="py-1.5 text-right font-medium">da contratada</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.topWindows.map((w) => {
                    const limit =
                      w.period === "peak"
                        ? (report.contracted.peak ?? report.contracted.offPeak)
                        : report.contracted.offPeak;
                    return (
                      <tr key={w.start} className={limit && w.kw > limit * 1.05 ? "text-destructive" : undefined}>
                        <td className="py-1.5 whitespace-nowrap">{formatDateTimeIn(w.start, tz)}</td>
                        {report.splitPeak && <td className="py-1.5">{PERIOD_TEXT[w.period]}</td>}
                        <td className="py-1.5 text-right tabular">{formatNumber(w.kw, 1)} kW</td>
                        <td className="py-1.5 text-right text-muted-foreground tabular">
                          {limit ? `${formatNumber((w.kw / limit) * 100, 0)} %` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </ReportSection>

          <ReportSection
            title="Fator de potência por dia"
            note={`Média do dia, ponderada pela potência; abaixo de ${formatNumber(PF_MINIMUM, 2)} há cobrança de reativo.`}
          >
            <div className="rounded-lg border p-3">
              <DailyBarsSvg
                days={report.days}
                values={report.pf.daily.map((v) => (v === null ? null : v * 100))}
                timeZone={tz}
                unit="%"
                digits={1}
                label="Fator de potência médio de cada dia (%)"
                max={100}
                reference={{ value: PF_MINIMUM * 100, label: `mínimo ${formatNumber(PF_MINIMUM, 2)}` }}
              />
            </div>
          </ReportSection>

          {report.pf.worstDays.length > 0 && (
            <ReportSection title={`Dias com mais horas abaixo de ${formatNumber(PF_MINIMUM, 2)}`}>
              <table className="w-full border-collapse text-left">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 font-medium">Dia</th>
                    <th className="py-1.5 text-right font-medium">Horas abaixo</th>
                    <th className="py-1.5 text-right font-medium">Menor FP da hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.pf.worstDays.map((d) => (
                    <tr key={d.day}>
                      <td className="py-1.5">{day(d.day)}</td>
                      <td className="py-1.5 text-right tabular">{d.hoursBelow}</td>
                      <td className="py-1.5 text-right tabular">{formatNumber(d.minPf, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ReportSection>
          )}
        </>
      )}
    </ReportShell>
  );
}
