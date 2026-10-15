"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { BuildingIcon, GitCompareArrowsIcon, TableIcon, XIcon } from "lucide-react";
import { AXIS_TICK, ChartMessage, GRID_STROKE, TooltipBox } from "@/components/charts/chart-parts";
import { formatBucket } from "@/components/charts/energy-chart";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  COMPARE_FIELDS,
  COMPARE_PERIODS,
  MAX_COMPARED_METERS,
  compareFieldLabel,
  compareHistoryWindow,
  compareSearch,
  type CompareField,
  type CompareState,
} from "@/lib/compare";
import { fetchJson } from "@/lib/fetcher";
import { formatField, formatNumber } from "@/lib/format";
import { FIELD_BY_KEY } from "@/lib/meter-fields";
import type { EnergyResponse, HistoryResponse } from "@/lib/telemetry-types";
import type { EnergyPeriodId } from "@/lib/time-range";
import { cn } from "@/lib/utils";

export type CompareSite = {
  id: string;
  name: string;
  timezone: string;
  meters: { id: string; tag: string; name: string; isMain: boolean }[];
};

type MeterInfo = CompareSite["meters"][number] & { siteId: string; siteName: string; timezone: string };

/** Cor por posição de escolha (1ª, 2ª, 3ª) — validadas para se distinguirem todas entre si. */
const SLOT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"] as const;

/** Medidor escolhido e a cor dele. A cor fica com o medidor: tirar outro não repinta. */
type Selected = { id: string; slot: number };

/** `label` identifica o medidor no tooltip; inclui a unidade quando a comparação tem mais de uma. */
type Series = { key: string; tag: string; name: string; siteName: string; label: string; color: string };

type Row = { t: number } & Record<string, number>;

type PerMeter<T> = Record<string, { data: T | null; error: string | null }>;

async function fetchEach<T extends { error: string | null }>(
  ids: string[],
  url: (id: string) => string,
): Promise<PerMeter<T>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        const data = await fetchJson<T>(url(id));
        return [id, { data, error: data.error }] as const;
      } catch (error) {
        return [id, { data: null, error: error instanceof Error ? error.message : "Falha ao carregar" }] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/** Compara até 3 medidores, da mesma unidade ou de unidades diferentes. */
export function CompareView({
  tenantSlug,
  sites,
  initial,
}: {
  tenantSlug: string;
  sites: CompareSite[];
  initial: CompareState;
}) {
  const meters = new Map<string, MeterInfo>(
    sites.flatMap((s) =>
      s.meters.map((m) => [m.id, { ...m, siteId: s.id, siteName: s.name, timezone: s.timezone }] as const),
    ),
  );
  const [selected, setSelected] = useState<Selected[]>(() => initial.meterIds.map((id, slot) => ({ id, slot })));
  const [field, setField] = useState<CompareField>(initial.field);
  const [period, setPeriod] = useState<EnergyPeriodId>(initial.period);
  const [showEnergyTable, setShowEnergyTable] = useState(false);

  // A URL acompanha a escolha: dá para salvar nos favoritos ou mandar o link.
  useEffect(() => {
    const search = compareSearch({ meterIds: selected.map((s) => s.id), field, period });
    window.history.replaceState(null, "", `${window.location.pathname}${search}`);
  }, [selected, field, period]);

  const add = (id: string) =>
    setSelected((current) => {
      if (current.length >= MAX_COMPARED_METERS || current.some((s) => s.id === id)) return current;
      const used = new Set(current.map((s) => s.slot));
      const slot = SLOT_COLORS.findIndex((_, i) => !used.has(i));
      return [...current, { id, slot }];
    });
  const remove = (id: string) => setSelected((current) => current.filter((s) => s.id !== id));

  const chosen = selected.flatMap((s) => {
    const meter = meters.get(s.id);
    return meter ? [{ meter, color: SLOT_COLORS[s.slot] }] : [];
  });
  const manySites = new Set(chosen.map((c) => c.meter.siteId)).size > 1;
  const series: Series[] = chosen.map(({ meter: m, color }) => ({
    key: m.id,
    tag: m.tag,
    name: m.name,
    siteName: m.siteName,
    label: manySites ? `${m.name} · ${m.siteName}` : m.name,
    color,
  }));
  const ids = series.map((s) => s.key);
  const idsKey = ids.join(",");
  const timeZone = meters.get(ids[0])?.timezone ?? "America/Sao_Paulo";
  const isMobile = useIsMobile();
  // Rótulos no fim das linhas: só com espaço (no celular a legenda acima basta).
  const endLabels = series.length > 1 && !isMobile;
  const manyZones = new Set(ids.map((id) => meters.get(id)?.timezone)).size > 1;
  const refreshInterval = period === "today" ? 60_000 : 300_000;

  const history = useSWR(
    ids.length ? ["compare-history", tenantSlug, idsKey, field, period, timeZone] : null,
    ([, slug, key, f, p, tz]: [string, string, string, CompareField, EnergyPeriodId, string]) => {
      const { from, to } = compareHistoryWindow(p, new Date(), tz);
      const query = new URLSearchParams({ fields: f, from: from.toISOString(), to: to.toISOString() });
      return fetchEach<HistoryResponse>(key.split(","), (id) => `/api/tenants/${slug}/meters/${id}/history?${query}`);
    },
    { refreshInterval, keepPreviousData: true },
  );
  const energy = useSWR(
    ids.length ? ["compare-energy", tenantSlug, idsKey, period] : null,
    ([, slug, key, p]: [string, string, string, EnergyPeriodId]) =>
      fetchEach<EnergyResponse>(key.split(","), (id) => `/api/tenants/${slug}/meters/${id}/energy?period=${p}`),
    { refreshInterval, keepPreviousData: true },
  );

  const lineRows = mergeHistory(history.data, ids, field);
  const firstEnergy = ids.map((id) => energy.data?.[id]?.data).find((d) => d && d.buckets.length > 0) ?? null;
  const energyRows = firstEnergy ? mergeEnergy(energy.data, ids, firstEnergy) : [];

  const fieldMeta = FIELD_BY_KEY.get(field);
  const historyErrors = series.flatMap((s) => {
    const error = history.data?.[s.key]?.error;
    return error ? [`${s.tag}: ${error}`] : [];
  });
  const every = ids.map((id) => history.data?.[id]?.data?.every).find(Boolean);
  const mains = sites.flatMap((s) => s.meters.filter((m) => m.isMain).slice(0, 1));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {series.map((s) => (
          <span
            key={s.key}
            className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg border bg-card py-1 pr-1 pl-3 text-sm"
          >
            <span aria-hidden className="h-1 w-4 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="font-mono text-xs text-muted-foreground">{s.tag}</span>
            <span className="truncate font-medium">{s.name}</span>
            {manySites && <span className="truncate text-xs text-muted-foreground">{s.siteName}</span>}
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Tirar ${s.name} da comparação`}
              onClick={() => remove(s.key)}
            >
              <XIcon />
            </Button>
          </span>
        ))}
        {series.length < MAX_COMPARED_METERS && (
          <Select value="" onValueChange={add}>
            <SelectTrigger className="min-h-9 w-56" aria-label="Adicionar medidor">
              <SelectValue placeholder="Adicionar medidor…" />
            </SelectTrigger>
            <SelectContent>
              {sites.map((site) => (
                <SelectGroup key={site.id}>
                  <SelectLabel>{site.name}</SelectLabel>
                  {site.meters.map((m) => (
                    <SelectItem key={m.id} value={m.id} disabled={ids.includes(m.id)}>
                      <span className="font-mono text-xs text-muted-foreground">{m.tag}</span> {m.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
        {mains.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            className="min-h-9"
            onClick={() => setSelected(mains.slice(0, MAX_COMPARED_METERS).map((m, slot) => ({ id: m.id, slot })))}
          >
            <BuildingIcon />
            Entradas gerais das unidades
          </Button>
        )}

        <div
          role="radiogroup"
          aria-label="Período"
          className="flex w-full rounded-lg border p-0.5 sm:ml-auto sm:w-auto"
        >
          {COMPARE_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                "min-h-8 flex-1 rounded-md px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:flex-none",
                period === p.id && "bg-secondary text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {series.length === 0 ? (
        <div className="flex flex-col items-center gap-3 surface px-6 py-16 text-center">
          <GitCompareArrowsIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">Escolha até {MAX_COMPARED_METERS} medidores para comparar</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Podem ser da mesma unidade (ex.: dois setores) ou de unidades diferentes (ex.: a entrada geral de duas
            unidades).
          </p>
        </div>
      ) : (
        <>
          <section aria-labelledby="compare-line-title" className="space-y-4 surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="compare-line-title" className="font-semibold">
                  {fieldMeta?.label ?? field}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {fieldMeta?.unit ? `${fieldMeta.unit} · ` : ""}média a cada {every ?? "…"}
                  {series.length === 1 && " · adicione outro medidor para comparar"}
                </p>
              </div>
              <Select value={field} onValueChange={(v) => setField(v as CompareField)}>
                <SelectTrigger className="w-full sm:w-64" aria-label="Grandeza">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPARE_FIELDS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {compareFieldLabel(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="h-72 sm:h-96" aria-busy={history.isLoading}>
              {history.error ? (
                <ChartMessage tone="error">{history.error.message}</ChartMessage>
              ) : history.isLoading && lineRows.length === 0 ? (
                <ChartMessage>Carregando…</ChartMessage>
              ) : lineRows.length === 0 ? (
                <ChartMessage>
                  {historyErrors[0] ?? "Nenhum dos medidores escolhidos tem esta grandeza neste período."}
                </ChartMessage>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={lineRows}
                    margin={{ top: 8, right: endLabels ? (manySites ? 104 : 72) : 12, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                    <XAxis
                      dataKey="t"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(t: number) => formatTimeTick(t, period, timeZone)}
                      tick={AXIS_TICK}
                      tickLine={false}
                      axisLine={{ stroke: GRID_STROKE }}
                      minTickGap={40}
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      tickFormatter={formatAxisValue}
                      tick={AXIS_TICK}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                    />
                    <Tooltip
                      cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                      content={(props: TooltipContentProps) => (
                        <LineTooltip {...props} series={series} field={field} timeZone={timeZone} />
                      )}
                    />
                    {series.map((s) => (
                      <Line
                        key={s.key}
                        dataKey={s.key}
                        name={s.name}
                        stroke={s.color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        dot={false}
                        activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                        isAnimationActive={false}
                        connectNulls={false}
                      />
                    ))}
                    {endLabels && <EndLabels rows={lineRows} series={series} withSite={manySites} />}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section aria-labelledby="compare-energy-title" className="space-y-4 surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="compare-energy-title" className="font-semibold">
                  Consumo de energia
                </h2>
                <p className="text-xs text-muted-foreground">
                  kWh por {firstEnergy?.interval === "1h" ? "hora" : firstEnergy?.interval === "1mo" ? "mês" : "dia"}
                  {manyZones && " · cada unidade no seu fuso horário"}
                </p>
              </div>
              <Button
                variant={showEnergyTable ? "secondary" : "ghost"}
                size="icon"
                aria-label={showEnergyTable ? "Ver gráfico" : "Ver tabela"}
                aria-pressed={showEnergyTable}
                onClick={() => setShowEnergyTable((v) => !v)}
              >
                <TableIcon />
              </Button>
            </div>
            {energy.error ? (
              <ChartMessage tone="error">{energy.error.message}</ChartMessage>
            ) : energy.isLoading && energyRows.length === 0 ? (
              <div className="h-64">
                <ChartMessage>Carregando…</ChartMessage>
              </div>
            ) : !firstEnergy ? (
              <div className="h-64">
                <ChartMessage>Sem consumo registrado neste período.</ChartMessage>
              </div>
            ) : showEnergyTable ? (
              <EnergyTable
                rows={energyRows}
                series={series}
                interval={firstEnergy.interval}
                timeZone={firstEnergy.timeZone}
              />
            ) : (
              <div className="h-64 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={energyRows}
                    margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                    barGap={2}
                    barCategoryGap="18%"
                  >
                    <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                    <XAxis
                      dataKey="t"
                      tickFormatter={(t: number) =>
                        formatBucket(t, firstEnergy.interval, firstEnergy.timeZone, "short")
                      }
                      tick={AXIS_TICK}
                      tickLine={false}
                      axisLine={{ stroke: GRID_STROKE }}
                      minTickGap={16}
                    />
                    <YAxis
                      tickFormatter={formatAxisValue}
                      tick={AXIS_TICK}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)" }}
                      content={(props: TooltipContentProps) => (
                        <EnergyTooltip
                          {...props}
                          series={series}
                          interval={firstEnergy.interval}
                          timeZone={firstEnergy.timeZone}
                        />
                      )}
                    />
                    {series.map((s) => (
                      <Bar
                        key={s.key}
                        dataKey={s.key}
                        name={s.name}
                        fill={s.color}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={18}
                        isAnimationActive={false}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section aria-labelledby="compare-summary-title" className="overflow-hidden surface">
            <h2 id="compare-summary-title" className="px-4 pt-4 font-semibold">
              Resumo do período
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Medidor</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Mínima</TableHead>
                  <TableHead className="text-right">Média</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Máxima</TableHead>
                  <TableHead className="pr-4 text-right">Consumo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {series.map((s) => {
                  const stats = summarize(history.data?.[s.key]?.data?.series[field] ?? []);
                  const total = energy.data?.[s.key]?.data?.totalKwh;
                  return (
                    <TableRow key={s.key}>
                      <TableCell className="pl-4">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="h-1 w-4 shrink-0 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              <span className="font-mono text-xs text-muted-foreground">{s.tag}</span> {s.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">{s.siteName}</span>
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-right whitespace-nowrap tabular sm:table-cell">
                        {stats ? formatField(field, stats.min) : "—"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular">
                        {stats ? formatField(field, stats.avg) : "—"}
                      </TableCell>
                      <TableCell className="hidden text-right whitespace-nowrap tabular sm:table-cell">
                        {stats ? formatField(field, stats.max) : "—"}
                      </TableCell>
                      <TableCell className="pr-4 text-right whitespace-nowrap tabular">
                        {total !== undefined ? `${formatNumber(total, total >= 100 ? 0 : 1)} kWh` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="px-4 py-3 text-xs text-muted-foreground">
              {fieldMeta?.label ?? field}: mínima e máxima entre as médias a cada {every ?? "…"}, não leituras
              instantâneas.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Nome curto (TAG) no fim de cada linha, para identificar sem depender só da
 * cor. Rótulos próximos são afastados para não se sobreporem.
 */
function EndLabels({ rows, series, withSite }: { rows: Row[]; series: Series[]; withSite: boolean }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const area = usePlotArea();
  if (!xScale || !yScale || !area) return null;

  const points = series.flatMap((s) => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const value = rows[i][s.key];
      if (value === undefined) continue;
      const x = xScale(rows[i].t);
      const y = yScale(value);
      return x === undefined || y === undefined ? [] : [{ ...s, x, y, labelY: y }];
    }
    return [];
  });
  points.sort((a, b) => a.y - b.y);
  // Com a unidade, cada rótulo tem duas linhas (TAG e unidade).
  const GAP = withSite ? 28 : 14;
  for (let i = 1; i < points.length; i++) {
    points[i].labelY = Math.max(points[i].labelY, points[i - 1].labelY + GAP);
  }
  const overflow = points.length ? points[points.length - 1].labelY - (area.y + area.height) : 0;
  if (overflow > 0) for (const p of points) p.labelY -= overflow;

  return (
    <g aria-hidden>
      {points.map((p) => (
        <g key={p.key}>
          <circle cx={p.x} cy={p.y} r={4} fill={p.color} stroke="var(--card)" strokeWidth={2} />
          <text
            x={area.x + area.width + 8}
            y={withSite ? p.labelY - 6 : p.labelY}
            dominantBaseline="middle"
            fontSize={11}
            fill="var(--foreground)"
            className="font-mono"
          >
            {p.tag}
          </text>
          {withSite && (
            <text
              x={area.x + area.width + 8}
              y={p.labelY + 7}
              dominantBaseline="middle"
              fontSize={10}
              fill="var(--muted-foreground)"
            >
              {p.siteName.length > 14 ? `${p.siteName.slice(0, 13)}…` : p.siteName}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}

function LineTooltip({
  active,
  payload,
  label,
  series,
  field,
  timeZone,
}: TooltipContentProps & { series: Series[]; field: CompareField; timeZone: string }) {
  if (!active || !payload?.length || typeof label !== "number") return null;
  const row = payload[0]?.payload as Row | undefined;
  if (!row) return null;
  return (
    <TooltipBox
      title={new Date(label).toLocaleString("pt-BR", { timeZone, dateStyle: "short", timeStyle: "short" })}
      rows={series.map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        value: row[s.key] === undefined ? "—" : formatField(field, row[s.key]),
      }))}
    />
  );
}

function EnergyTooltip({
  active,
  payload,
  label,
  series,
  interval,
  timeZone,
}: TooltipContentProps & { series: Series[]; interval: EnergyResponse["interval"]; timeZone: string }) {
  if (!active || !payload?.length || typeof label !== "number") return null;
  const row = payload[0]?.payload as Row | undefined;
  if (!row) return null;
  return (
    <TooltipBox
      title={formatBucket(label, interval, timeZone, "long")}
      rows={series.map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        value: row[s.key] === undefined ? "—" : `${formatNumber(row[s.key], 1)} kWh`,
      }))}
    />
  );
}

function EnergyTable({
  rows,
  series,
  interval,
  timeZone,
}: {
  rows: Row[];
  series: Series[];
  interval: EnergyResponse["interval"];
  timeZone: string;
}) {
  return (
    <div className="max-h-96 overflow-auto rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow>
            <TableHead>Período</TableHead>
            {series.map((s) => (
              <TableHead key={s.key} className="text-right whitespace-nowrap">
                {s.tag} (kWh)
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.t}>
              <TableCell className="whitespace-nowrap">{formatBucket(row.t, interval, timeZone, "long")}</TableCell>
              {series.map((s) => (
                <TableCell key={s.key} className="text-right tabular">
                  {row[s.key] === undefined ? "—" : formatNumber(row[s.key], 1)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Uma linha por instante, uma coluna por medidor (as janelas são alinhadas no servidor). */
function mergeHistory(data: PerMeter<HistoryResponse> | undefined, ids: string[], field: CompareField): Row[] {
  const byTime = new Map<number, Row>();
  for (const id of ids) {
    for (const [t, v] of data?.[id]?.data?.series[field] ?? []) {
      let row = byTime.get(t);
      if (!row) byTime.set(t, (row = { t } as Row));
      row[id] = v;
    }
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

/** Janelas de consumo pela posição no período (hora/dia/mês do calendário de cada unidade). */
function mergeEnergy(data: PerMeter<EnergyResponse> | undefined, ids: string[], axis: EnergyResponse): Row[] {
  return axis.buckets.map((bucket, i) => {
    const row = { t: bucket.start } as Row;
    for (const id of ids) {
      const kwh = data?.[id]?.data?.buckets[i]?.kwh;
      if (kwh !== null && kwh !== undefined) row[id] = kwh;
    }
    return row;
  });
}

function summarize(points: [number, number][]): { min: number; avg: number; max: number } | null {
  if (points.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const [, v] of points) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, avg: sum / points.length, max };
}

function formatTimeTick(t: number, period: EnergyPeriodId, timeZone: string): string {
  const date = new Date(t);
  if (period === "today") return date.toLocaleTimeString("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" });
  if (period === "7d") {
    return date.toLocaleString("pt-BR", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (period === "30d") return date.toLocaleDateString("pt-BR", { timeZone, day: "2-digit", month: "2-digit" });
  return date.toLocaleDateString("pt-BR", { timeZone, month: "short", year: "2-digit" });
}

/** Casas decimais do eixo pela grandeza: 160 · 12,5 · 0,95. */
function formatAxisValue(value: number): string {
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  return formatNumber(value, magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2);
}
