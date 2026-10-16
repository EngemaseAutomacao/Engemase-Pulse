import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DailyBarsSvg } from "@/components/report/daily-bars-svg";
import { PrintButton } from "@/components/report/print-button";
import { Button } from "@/components/ui/button";
import { calendarMonth } from "@/lib/api-contracts";
import { BRAND_THEME_CLASS, brandThemeStyle } from "@/lib/color";
import { formatChange, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { PERIOD_LABEL, TARIFF_MODALITY_LABEL } from "@/lib/tariff";
import type { BillingResponse } from "@/lib/telemetry-types";
import { cn } from "@/lib/utils";
import { requireTenant } from "@/server/auth/dal";
import { tenantLogoUrl } from "@/server/branding";
import { db } from "@/server/db";
import { getSiteBilling, getSiteMonthConsumption, monthWindow } from "@/server/queries/billing";
import { getTenantTopology } from "@/server/telemetry/topology";
import { plantTag } from "@/lib/meter-label";

export const metadata: Metadata = { title: "Relatório mensal" };

const SEVERITY_LABEL = { CRITICAL: "Crítico", WARNING: "Atenção", INFO: "Informativo" } as const;

/**
 * Relatório mensal de uma unidade, pronto para imprimir ou salvar em PDF:
 * consumo, custo, fatura estimada, setores e alarmes do mês. Fica fora do
 * menu lateral e sempre no tema claro (é para papel).
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
  const sites = (await getTenantTopology(tenant.id)).filter((s) => s.meters.length > 0);
  if (sites.length === 0) notFound();
  const site = sites.find((s) => s.id === search.unidade) ?? sites[0];
  const fallbackMonth = new Intl.DateTimeFormat("en-CA", { timeZone: site.timezone, year: "numeric", month: "2-digit" })
    .format(new Date())
    .slice(0, 7);
  const month = calendarMonth.safeParse(search.mes).success ? (search.mes as string) : fallbackMonth;
  const { start, stop } = monthWindow(month, site.timezone);

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
  const monthName = new Date(start.getTime() + 15 * 86_400_000).toLocaleDateString("pt-BR", {
    timeZone: site.timezone,
    month: "long",
    year: "numeric",
  });
  const feeders = consumption.entrance.fromMain ? consumption.sectors.filter((s) => !s.isMain) : consumption.sectors;
  const total = consumption.entrance.total;
  const share = (v: number) => (total > 0 ? `${formatNumber((v / total) * 100, 1)} %` : "—");
  const inProgress = consumption.comparison.partial;
  const counts = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  for (const a of alarms) counts[a.severity] += 1;
  const mainDemand = billing?.bill.demand.find((d) => d.period !== "peak") ?? null;

  return (
    <div
      className={cn("light min-h-dvh bg-background text-foreground print:bg-white", BRAND_THEME_CLASS)}
      style={brandThemeStyle(tenant.primaryColor, tenant.accentColor)}
    >
      <style>{`@page { size: A4; margin: 14mm; } @media print { .no-print { display: none !important; } .report-card { break-inside: avoid; } }`}</style>

      <div className="no-print sticky top-0 z-10 border-b bg-card/90 backdrop-blur">
        <form method="get" className="mx-auto flex max-w-4xl flex-wrap items-end gap-3 px-4 py-3">
          {sites.length > 1 && (
            <label className="grid gap-1 text-xs text-muted-foreground">
              Unidade
              <select
                name="unidade"
                defaultValue={site.id}
                className="h-8 rounded-lg border bg-background px-2 text-sm text-foreground"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-xs text-muted-foreground">
            Mês
            <input
              type="month"
              name="mes"
              defaultValue={month}
              max={fallbackMonth}
              className="h-8 rounded-lg border bg-background px-2 text-sm text-foreground"
            />
          </label>
          <Button type="submit" variant="outline">
            Ver
          </Button>
          <span className="flex-1" />
          <PrintButton />
        </form>
      </div>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-sm print:max-w-none print:p-0">
        <header className="flex items-start justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo do cliente vem do banco */}
            <img
              src={tenantLogoUrl(tenant.slug, tenant.logoVersion)}
              alt=""
              className="size-12 rounded-full object-contain"
            />
            <div>
              <p className="font-heading text-lg font-bold text-primary">{tenant.name}</p>
              <p className="text-muted-foreground">{site.name}</p>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-semibold first-letter:uppercase">Relatório de energia — {monthName}</h1>
            <p className="text-xs text-muted-foreground">
              {inProgress ? "Mês em andamento · " : ""}Gerado em {formatDateTime(new Date())}
            </p>
          </div>
        </header>

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

        <section className="report-card space-y-2">
          <h2 className="font-semibold">Alarmes do mês</h2>
          {alarms.length === 0 ? (
            <p className="text-muted-foreground">Nenhum alarme nesta unidade no mês.</p>
          ) : (
            <>
              <p className="text-muted-foreground">
                {alarms.length} alarme(s): {counts.CRITICAL} crítico(s), {counts.WARNING} de atenção, {counts.INFO}{" "}
                informativo(s).
              </p>
              <table className="w-full border-collapse text-left">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 font-medium">Nível</th>
                    <th className="py-1.5 font-medium">Alarme</th>
                    <th className="py-1.5 font-medium">Início</th>
                    <th className="py-1.5 text-right font-medium">Duração</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {alarms.slice(0, 20).map((a) => (
                    <tr key={a.id}>
                      <td className="py-1.5">{SEVERITY_LABEL[a.severity]}</td>
                      <td className="py-1.5">{a.title}</td>
                      <td className="py-1.5 whitespace-nowrap text-muted-foreground">{formatDateTime(a.startedAt)}</td>
                      <td className="py-1.5 text-right whitespace-nowrap text-muted-foreground">
                        {a.clearedAt ? duration(a.clearedAt.getTime() - a.startedAt.getTime()) : "em aberto"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {alarms.length > 20 && (
                <p className="text-xs text-muted-foreground">E mais {alarms.length - 20} — veja a tela de alarmes.</p>
              )}
            </>
          )}
        </section>

        <footer className="border-t pt-3 text-xs text-muted-foreground">
          Valores estimados a partir das medições do gateway da unidade e da tarifa cadastrada, no mês do calendário. A
          fatura da distribuidora usa o ciclo de leitura e pode ter outros itens.{" "}
          {inProgress && "Mês em andamento: as comparações usam o mesmo trecho do mês anterior."}
        </footer>
      </main>
    </div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} dias`;
}
