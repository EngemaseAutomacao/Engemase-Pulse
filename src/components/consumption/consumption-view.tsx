"use client";

import { useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import {
  BarChart3Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  FactoryIcon,
  TableIcon,
  ZapIcon,
} from "lucide-react";
import { AXIS_TICK, ChartMessage, GRID_STROKE, TooltipBox } from "@/components/charts/chart-parts";
import { StatTile } from "@/components/dashboard/stat-tile";
import { NativeSelect } from "@/components/forms/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJson } from "@/lib/fetcher";
import { formatNumber } from "@/lib/format";
import type { ConsumptionResponse } from "@/lib/telemetry-types";
import { cn } from "@/lib/utils";
import { MonthConsumption } from "./month-consumption";
import { plantTag } from "@/lib/meter-label";

type SiteOption = { id: string; name: string; timezone: string };

/** Consumo de um dia por setor: total, hora de pico, maior setor, "não medido" e participação. */
export function ConsumptionView({ tenantSlug, sites }: { tenantSlug: string; sites: SiteOption[] }) {
  const [siteId, setSiteId] = useState(sites[0].id);
  const site = sites.find((s) => s.id === siteId) ?? sites[0];
  const today = localDate(new Date(), site.timezone);
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const day = chosenDate && chosenDate <= today ? chosenDate : today;
  const [sameScale, setSameScale] = useState(true);
  const [showTable, setShowTable] = useState(false);
  const [mode, setMode] = useState<"day" | "month">("day");
  const [quantity, setQuantity] = useState<"ativa" | "aparente">("ativa");

  const { data, error, isLoading } = useSWR<ConsumptionResponse>(
    mode === "day"
      ? `/api/tenants/${tenantSlug}/consumption?site=${site.id}&date=${day}${quantity === "aparente" ? "&grandeza=aparente" : ""}`
      : null,
    fetchJson,
    { refreshInterval: day === today ? 300_000 : 0, keepPreviousData: true },
  );
  const failure = error?.message ?? data?.error ?? null;
  const goTo = (value: string) => setChosenDate(value >= today ? null : value);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {sites.length > 1 && (
          <NativeSelect
            value={site.id}
            onChange={(e) => setSiteId(e.target.value)}
            aria-label="Unidade"
            className="w-full sm:w-64"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        )}
        <div role="radiogroup" aria-label="Período" className="flex rounded-lg border p-0.5">
          {(
            [
              ["day", "Dia"],
              ["month", "Mês"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "min-h-8 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                mode === value && "bg-secondary text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "day" && (
          <>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => goTo(shiftDate(day, -1))}
                aria-label="Dia anterior"
              >
                <ChevronLeftIcon />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setChosenDate(null)} disabled={day === today}>
                Hoje
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => goTo(shiftDate(day, 1))}
                disabled={day >= today}
                aria-label="Próximo dia"
              >
                <ChevronRightIcon />
              </Button>
            </div>
            <Input
              type="date"
              value={day}
              max={today}
              onChange={(e) => e.target.value && goTo(e.target.value)}
              aria-label="Dia"
              className="w-40"
            />
            <span className="text-sm text-muted-foreground first-letter:uppercase">{longDate(day)}</span>
            <div role="radiogroup" aria-label="Energia" className="flex rounded-lg border p-0.5 sm:ml-auto">
              {(
                [
                  ["ativa", "Ativa · kWh", "Energia ativa: a que gira o motor, aquece e ilumina"],
                  ["aparente", "Aparente · kVAh", "Energia aparente: a ativa somada à reativa; a diferença é o efeito do fator de potência"],
                ] as const
              ).map(([value, label, title]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={quantity === value}
                  onClick={() => setQuantity(value)}
                  title={title}
                  className={cn(
                    "min-h-8 rounded-md px-3 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                    quantity === value && "bg-secondary text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {mode === "month" ? (
        <MonthConsumption key={site.id} tenantSlug={tenantSlug} site={site} />
      ) : (
        <>
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
              <Summary data={data} />
              <HourByHour
                data={data}
                sameScale={sameScale}
                onSameScale={setSameScale}
                showTable={showTable}
                onShowTable={setShowTable}
              />
              <Share data={data} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Indicadores do dia
// ---------------------------------------------------------------------------

function Summary({ data }: { data: ConsumptionResponse }) {
  const { entrance, unmeasured, timeZone, hours, unit } = data;
  const apparent = data.quantity === "APPARENT";
  const peak = peakIndex(entrance.kwh);
  const sectors = feedersOf(data);
  const biggest = [...sectors].sort((a, b) => b.total - a.total)[0];
  const share = (value: number) =>
    entrance.total > 0 ? `${formatNumber((value / entrance.total) * 100, 1)} % do total` : "";
  const where = entrance.fromMain ? "na entrada geral" : "na soma dos medidores";

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <StatTile
        label={apparent ? "Energia aparente do dia" : "Consumo do dia"}
        value={formatNumber(entrance.total, 0)}
        unit={unit}
        icon={<ZapIcon />}
        detail={entrance.fromMain ? "Medidor da entrada geral" : "Soma dos medidores (sem entrada geral cadastrada)"}
      />
      <StatTile
        label="Hora de pico"
        value={peak === null ? "—" : hourRange(hours[peak], timeZone)}
        icon={<ClockIcon />}
        detail={peak === null ? "Sem consumo registrado" : `${formatNumber(entrance.kwh[peak], 0)} ${unit} ${where}`}
      />
      <StatTile
        label="Maior setor"
        value={biggest && biggest.total > 0 ? biggest.name : "—"}
        icon={<FactoryIcon />}
        detail={
          biggest && biggest.total > 0 ? `${formatNumber(biggest.total, 0)} ${unit} · ${share(biggest.total)}` : undefined
        }
      />
      {unmeasured ? (
        <StatTile
          label="Não medido"
          value={formatNumber(unmeasured.total, 0)}
          unit={unit}
          detail={`${share(unmeasured.total)} — entrada geral menos a soma dos setores`}
        />
      ) : (
        <StatTile
          label="Setores medidos"
          value={String(sectors.length)}
          detail={
            apparent
              ? "O não medido sai só na energia ativa: a aparente não se soma entre setores"
              : "Cadastre a entrada geral para ver o consumo não medido"
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hora a hora: total da instalação + um gráfico por setor (mesma cor, mesmo eixo)
// ---------------------------------------------------------------------------

function HourByHour({
  data,
  sameScale,
  onSameScale,
  showTable,
  onShowTable,
}: {
  data: ConsumptionResponse;
  sameScale: boolean;
  onSameScale: (value: boolean) => void;
  showTable: boolean;
  onShowTable: (value: boolean) => void;
}) {
  const { entrance, hours, timeZone } = data;
  const sectors = feedersOf(data);
  const hasData = entrance.kwh.some((v) => v !== null);
  const anyEstimated = entrance.estimated.some(Boolean) || sectors.some((s) => s.estimated.some(Boolean));
  const sectorMax = Math.max(0, ...sectors.flatMap((s) => s.kwh.map((v) => v ?? 0)));

  return (
    <section aria-labelledby="hourly-title" className="space-y-4 surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="hourly-title" className="font-semibold">
            Hora a hora
          </h2>
          {anyEstimated && (
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm bg-primary" />
                medido pelo contador
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm bg-primary opacity-40" />
                estimado pela potência
              </li>
            </ul>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sectors.length > 1 && !showTable && (
            <div role="radiogroup" aria-label="Escala dos setores" className="flex rounded-lg border p-0.5">
              {[
                { value: true, label: "Mesma escala" },
                { value: false, label: "Escala de cada setor" },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={sameScale === option.value}
                  onClick={() => onSameScale(option.value)}
                  className={cn(
                    "min-h-8 rounded-md px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                    sameScale === option.value && "bg-secondary text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onShowTable(!showTable)}
            aria-label={showTable ? "Ver gráficos" : "Ver tabela"}
            title={showTable ? "Ver gráficos" : "Ver tabela"}
          >
            {showTable ? <BarChart3Icon /> : <TableIcon />}
          </Button>
        </div>
      </div>

      {!hasData && sectors.every((s) => s.total === 0) ? (
        <div className="h-40">
          <ChartMessage>Sem consumo registrado neste dia.</ChartMessage>
        </div>
      ) : showTable ? (
        <HourlyTable data={data} />
      ) : (
        <>
          <div>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{entrance.fromMain ? "Entrada geral" : "Total (soma dos medidores)"}</span>
              <span className="text-muted-foreground tabular">
                {formatNumber(entrance.total, 0)} {data.unit}
              </span>
            </div>
            <HourlyBars
              hours={hours}
              kwh={entrance.kwh}
              estimated={entrance.estimated}
              timeZone={timeZone}
              unit={data.unit}
              height={220}
            />
          </div>
          {sectors.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sectors.map((s) => (
                <div key={s.id} className="rounded-lg border p-3">
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium" title={s.name}>
                      {plantTag(s.tag) && (
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">{plantTag(s.tag)}</span>
                      )}
                      {s.name}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular">
                      {formatNumber(s.total, 0)} {data.unit}
                    </span>
                  </div>
                  <HourlyBars
                    hours={hours}
                    kwh={s.kwh}
                    estimated={s.estimated}
                    timeZone={timeZone}
                    unit={data.unit}
                    height={130}
                    yMax={sameScale ? niceCeil(sectorMax) : undefined}
                    compact
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function HourlyBars({
  hours,
  kwh,
  estimated,
  timeZone,
  unit,
  height,
  yMax,
  compact = false,
}: {
  hours: number[];
  kwh: (number | null)[];
  estimated: boolean[];
  timeZone: string;
  unit: string;
  height: number;
  yMax?: number;
  compact?: boolean;
}) {
  const rows = hours.map((start, i) => ({ start, kwh: kwh[i], estimated: estimated[i] }));
  // Marcas de 6 em 6 horas do relógio local nos gráficos pequenos.
  const ticks = compact ? hours.filter((h) => localHour(h, timeZone) % 6 === 0) : undefined;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="start"
            ticks={ticks}
            tickFormatter={(t: number) => `${String(localHour(t, timeZone)).padStart(2, "0")}h`}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: GRID_STROKE }}
            minTickGap={compact ? 4 : 12}
          />
          <YAxis
            domain={[0, yMax && yMax > 0 ? yMax : "auto"]}
            tickFormatter={(v: number) => formatNumber(v, 0)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={compact ? 36 : 48}
            tickCount={compact ? 3 : 5}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={(props: TooltipContentProps) => <HourTooltip {...props} timeZone={timeZone} unit={unit} />}
          />
          <Bar dataKey="kwh" radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.start} fill="var(--primary)" fillOpacity={row.estimated ? 0.4 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HourTooltip({ active, payload, timeZone, unit }: TooltipContentProps & { timeZone: string; unit: string }) {
  const row = payload?.[0]?.payload as { start: number; kwh: number | null; estimated: boolean } | undefined;
  if (!active || !row) return null;
  return (
    <TooltipBox
      title={hourRange(row.start, timeZone)}
      rows={[
        {
          key: "kwh",
          label: row.estimated ? "Consumo (estimado pela potência)" : "Consumo",
          value: row.kwh === null ? "sem registro" : `${formatNumber(row.kwh, 1)} ${unit}`,
        },
      ]}
    />
  );
}

function HourlyTable({ data }: { data: ConsumptionResponse }) {
  const sectors = feedersOf(data);
  const columns = [
    {
      key: "entrance",
      label: data.entrance.fromMain ? "Entrada geral" : "Total",
      kwh: data.entrance.kwh,
      total: data.entrance.total,
    },
    ...sectors.map((s) => ({ key: s.id, label: s.name, kwh: s.kwh, total: s.total })),
    ...(data.unmeasured
      ? [{ key: "unmeasured", label: "Não medido", kwh: data.unmeasured.kwh, total: data.unmeasured.total }]
      : []),
  ];
  return (
    <div className="max-h-[28rem] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Hora</TableHead>
            {columns.map((c) => (
              <TableHead key={c.key} className="text-right whitespace-nowrap">
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.hours.map((h, i) => (
            <TableRow key={h}>
              <TableCell className="whitespace-nowrap">{hourRange(h, data.timeZone)}</TableCell>
              {columns.map((c) => (
                <TableCell key={c.key} className="text-right tabular">
                  {c.kwh[i] === null ? "—" : formatNumber(c.kwh[i], 1)}
                </TableCell>
              ))}
            </TableRow>
          ))}
          <TableRow className="bg-muted/50 font-medium">
            <TableCell>Total ({data.unit})</TableCell>
            {columns.map((c) => (
              <TableCell key={c.key} className="text-right tabular">
                {formatNumber(c.total, 1)}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Participação no dia: uma barra por setor, do maior para o menor; "não medido" em cinza
// ---------------------------------------------------------------------------

function Share({ data }: { data: ConsumptionResponse }) {
  const sectors = feedersOf(data);
  const total = data.entrance.total;
  if (sectors.length === 0 || total <= 0) return null;
  const rows = [
    ...sectors.map((s) => ({ key: s.id, label: s.name, value: s.total, muted: false })),
    ...(data.unmeasured ? [{ key: "unmeasured", label: "Não medido", value: data.unmeasured.total, muted: true }] : []),
  ].sort((a, b) => b.value - a.value);
  const max = Math.max(...rows.map((r) => r.value));

  return (
    <section aria-labelledby="share-title" className="space-y-3 surface p-4">
      <h2 id="share-title" className="font-semibold">
        Participação no dia
      </h2>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.key}
            className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_1fr_auto]"
          >
            <span className="truncate" title={r.label}>
              {r.label}
            </span>
            <span className="h-2.5 rounded-sm bg-muted" aria-hidden>
              <span
                className={cn("block h-full rounded-sm", r.muted ? "bg-muted-foreground/60" : "bg-primary")}
                style={{ width: `${max > 0 ? (r.value / max) * 100 : 0}%` }}
              />
            </span>
            <span className="text-right text-xs text-muted-foreground tabular">
              {formatNumber(r.value, 0)} {data.unit} · {formatNumber((r.value / total) * 100, 1)} %
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------

/** Setores: os alimentadores, quando há entrada geral; senão, todos os medidores. */
function feedersOf(data: ConsumptionResponse) {
  return data.entrance.fromMain ? data.sectors.filter((s) => !s.isMain) : data.sectors;
}

/** Arredonda para cima até um número "redondo" (1, 2, 2,5 ou 5 × 10ⁿ), para o topo do eixo. */
function niceCeil(value: number): number {
  if (value <= 0) return 0;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
}

function peakIndex(values: (number | null)[]): number | null {
  let best: number | null = null;
  values.forEach((v, i) => {
    if (v !== null && v > 0 && (best === null || v > (values[best] ?? 0))) best = i;
  });
  return best;
}

/** AAAA-MM-DD do instante no relógio da unidade. */
function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function shiftDate(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function longDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function localHour(epochMs: number, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(epochMs));
}

function hourRange(start: number, timeZone: string): string {
  const from = localHour(start, timeZone);
  const to = (from + 1) % 24;
  return `${String(from).padStart(2, "0")}h–${String(to).padStart(2, "0")}h`;
}
