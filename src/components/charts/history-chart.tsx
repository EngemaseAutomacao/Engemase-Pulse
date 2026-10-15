"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import {
  CalendarRangeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  HistoryIcon,
  Maximize2Icon,
  Minimize2Icon,
  SlidersHorizontalIcon,
  Undo2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchJson } from "@/lib/fetcher";
import { formatField, formatNumber } from "@/lib/format";
import {
  PREVIOUS_SUFFIX,
  axisDecimals,
  historyLimits,
  mergeHistoryRows,
  penStats,
  previousWindow,
  relativeChange,
  valueExtent,
  type HistoryRow,
} from "@/lib/history-stats";
import { CHART_PRESETS, SERIES_LABEL, type ChartPresetId } from "@/lib/meter-fields";
import type { HistoryResponse } from "@/lib/telemetry-types";
import { HISTORY_RANGES, MAX_HISTORY_SPAN_MS, MIN_HISTORY_SPAN_MS, type HistoryRangeId } from "@/lib/time-range";
import { cn } from "@/lib/utils";
import { AXIS_TICK, ChartMessage, GRID_STROKE, SERIES_COLORS, TooltipBox } from "./chart-parts";
import { PenLegend, PenSwatch, type Pen } from "./pen-legend";
import { resetPenColors, setPenColor, setPenHidden, showAllPens, usePenSettings } from "./pen-settings";

/** Período escolhido à mão (zoom, setas ou "Período…"); null = período rápido (24 h etc.) até agora. */
type View = { from: number; to: number };

/** Histórico de um medidor: grandezas, período, penas configuráveis e estatísticas. */
export function HistoryChart({
  tenantSlug,
  meterId,
  canExport,
  breakerAmps,
}: {
  tenantSlug: string;
  meterId: string;
  canExport: boolean;
  /** Corrente nominal do disjuntor, para a linha de referência nas correntes. */
  breakerAmps?: number | null;
}) {
  const [presetId, setPresetId] = useState<ChartPresetId>("power");
  const [rangeId, setRangeId] = useState<HistoryRangeId>("24h");
  const [view, setView] = useState<View | null>(null);
  const [zoomHistory, setZoomHistory] = useState<(View | null)[]>([]);
  const [compare, setCompare] = useState(false);
  const [showLimits, setShowLimits] = useState(true);
  const [fromZero, setFromZero] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const settings = usePenSettings();
  const preset = CHART_PRESETS.find((p) => p.id === presetId) ?? CHART_PRESETS[0];
  const fields = preset.fields.join(",");

  const query = new URLSearchParams(
    view ? { fields, from: iso(view.from), to: iso(view.to) } : { fields, range: rangeId },
  ).toString();
  const base = `/api/tenants/${tenantSlug}/meters/${meterId}`;
  const { data, error, isLoading } = useSWR<HistoryResponse>(`${base}/history?${query}`, fetchJson, {
    refreshInterval: view ? 0 : rangeId === "1h" || rangeId === "6h" ? 60_000 : 300_000,
    keepPreviousData: true,
  });

  const start = data ? Date.parse(data.start) : null;
  const stop = data ? Date.parse(data.stop) : null;
  const everyMs = data?.everyMs ?? 300_000;
  const previous = compare && start !== null && stop !== null ? previousWindow(start, stop, everyMs) : null;
  const { data: previousData } = useSWR<HistoryResponse>(
    previous ? `${base}/history?${new URLSearchParams({ fields, from: iso(previous.from), to: iso(previous.to) })}` : null,
    fetchJson,
    { keepPreviousData: true },
  );
  // Só usa o anterior da mesma grade (ao trocar de período, o antigo fica de lado até chegar o novo).
  const previousSeries =
    compare && previousData && start !== null && previousData.everyMs === everyMs ? previousData : null;

  const rows = mergeHistoryRows(
    data?.series ?? {},
    previousSeries && start !== null
      ? { series: previousSeries.series, offset: start - Date.parse(previousSeries.start), everyMs }
      : null,
  );

  const hidden = new Set(settings.hidden[presetId] ?? []);
  const pens: Pen[] = preset.fields.map((key, i) => {
    const custom = settings.colors[key];
    return {
      key,
      label: ("labels" in preset ? (preset.labels as Record<string, string>)[key] : undefined) ?? SERIES_LABEL[key] ?? key,
      color: custom ?? SERIES_COLORS[i % SERIES_COLORS.length],
      hidden: hidden.has(key),
      custom: Boolean(custom),
    };
  });
  const visible = pens.filter((p) => !p.hidden);
  const limits = historyLimits(preset.fields, breakerAmps);
  const plotted = visible.flatMap((p) => (previousSeries ? [p.key, p.key + PREVIOUS_SUFFIX] : [p.key]));
  const extent = valueExtent(rows, plotted);
  const axisLimits = showLimits ? limits.filter((l) => l.extendAxis).map((l) => l.value) : [];
  const digits = axisDecimals(
    extent && [Math.min(extent[0], ...axisLimits, fromZero ? 0 : Infinity), Math.max(extent[1], ...axisLimits)],
  );
  const spanMs = start !== null && stop !== null ? stop - start : 86_400_000;
  const failure = error?.message ?? data?.error;

  // Ampliado: Esc volta e a página de trás não rola.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const goTo = (next: View | null) => {
    setZoomHistory((stack) => [...stack, view]);
    setView(next);
  };
  const choosePreset = (id: HistoryRangeId) => {
    setRangeId(id);
    setView(null);
    setZoomHistory([]);
  };
  const undoZoom = () => {
    setView(zoomHistory.at(-1) ?? null);
    setZoomHistory((stack) => stack.slice(0, -1));
  };
  const step = (direction: -1 | 1) => {
    if (start === null || stop === null) return;
    const span = stop - start;
    const now = Date.now();
    const to = stop + direction * span;
    if (to < now - Math.max(everyMs, 60_000)) return goTo({ from: start + direction * span, to });
    // Chegou ao agora: com o tamanho de um período rápido, volta a acompanhar ao vivo.
    if (HISTORY_RANGES.some((r) => r.id === rangeId && Math.abs(r.durationMs - span) < 60_000)) return goTo(null);
    goTo({ from: now - span, to: now });
  };
  const finishDrag = () => {
    if (!drag) return;
    setDrag(null);
    const from = Math.min(drag.a, drag.b);
    const to = Math.max(drag.a, drag.b) + everyMs;
    if (to - from < 2 * everyMs) return; // Foi só um clique.
    const center = (from + to) / 2;
    goTo(to - from >= MIN_HISTORY_SPAN_MS ? { from, to } : { from: center - MIN_HISTORY_SPAN_MS / 2, to: center + MIN_HISTORY_SPAN_MS / 2 });
  };

  const xDomain: [number, number] | ["dataMin", "dataMax"] =
    start !== null && stop !== null ? [start, stop] : ["dataMin", "dataMax"];
  const previousLabel =
    previous && previousSeries
      ? `${formatMoment(previous.from, spanMs)} – ${formatMoment(previous.to, spanMs)}`
      : compare
        ? "carregando…"
        : null;

  return (
    <section
      aria-labelledby="history-title"
      className={cn(
        "surface space-y-4 p-4",
        expanded && "fixed inset-0 z-40 overflow-y-auto rounded-none p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-6",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="history-title" className="font-semibold">
            Histórico
          </h2>
          <p className="text-xs text-muted-foreground">
            {preset.label}
            {preset.unit ? ` (${preset.unit})` : ""} · média a cada {data?.every ?? "…"}
            {view && start !== null && stop !== null && (
              <>
                {" "}
                · {formatMoment(start, spanMs)} – {formatMoment(stop, spanMs)}
              </>
            )}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select value={presetId} onValueChange={(v) => setPresetId(v as ChartPresetId)}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Grandeza">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHART_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div role="radiogroup" aria-label="Período" className="flex w-full rounded-lg border p-0.5 sm:w-auto">
            {HISTORY_RANGES.map((r) => {
              const checked = !view && rangeId === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => choosePreset(r.id)}
                  className={cn(
                    "min-h-8 flex-1 rounded-md px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:flex-none",
                    checked && "bg-secondary text-foreground",
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="rounded-r-none"
            aria-label="Voltar um período"
            title="Voltar um período"
            disabled={start === null}
            onClick={() => step(-1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="-ml-px rounded-l-none"
            aria-label="Avançar um período"
            title="Avançar um período"
            disabled={!view}
            onClick={() => step(1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
        <CustomRangeButton start={start} stop={stop} onApply={goTo} />
        {zoomHistory.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={undoZoom}>
            <Undo2Icon />
            Desfazer zoom
          </Button>
        )}
        <Button
          type="button"
          variant={compare ? "secondary" : "outline"}
          size="sm"
          aria-pressed={compare}
          onClick={() => setCompare((c) => !c)}
          title="Desenha o período anterior, de mesmo tamanho, tracejado"
        >
          <HistoryIcon />
          Comparar com anterior
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <SlidersHorizontalIcon />
              Opções
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Gráfico</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={showLimits}
              disabled={limits.length === 0}
              onCheckedChange={(v) => setShowLimits(v === true)}
              onSelect={(e) => e.preventDefault()}
            >
              Limites{limits.length === 0 ? " (não há nesta grandeza)" : ""}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={fromZero}
              onCheckedChange={(v) => setFromZero(v === true)}
              onSelect={(e) => e.preventDefault()}
            >
              Eixo começando no zero
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-2">
          {canExport && (
            <Button asChild variant="outline" size="sm">
              <a href={`${base}/export?${query}`} download>
                <DownloadIcon />
                CSV
              </a>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={expanded ? "Reduzir gráfico" : "Ampliar gráfico"}
            title={expanded ? "Reduzir (Esc)" : "Ampliar"}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
          </Button>
        </div>
      </div>

      <PenLegend
        pens={pens}
        onToggle={(key) => setPenHidden(presetId, key, !hidden.has(key))}
        onColor={setPenColor}
        onShowAll={() => showAllPens(presetId)}
        onResetColors={() => resetPenColors(preset.fields)}
      />
      {previousLabel && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <PenSwatch color="var(--muted-foreground)" /> período exibido
          </span>
          <span className="flex items-center gap-1.5">
            <PenSwatch color="var(--muted-foreground)" dashed /> anterior: {previousLabel}
          </span>
        </p>
      )}

      <div
        className={cn("select-none md:cursor-crosshair", expanded ? "h-[max(18rem,calc(100dvh-22rem))]" : "h-64 sm:h-80")}
        aria-busy={isLoading}
      >
        {failure ? (
          <ChartMessage tone="error">{failure}</ChartMessage>
        ) : isLoading && rows.length === 0 ? (
          <ChartMessage>Carregando…</ChartMessage>
        ) : rows.length === 0 ? (
          <ChartMessage>Sem leituras neste período.</ChartMessage>
        ) : visible.length === 0 ? (
          <ChartMessage>
            Todas as penas estão ocultas.{" "}
            <button type="button" className="font-medium text-primary underline" onClick={() => showAllPens(presetId)}>
              Mostrar todas
            </button>
          </ChartMessage>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rows}
              margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
              onMouseDown={(state) => {
                const t = Number(state.activeLabel);
                if (Number.isFinite(t)) setDrag({ a: t, b: t });
              }}
              onMouseMove={(state) => {
                const t = Number(state.activeLabel);
                if (drag && Number.isFinite(t) && t !== drag.b) setDrag({ a: drag.a, b: t });
              }}
              onMouseUp={finishDrag}
              onMouseLeave={() => setDrag(null)}
            >
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={xDomain}
                allowDataOverflow
                tickFormatter={(t: number) => formatTick(t, spanMs)}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: GRID_STROKE }}
                minTickGap={40}
              />
              <YAxis
                domain={fromZero ? [(min: number) => Math.min(0, min), "auto"] : ["auto", "auto"]}
                tickFormatter={(v: number) => (v === 0 ? "0" : formatNumber(v, digits))}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                content={(props: TooltipContentProps) => (
                  <HistoryTooltip
                    {...props}
                    pens={visible}
                    compare={Boolean(previousSeries)}
                    offset={previousSeries && start !== null ? start - Date.parse(previousSeries.start) : 0}
                  />
                )}
              />
              {showLimits &&
                limits.map((limit) => (
                  <ReferenceLine
                    key={limit.key}
                    y={limit.value}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="2 4"
                    ifOverflow={limit.extendAxis ? "extendDomain" : "hidden"}
                    label={{ value: limit.label, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }}
                  />
                ))}
              {previousSeries &&
                visible.map((pen) => (
                  <Line
                    key={pen.key + PREVIOUS_SUFFIX}
                    dataKey={pen.key + PREVIOUS_SUFFIX}
                    name={`${pen.label} (anterior)`}
                    stroke={pen.color}
                    strokeWidth={1.5}
                    strokeOpacity={0.7}
                    strokeDasharray="5 4"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                ))}
              {visible.map((pen) => (
                <Line
                  key={pen.key}
                  dataKey={pen.key}
                  name={pen.label}
                  stroke={pen.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  dot={false}
                  activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ))}
              {drag && drag.a !== drag.b && (
                <ReferenceArea
                  x1={Math.min(drag.a, drag.b)}
                  x2={Math.max(drag.a, drag.b)}
                  fill="var(--primary)"
                  fillOpacity={0.12}
                  stroke="var(--primary)"
                  strokeOpacity={0.4}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {rows.length > 0 && visible.length > 0 && (
        <p className="hidden text-xs text-muted-foreground md:block">
          Arraste sobre o gráfico para aproximar um trecho. Clique no nome de uma pena para ocultar ou mostrar; na
          bolinha, para trocar a cor.
        </p>
      )}

      {rows.length > 0 && visible.length > 0 && (
        <StatsTable
          rows={rows}
          pens={visible}
          compare={Boolean(previousSeries)}
          spanMs={spanMs}
          every={data?.every}
          breakerAmps={limits.some((l) => l.key === "breaker") ? breakerAmps : null}
        />
      )}
    </section>
  );
}

/** Mínimo, média, máximo e último de cada pena visível; com comparação, a média anterior e a variação. */
function StatsTable({
  rows,
  pens,
  compare,
  spanMs,
  every,
  breakerAmps,
}: {
  rows: HistoryRow[];
  pens: Pen[];
  compare: boolean;
  spanMs: number;
  every?: string;
  breakerAmps?: number | null;
}) {
  const stats = pens.map((pen) => ({
    pen,
    current: penStats(rows, pen.key),
    previous: compare ? penStats(rows, pen.key + PREVIOUS_SUFFIX) : null,
  }));
  const peak = Math.max(...stats.map((s) => s.current?.max ?? -Infinity));
  return (
    <div className="space-y-1.5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-120 text-xs">
          <caption className="sr-only">Resumo das penas no período exibido</caption>
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="py-1.5 pr-3 text-left font-medium">
                Pena
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">
                Mínimo
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">
                Média
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">
                Máximo
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">
                Último
              </th>
              {compare && (
                <>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">
                    Média anterior
                  </th>
                  <th scope="col" className="py-1.5 pl-3 text-right font-medium">
                    Variação
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {stats.map(({ pen, current, previous }) => {
              const change = current && previous ? relativeChange(current.avg, previous.avg) : null;
              return (
                <tr key={pen.key} className="border-b last:border-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                    <span className="flex items-center gap-1.5">
                      <PenSwatch color={pen.color} />
                      {pen.label}
                    </span>
                  </th>
                  <StatCell value={current && formatField(pen.key, current.min)} at={current?.minT} spanMs={spanMs} />
                  <StatCell value={current && formatField(pen.key, current.avg)} />
                  <StatCell value={current && formatField(pen.key, current.max)} at={current?.maxT} spanMs={spanMs} />
                  <StatCell value={current && formatField(pen.key, current.last)} at={current?.lastT} spanMs={spanMs} />
                  {compare && (
                    <>
                      <StatCell value={previous && formatField(pen.key, previous.avg)} />
                      <td className="tabular py-1.5 pl-3 text-right">
                        {change === null ? "—" : `${change > 0 ? "+" : ""}${formatNumber(change * 100, 1)} %`}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Calculado sobre as médias de {every ?? "5m"} do período exibido (picos mais curtos que isso não aparecem).
        {breakerAmps && Number.isFinite(peak) && (
          <>
            {" "}
            Maior corrente: {formatNumber(peak, 1)} A = {formatNumber((peak / breakerAmps) * 100, 0)} % do disjuntor de{" "}
            {formatNumber(breakerAmps, 0)} A.
          </>
        )}
      </p>
    </div>
  );
}

function StatCell({ value, at, spanMs }: { value: string | null | undefined; at?: number; spanMs?: number }) {
  return (
    <td className="px-3 py-1.5 text-right">
      <span className="tabular block font-medium">{value ?? "—"}</span>
      {value && at !== undefined && spanMs !== undefined && (
        <span className="block text-[11px] text-muted-foreground">{formatMoment(at, spanMs)}</span>
      )}
    </td>
  );
}

/** "Período…": de/até com data e hora. */
function CustomRangeButton({
  start,
  stop,
  onApply,
}: {
  start: number | null;
  stop: number | null;
  onApply: (view: View) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const f = new Date(from).getTime();
    const t = Math.min(new Date(to).getTime(), Date.now());
    if (!Number.isFinite(f) || !Number.isFinite(t)) return setMessage("Informe o início e o fim.");
    if (t - f < MIN_HISTORY_SPAN_MS) return setMessage("O período precisa ter pelo menos 30 minutos.");
    if (t - f > MAX_HISTORY_SPAN_MS) return setMessage("O período pode ter no máximo 1 ano.");
    onApply({ from: f, to: t });
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && start !== null && stop !== null) {
          setFrom(toLocalInput(start));
          setTo(toLocalInput(stop));
          setMessage(null);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <CalendarRangeIcon />
          Período…
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <form onSubmit={apply} className="grid gap-3">
          <p className="text-sm font-medium">Período personalizado</p>
          <div className="grid gap-1.5">
            <Label htmlFor="history-from">De</Label>
            <Input id="history-from" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="history-to">Até</Label>
            <Input id="history-to" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} required />
          </div>
          {message && (
            <p role="alert" className="text-xs text-destructive">
              {message}
            </p>
          )}
          <Button type="submit" size="sm" className="w-fit">
            Ver período
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function HistoryTooltip({
  active,
  payload,
  label,
  pens,
  compare,
  offset,
}: TooltipContentProps & { pens: Pen[]; compare: boolean; offset: number }) {
  if (!active || !payload?.length || typeof label !== "number") return null;
  const row = payload[0]?.payload as HistoryRow | undefined;
  if (!row) return null;
  const time = (t: number) => new Date(t).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const rows = pens.flatMap((pen) => {
    const items: { key: string; label: string; color: string; value: string; dashed?: boolean }[] = [];
    if (row[pen.key] !== undefined) {
      items.push({ key: pen.key, label: pen.label, color: pen.color, value: formatField(pen.key, row[pen.key]) });
    }
    const previous = row[pen.key + PREVIOUS_SUFFIX];
    if (compare && previous !== undefined) {
      items.push({
        key: pen.key + PREVIOUS_SUFFIX,
        label: `${pen.label} anterior`,
        color: pen.color,
        value: formatField(pen.key, previous),
        dashed: true,
      });
    }
    return items;
  });
  if (rows.length === 0) return null;
  return <TooltipBox title={time(label)} subtitle={compare ? `anterior: ${time(label - offset)}` : undefined} rows={rows} />;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Valor para <input type="datetime-local"> no fuso do navegador. */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Instante curto conforme o tamanho do período: "14:35" ou "14/10 14:35". */
function formatMoment(t: number, spanMs: number): string {
  const date = new Date(t);
  if (spanMs <= 20 * 3_600_000) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatTick(t: number, spanMs: number): string {
  const date = new Date(t);
  if (spanMs <= 36 * 3_600_000) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (spanMs <= 8 * 86_400_000) {
    return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
