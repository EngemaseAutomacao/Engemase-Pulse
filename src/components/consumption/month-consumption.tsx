"use client";

import { useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import {
  CalendarRangeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileTextIcon,
  HistoryIcon,
  WalletIcon,
  ZapIcon,
} from "lucide-react";
import { AXIS_TICK, ChartMessage, GRID_STROKE, TooltipBox } from "@/components/charts/chart-parts";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJson } from "@/lib/fetcher";
import { formatChange, formatMoney, formatNumber } from "@/lib/format";
import type { MonthConsumptionResponse } from "@/lib/telemetry-types";
import { cn } from "@/lib/utils";
import { plantTag } from "@/lib/meter-label";

/** AAAA-MM do instante no relógio da unidade. */
export function localMonth(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(date).slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

/** Navegação de mês (anterior, este mês, próximo) usada no consumo e na fatura. */
export function MonthNav({
  month,
  current,
  onChange,
}: {
  month: string;
  current: string;
  onChange: (month: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onChange(shiftMonth(month, -1))}
          aria-label="Mês anterior"
        >
          <ChevronLeftIcon />
        </Button>
        <Button variant="outline" size="sm" onClick={() => onChange(current)} disabled={month === current}>
          Este mês
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onChange(shiftMonth(month, 1))}
          disabled={month >= current}
          aria-label="Próximo mês"
        >
          <ChevronRightIcon />
        </Button>
      </div>
      <span className="text-sm text-muted-foreground first-letter:uppercase">{monthLabel(month)}</span>
    </div>
  );
}

/** Consumo do mês por setor: total, custo, comparação e dia a dia. */
export function MonthConsumption({ tenantSlug, site }: { tenantSlug: string; site: { id: string; timezone: string } }) {
  const current = localMonth(new Date(), site.timezone);
  const [chosen, setChosen] = useState<string | null>(null);
  const month = chosen && chosen <= current ? chosen : current;
  const { data, error, isLoading } = useSWR<MonthConsumptionResponse>(
    `/api/tenants/${tenantSlug}/consumption?site=${site.id}&month=${month}`,
    fetchJson,
    { refreshInterval: month === current ? 300_000 : 0, keepPreviousData: true },
  );
  const failure = error?.message ?? data?.error ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} current={current} onChange={(m) => setChosen(m >= current ? null : m)} />
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/relatorio/${tenantSlug}?unidade=${site.id}&mes=${month}`} target="_blank" rel="noopener">
              <FileTextIcon />
              Relatório do mês
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/tenants/${tenantSlug}/consumption/export?site=${site.id}&month=${month}`} download>
              <DownloadIcon />
              Planilha
            </a>
          </Button>
        </div>
      </div>

      {failure && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {failure}
        </p>
      )}

      {isLoading && !data ? (
        <div className="h-40 surface">
          <ChartMessage>Carregando…</ChartMessage>
        </div>
      ) : data ? (
        <div className={cn("space-y-6 transition-opacity", isLoading && "opacity-60")}>
          <MonthSummary data={data} />
          <DailyBars data={data} />
          <SectorTable data={data} />
        </div>
      ) : null}
    </div>
  );
}

function periodLabel(range: { start: number; stop: number }, partial: boolean, timeZone: string): string {
  const start = new Date(range.start);
  if (!partial) return start.toLocaleDateString("pt-BR", { timeZone, month: "short", year: "numeric" });
  const last = new Date(Math.max(range.start, range.stop - 1));
  const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone, day: "numeric" });
  return `${day(start)}–${day(last)} de ${start.toLocaleDateString("pt-BR", { timeZone, month: "short", year: "numeric" })}`;
}

function MonthSummary({ data }: { data: MonthConsumptionResponse }) {
  const { entrance, comparison, timeZone } = data;
  const prevLabel = periodLabel(comparison.previous, comparison.partial, timeZone);
  const lyLabel = periodLabel(comparison.lastYear, comparison.partial, timeZone);
  const vsPrev = formatChange(entrance.total, entrance.previousTotal);
  const vsLy = formatChange(entrance.total, entrance.lastYearTotal);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <StatTile
        label={comparison.partial ? "Consumo até agora" : "Consumo do mês"}
        value={formatNumber(entrance.total, 0)}
        unit="kWh"
        icon={<ZapIcon />}
        detail={entrance.fromMain ? "Medidor da entrada geral" : "Soma dos medidores (sem entrada geral)"}
      />
      <StatTile
        label="Custo da energia"
        value={entrance.cost === null ? "—" : formatMoney(entrance.cost, true)}
        icon={<WalletIcon />}
        detail={
          data.hasTariff
            ? "Energia com impostos; demanda e reativo na Fatura"
            : "Tarifa da unidade não cadastrada (peça à Engemase)"
        }
      />
      <StatTile
        label="Mês anterior"
        value={vsPrev ?? "—"}
        icon={<CalendarRangeIcon />}
        detail={
          entrance.previousTotal !== null
            ? `${formatNumber(entrance.previousTotal, 0)} kWh em ${prevLabel}`
            : `Sem leituras em ${prevLabel}`
        }
      />
      <StatTile
        label="Ano anterior"
        value={vsLy ?? "—"}
        icon={<HistoryIcon />}
        detail={vsLy ? `${formatNumber(entrance.lastYearTotal!, 0)} kWh em ${lyLabel}` : `Sem leituras em ${lyLabel}`}
      />
    </div>
  );
}

type DayRow = { t: number; kwh: number | null };

function DailyBars({ data }: { data: MonthConsumptionResponse }) {
  const rows: DayRow[] = data.days.map((t, i) => ({ t, kwh: data.entrance.kwh[i] }));
  const hasData = rows.some((r) => r.kwh !== null);
  const dayOf = (t: number) => new Date(t).toLocaleDateString("pt-BR", { timeZone: data.timeZone, day: "numeric" });

  return (
    <section aria-labelledby="daily-title" className="space-y-4 surface p-4">
      <div>
        <h2 id="daily-title" className="font-semibold">
          Dia a dia
        </h2>
        <p className="text-xs text-muted-foreground">
          kWh por dia {data.entrance.fromMain ? "na entrada geral" : "(soma dos medidores)"}
        </p>
      </div>
      <div className="h-56 sm:h-64">
        {!hasData ? (
          <ChartMessage>Sem consumo registrado neste mês.</ChartMessage>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="t"
                tickFormatter={dayOf}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: GRID_STROKE }}
                minTickGap={8}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) => formatNumber(v, 0)}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                content={(props: TooltipContentProps) => {
                  const row = props.payload?.[0]?.payload as DayRow | undefined;
                  if (!props.active || !row) return null;
                  return (
                    <TooltipBox
                      title={new Date(row.t).toLocaleDateString("pt-BR", {
                        timeZone: data.timeZone,
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                      rows={[
                        {
                          key: "kwh",
                          label: "Consumo",
                          value: row.kwh === null ? "sem leitura" : `${formatNumber(row.kwh, 0)} kWh`,
                        },
                      ]}
                    />
                  );
                }}
              />
              <Bar
                dataKey="kwh"
                fill="var(--primary)"
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function Change({ current, previous }: { current: number; previous: number | null }) {
  const text = formatChange(current, previous);
  return <span className="text-muted-foreground tabular">{text ?? "—"}</span>;
}

function SectorTable({ data }: { data: MonthConsumptionResponse }) {
  const sectors = data.entrance.fromMain ? data.sectors.filter((s) => !s.isMain) : data.sectors;
  const total = data.entrance.total;
  const rows = [...sectors].sort((a, b) => b.total - a.total);
  const share = (v: number) => (total > 0 ? `${formatNumber((v / total) * 100, 1)} %` : "—");

  return (
    <section aria-labelledby="sectors-title" className="overflow-hidden surface">
      <h2 id="sectors-title" className="px-4 pt-4 font-semibold">
        Por setor
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Setor</TableHead>
            <TableHead className="text-right">kWh</TableHead>
            <TableHead className="text-right">%</TableHead>
            {data.hasTariff && <TableHead className="text-right">Custo</TableHead>}
            <TableHead className="hidden text-right sm:table-cell">vs. mês anterior</TableHead>
            <TableHead className="hidden pr-4 text-right md:table-cell">vs. ano anterior</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="pl-4">
                {plantTag(s.tag) && (
                  <span className="mr-2 font-mono text-xs text-muted-foreground">{plantTag(s.tag)}</span>
                )}
                {s.name}
              </TableCell>
              <TableCell className="text-right tabular">{formatNumber(s.total, 0)}</TableCell>
              <TableCell className="text-right text-muted-foreground tabular">{share(s.total)}</TableCell>
              {data.hasTariff && <TableCell className="text-right tabular">{formatMoney(s.cost)}</TableCell>}
              <TableCell className="hidden text-right sm:table-cell">
                <Change current={s.total} previous={s.previousTotal} />
              </TableCell>
              <TableCell className="hidden pr-4 text-right md:table-cell">
                <Change current={s.total} previous={s.lastYearTotal} />
              </TableCell>
            </TableRow>
          ))}
          {data.unmeasured && (
            <TableRow className="text-muted-foreground">
              <TableCell className="pl-4">Não medido</TableCell>
              <TableCell className="text-right tabular">{formatNumber(data.unmeasured.total, 0)}</TableCell>
              <TableCell className="text-right tabular">{share(data.unmeasured.total)}</TableCell>
              {data.hasTariff && (
                <TableCell className="text-right tabular">{formatMoney(data.unmeasured.cost)}</TableCell>
              )}
              <TableCell className="hidden sm:table-cell" />
              <TableCell className="hidden md:table-cell" />
            </TableRow>
          )}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="pl-4 font-medium">{data.entrance.fromMain ? "Entrada geral" : "Total"}</TableCell>
            <TableCell className="text-right font-medium tabular">{formatNumber(total, 0)}</TableCell>
            <TableCell className="text-right tabular">100 %</TableCell>
            {data.hasTariff && (
              <TableCell className="text-right font-medium tabular">{formatMoney(data.entrance.cost)}</TableCell>
            )}
            <TableCell className="hidden text-right sm:table-cell">
              <Change current={total} previous={data.entrance.previousTotal} />
            </TableCell>
            <TableCell className="hidden pr-4 text-right md:table-cell">
              <Change current={total} previous={data.entrance.lastYearTotal} />
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <p className="px-4 py-3 text-xs text-muted-foreground">
        {data.comparison.partial
          ? "Mês em andamento: as comparações usam o mesmo trecho dos meses de referência."
          : "Comparações com o mês inteiro de referência."}
        {data.hasTariff && " Custo da energia por posto tarifário (ponta e fora ponta), com impostos."}
      </p>
    </section>
  );
}
