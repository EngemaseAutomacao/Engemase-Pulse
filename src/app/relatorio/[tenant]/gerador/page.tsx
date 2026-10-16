import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DailyBarsSvg } from "@/components/report/daily-bars-svg";
import { AlarmsTable, Kpi, ReportSection, ReportShell } from "@/components/report/report-shell";
import { formatDateTimeIn, formatNumber } from "@/lib/format";
import { formatSpan } from "@/lib/reports";
import { levelMarks } from "@/lib/utilities";
import { cn } from "@/lib/utils";
import { requireTenant } from "@/server/auth/dal";
import { db } from "@/server/db";
import { reportContext, resolveReportMonth } from "@/server/reports/context";
import { generatorMonth, type GeneratorMonth } from "@/server/reports/generator";

export const metadata: Metadata = { title: "Relatório do gerador" };

const STATUS_LABEL = { running: "Rodando", ok: "Normal", failed: "Falhou", tripped: "Desarmou" } as const;

/** Relatório mensal do grupo gerador de uma unidade, para imprimir ou salvar em PDF. */
export default function GeneratorReportPage(props: PageProps<"/relatorio/[tenant]/gerador">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted-foreground">Montando o relatório…</p>}>
      <Report {...props} />
    </Suspense>
  );
}

async function Report({ params, searchParams }: PageProps<"/relatorio/[tenant]/gerador">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const search = await searchParams;
  const { generatorSites: sites, catalog, available } = await reportContext(tenant);
  if (sites.length === 0) notFound();
  const site = sites.find((s) => s.id === search.unidade) ?? sites[0];
  const { month, maxMonth, start, stop, name: monthName, inProgress } = resolveReportMonth(search.mes, site.timezone);
  const refs = catalog.equipment.filter((e) => e.siteId === site.id && e.kind === "GENERATOR");
  const [generators, alarms] = await Promise.all([
    Promise.all(refs.map((g) => generatorMonth(g, start, stop))),
    db.alarm.findMany({
      where: {
        tenantId: tenant.id,
        siteId: site.id,
        startedAt: { gte: start, lt: stop },
        OR: refs.flatMap((g) =>
          [g.tag, g.name].filter((x): x is string => Boolean(x)).map((p) => ({ title: { startsWith: p } })),
        ),
      },
      orderBy: [{ severity: "desc" }, { startedAt: "asc" }],
      take: 200,
      select: { id: true, severity: true, title: true, startedAt: true, clearedAt: true },
    }),
  ]);

  return (
    <ReportShell
      tenant={tenant}
      kind="gerador"
      available={available}
      sites={sites}
      siteId={site.id}
      subtitle={site.name}
      month={month}
      maxMonth={maxMonth}
      title={`Relatório do gerador — ${monthName}`}
      inProgress={inProgress}
      timeZone={site.timezone}
      footer={
        <>
          Partidas registradas pelo gateway da unidade, da partida até parar. &quot;Pronto para partir&quot; é a fração
          do tempo em automático, sem falha e com diesel e bateria, pelo controlador do grupo. Uma semana conta como
          testada quando o grupo partiu e assumiu (teste, exercício ou falta de rede).
        </>
      }
    >
      {generators.map((gen) => (
        <GeneratorBlock
          key={gen.id}
          gen={gen}
          timeZone={site.timezone}
          showName={generators.length > 1}
          critical={levelMarks(refs.find((r) => r.id === gen.id)?.settings.marcas).find((m) => m.tone === "critical")}
        />
      ))}
      <ReportSection title="Alarmes do grupo gerador">
        <AlarmsTable alarms={alarms} timeZone={site.timezone} empty="Nenhum alarme do grupo gerador no mês." />
      </ReportSection>
    </ReportShell>
  );
}

function GeneratorBlock({
  gen,
  timeZone,
  showName,
  critical,
}: {
  gen: GeneratorMonth;
  timeZone: string;
  showName: boolean;
  critical?: { value: number; label: string };
}) {
  const s = gen.stats;
  const closed = gen.weeks.filter((w) => !w.open);
  const tested = gen.weeks.filter((w) => w.ok).length;
  const missed = closed.filter((w) => !w.ok).length;
  const day = (t: number) => new Date(t).toLocaleDateString("pt-BR", { timeZone, day: "2-digit", month: "2-digit" });

  return (
    <>
      {showName && (
        <h2 className="text-base font-semibold">
          {gen.name} {gen.tag && <span className="font-mono text-xs text-muted-foreground">{gen.tag}</span>}
        </h2>
      )}
      <section className="report-card grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Semanas com partida"
          value={`${tested} de ${gen.weeks.length}`}
          detail={missed > 0 ? `${missed} semana(s) sem partida` : "teste semanal em dia"}
          alert={missed > 0}
        />
        <Kpi
          label="Partidas"
          value={String(s.starts)}
          detail={s.failedStarts ? `${s.failedStarts} com falha` : s.trips ? `${s.trips} desarme(s)` : "nenhuma falha"}
          alert={s.failedStarts > 0}
        />
        <Kpi
          label="Pronto para partir"
          value={gen.readiness === null ? "—" : `${formatNumber(gen.readiness * 100, 1)} %`}
          detail="do tempo no mês"
          alert={gen.readiness !== null && gen.readiness < 0.95}
        />
        <Kpi
          label="Horas rodando"
          value={formatNumber(s.hours, 1)}
          detail={`${formatNumber(s.liters, 0)} L de diesel · ${formatNumber(s.kwh, 0)} kWh`}
        />
        <Kpi
          label="Diesel no fim"
          value={gen.dieselLast === null ? "—" : `${formatNumber(gen.dieselLast, 0)} %`}
          detail={gen.dieselFirst === null ? "" : `começou o mês com ${formatNumber(gen.dieselFirst, 0)} %`}
          alert={critical !== undefined && gen.dieselLast !== null && gen.dieselLast < critical.value}
        />
        <Kpi
          label="Menor tensão da bateria"
          value={gen.batteryLowest ? `${formatNumber(gen.batteryLowest.value, 1)} V` : "—"}
          detail={gen.batteryLowest ? `em ${day(gen.batteryLowest.day)}` : ""}
        />
        <Kpi
          label="Maior queda no arranque"
          value={s.maxBatteryDrop === null ? "—" : `${formatNumber(s.maxBatteryDrop, 1)} V`}
          detail="bateria fraca derruba mais"
        />
        <Kpi
          label="Consumo medido"
          value={s.litersPerHour === null ? "—" : `${formatNumber(s.litersPerHour, 0)} L/h`}
          detail={gen.nominalKw ? `grupo de ${formatNumber(gen.nominalKw, 0)} kW` : "nas corridas de 10 min ou mais"}
        />
      </section>

      <ReportSection title="Teste semanal" note="Semanas de segunda a domingo que tocam o mês.">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {gen.weeks.map((w) => (
            <li
              key={w.start}
              className={cn(
                "rounded-lg border px-3 py-2",
                w.ok ? "border-success/40" : w.open ? "border-border" : "border-destructive/50",
              )}
            >
              <p className="text-xs text-muted-foreground">semana de {day(w.start)}</p>
              <p className={cn("font-medium", !w.ok && !w.open && "text-destructive")}>
                {w.ok ? "Partiu" : w.open ? "Em andamento" : "Sem partida"}
              </p>
            </li>
          ))}
        </ul>
      </ReportSection>

      <ReportSection title="Diesel: menor nível de cada dia (%)">
        <div className="rounded-lg border p-3">
          <DailyBarsSvg
            days={gen.days}
            values={gen.dieselMin}
            timeZone={timeZone}
            unit="%"
            label="Menor nível de diesel de cada dia (%)"
            max={100}
            reference={critical ? { value: critical.value, label: `${critical.label} ${critical.value} %` } : undefined}
          />
        </div>
      </ReportSection>

      <ReportSection title="Partidas do mês">
        {gen.runs.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma partida registrada no mês.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Início</th>
                <th className="py-1.5 font-medium">Motivo</th>
                <th className="py-1.5 font-medium">Resultado</th>
                <th className="py-1.5 text-right font-medium">Duração</th>
                <th className="py-1.5 text-right font-medium">Diesel</th>
                <th className="py-1.5 text-right font-medium">Energia</th>
                <th className="py-1.5 text-right font-medium">Queda da bateria</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {gen.runs.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 whitespace-nowrap">{formatDateTimeIn(r.startedAt, timeZone)}</td>
                  <td className="py-1.5 first-letter:uppercase">{r.reason ?? "—"}</td>
                  <td className={cn("py-1.5", (r.status === "failed" || r.status === "tripped") && "text-destructive")}>
                    {r.status === "ok" || r.status === "running"
                      ? STATUS_LABEL[r.status]
                      : (r.result ?? STATUS_LABEL[r.status])}
                  </td>
                  <td className="py-1.5 text-right tabular">
                    {r.durationSeconds === null
                      ? "—"
                      : r.durationSeconds < 60
                        ? `${formatNumber(r.durationSeconds, 0)} s`
                        : formatSpan(r.durationSeconds * 1000)}
                  </td>
                  <td className="py-1.5 text-right tabular">{r.liters ? `${formatNumber(r.liters, 0)} L` : "—"}</td>
                  <td className="py-1.5 text-right tabular">{r.kwh ? `${formatNumber(r.kwh, 0)} kWh` : "—"}</td>
                  <td className="py-1.5 text-right tabular">
                    {r.batteryDrop === null ? "—" : `${formatNumber(r.batteryDrop, 1)} V`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>
    </>
  );
}
