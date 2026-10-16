import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DailyBarsSvg } from "@/components/report/daily-bars-svg";
import { AlarmsTable, Kpi, ReportSection, ReportShell } from "@/components/report/report-shell";
import { formatChange, formatDateTimeIn, formatNumber } from "@/lib/format";
import { requireTenant } from "@/server/auth/dal";
import { db } from "@/server/db";
import { monthWindow } from "@/server/queries/billing";
import { reportContext, resolveReportMonth } from "@/server/reports/context";
import { waterMonth, type WaterMonth } from "@/server/reports/water";

export const metadata: Metadata = { title: "Relatório da água" };

const m3 = (liters: number | null | undefined, digits = 1) =>
  liters === null || liters === undefined ? "—" : formatNumber(liters / 1000, digits);

/** Relatório mensal do reservatório de uma unidade, para imprimir ou salvar em PDF. */
export default function WaterReportPage(props: PageProps<"/relatorio/[tenant]/agua">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted-foreground">Montando o relatório…</p>}>
      <Report {...props} />
    </Suspense>
  );
}

async function Report({ params, searchParams }: PageProps<"/relatorio/[tenant]/agua">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const search = await searchParams;
  const { waterSites: sites, catalog, available } = await reportContext(tenant);
  if (sites.length === 0) notFound();
  const site = sites.find((s) => s.id === search.unidade) ?? sites[0];
  const r = resolveReportMonth(search.mes, site.timezone);
  const previousStart = monthWindow(r.previous, site.timezone).start;
  const refs = catalog.equipment.filter((e) => e.siteId === site.id && e.kind === "WATER");
  const [tanks, alarms] = await Promise.all([
    Promise.all(refs.map((t) => waterMonth(t, r.start, r.stop, previousStart))),
    db.alarm.findMany({
      where: {
        tenantId: tenant.id,
        siteId: site.id,
        startedAt: { gte: r.start, lt: r.stop },
        OR: [
          { title: { startsWith: "Possível vazamento" } },
          ...refs.flatMap((t) =>
            [t.tag, t.name].filter((x): x is string => Boolean(x)).map((p) => ({ title: { startsWith: p } })),
          ),
        ],
      },
      orderBy: [{ severity: "desc" }, { startedAt: "asc" }],
      take: 200,
      select: { id: true, severity: true, title: true, startedAt: true, clearedAt: true },
    }),
  ]);

  return (
    <ReportShell
      tenant={tenant}
      kind="agua"
      available={available}
      sites={sites}
      siteId={site.id}
      subtitle={site.name}
      month={r.month}
      maxMonth={r.maxMonth}
      title={`Relatório da água — ${r.name}`}
      inProgress={r.inProgress}
      timeZone={site.timezone}
      footer={
        <>
          Consumo calculado pelo nível do reservatório e pela vazão de entrada, quando há medidor de vazão; sem ele,
          enquanto a bomba enche, o consumo é estimado pelo ritmo anterior. A madrugada é a hora mais calma entre 0h e
          5h: consumo bem acima das noites anteriores indica vazamento.
        </>
      }
    >
      {tanks.map((tank) => (
        <TankBlock key={tank.id} tank={tank} timeZone={site.timezone} showName={tanks.length > 1} />
      ))}
      <ReportSection title="Alarmes da água">
        <AlarmsTable alarms={alarms} timeZone={site.timezone} empty="Nenhum alarme do reservatório no mês." />
      </ReportSection>
    </ReportShell>
  );
}

function TankBlock({ tank, timeZone, showName }: { tank: WaterMonth; timeZone: string; showName: boolean }) {
  const day = (t: number) => new Date(t).toLocaleDateString("pt-BR", { timeZone, day: "2-digit", month: "2-digit" });
  const withData = tank.days.filter((d) => d.data !== null);
  const peak = [...withData].sort((a, b) => b.data!.liters - a.data!.liters)[0] ?? null;
  const leaks = withData.filter((d) => d.data!.leakSuspect);
  const critical = tank.marks.find((m) => m.tone === "critical");

  return (
    <>
      {showName && (
        <h2 className="text-base font-semibold">
          {tank.name} {tank.tag && <span className="font-mono text-xs text-muted-foreground">{tank.tag}</span>}
        </h2>
      )}
      {tank.capacityL === null && (
        <p className="rounded-lg border border-warning/50 p-3">
          A capacidade do reservatório não está informada no Pulse Configurador da unidade: sem ela não dá para calcular
          o consumo em m³.
        </p>
      )}
      <section className="report-card grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Consumo do mês"
          value={`${m3(tank.totalLiters)} m³`}
          detail={tank.capacityL ? `reservatório de ${formatNumber(tank.capacityL, 0)} L` : "capacidade não informada"}
        />
        <Kpi
          label="Média por dia"
          value={`${m3(tank.perDayLiters, 2)} m³`}
          detail={
            tank.perDayLiters !== null && formatChange(tank.perDayLiters, tank.previousPerDayLiters)
              ? `${formatChange(tank.perDayLiters, tank.previousPerDayLiters)} vs. mês anterior`
              : "sem base no mês anterior"
          }
        />
        <Kpi
          label="Dia de maior consumo"
          value={peak ? `${m3(peak.data!.liters)} m³` : "—"}
          detail={peak ? `em ${day(peak.start)}` : ""}
        />
        <Kpi
          label="Madrugadas suspeitas"
          value={String(leaks.length)}
          detail={leaks.length ? `a primeira em ${day(leaks[0].start)}` : "nenhum sinal de vazamento"}
          alert={leaks.length > 0}
        />
        <Kpi
          label="Menor nível"
          value={tank.level.min === null ? "—" : `${formatNumber(tank.level.min, 0)} %`}
          detail={tank.level.minAt ? `em ${formatDateTimeIn(tank.level.minAt, timeZone)}` : ""}
          alert={critical !== undefined && tank.level.min !== null && tank.level.min < critical.value}
        />
        <Kpi
          label="Abaixo do crítico"
          value={tank.level.hoursBelowCritical === null ? "—" : `${formatNumber(tank.level.hoursBelowCritical, 1)} h`}
          detail={
            critical
              ? `linha "${critical.label}" em ${formatNumber(critical.value, 0)} %`
              : "sem linha crítica no gateway"
          }
          alert={(tank.level.hoursBelowCritical ?? 0) > 0}
        />
        <Kpi
          label="Bomba de recalque"
          value={tank.pumpHours === null ? "—" : `${formatNumber(tank.pumpHours, 1)} h`}
          detail={tank.pumpStarts === null ? "sem o sinal da bomba" : `${formatNumber(tank.pumpStarts, 0)} partidas`}
        />
        <Kpi
          label="Nível médio"
          value={tank.level.avg === null ? "—" : `${formatNumber(tank.level.avg, 0)} %`}
          detail="no mês"
        />
      </section>

      {tank.capacityL !== null && (
        <ReportSection
          title="Consumo por dia (m³)"
          note={
            tank.levelOnly
              ? "Calculado pelo nível do reservatório."
              : "Vazão de entrada menos o que o reservatório subiu."
          }
        >
          <div className="rounded-lg border p-3">
            <DailyBarsSvg
              days={tank.days.map((d) => d.start)}
              values={tank.days.map((d) => (d.data ? d.data.liters / 1000 : null))}
              timeZone={timeZone}
              unit="m³"
              digits={1}
              label="Consumo de água por dia (m³)"
            />
          </div>
        </ReportSection>
      )}

      {tank.capacityL !== null && withData.length > 0 && (
        <ReportSection
          title="Dia a dia"
          note="Madrugada: menor consumo de uma hora inteira entre 0h e 5h, comparado com as noites anteriores."
        >
          <table className="w-full border-collapse text-left">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Dia</th>
                <th className="py-1.5 text-right font-medium">Consumo</th>
                <th className="py-1.5 text-right font-medium">Madrugada</th>
                <th className="py-1.5 text-right font-medium">Referência</th>
                <th className="py-1.5 text-right font-medium">Bomba</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {withData.map(({ start, data }) => (
                <tr key={start} className={data!.leakSuspect ? "text-destructive" : undefined}>
                  <td className="py-1 whitespace-nowrap">{day(start)}</td>
                  <td className="py-1 text-right tabular">{m3(data!.liters, 2)} m³</td>
                  <td className="py-1 text-right tabular">
                    {data!.nightMinLh === null ? "—" : `${formatNumber(data!.nightMinLh, 0)} L/h`}
                    {data!.leakSuspect && " · suspeita"}
                  </td>
                  <td className="py-1 text-right text-muted-foreground tabular">
                    {data!.baselineLh === null ? "—" : `${formatNumber(data!.baselineLh, 0)} L/h`}
                  </td>
                  <td className="py-1 text-right text-muted-foreground tabular">
                    {data!.pumpHours === null
                      ? "—"
                      : `${formatNumber(data!.pumpHours, 1)} h${data!.pumpStarts !== null ? ` · ${data!.pumpStarts}×` : ""}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportSection>
      )}
    </>
  );
}
