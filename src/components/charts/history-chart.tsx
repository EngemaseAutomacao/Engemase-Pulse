"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchJson } from "@/lib/fetcher";
import { formatField, formatNumber } from "@/lib/format";
import { CHART_PRESETS, SERIES_LABEL, type ChartPresetId } from "@/lib/meter-fields";
import type { HistoryResponse } from "@/lib/telemetry-types";
import { HISTORY_RANGES, type HistoryRangeId } from "@/lib/time-range";
import { cn } from "@/lib/utils";
import { AXIS_TICK, ChartMessage, GRID_STROKE, SERIES_COLORS, SeriesLegend, TooltipBox } from "./chart-parts";

type Row = { t: number } & Record<string, number>;

/** Histórico de um medidor: escolha do conjunto de grandezas e do período. */
export function HistoryChart({
  tenantSlug,
  meterId,
  canExport,
}: {
  tenantSlug: string;
  meterId: string;
  canExport: boolean;
}) {
  const [presetId, setPresetId] = useState<ChartPresetId>("power");
  const [rangeId, setRangeId] = useState<HistoryRangeId>("24h");
  const preset = CHART_PRESETS.find((p) => p.id === presetId) ?? CHART_PRESETS[0];

  const query = new URLSearchParams({ fields: preset.fields.join(","), range: rangeId }).toString();
  const base = `/api/tenants/${tenantSlug}/meters/${meterId}`;
  const { data, error, isLoading } = useSWR<HistoryResponse>(`${base}/history?${query}`, fetchJson, {
    refreshInterval: rangeId === "1h" || rangeId === "6h" ? 60_000 : 300_000,
    keepPreviousData: true,
  });

  const series = useMemo(
    () =>
      preset.fields.map((key, i) => ({
        key,
        label: ("labels" in preset ? (preset.labels as Record<string, string>)[key] : undefined) ?? SERIES_LABEL[key] ?? key,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      })),
    [preset],
  );
  const rows = useMemo(() => toRows(data?.series ?? {}), [data]);
  const spanMs = data ? Date.parse(data.stop) - Date.parse(data.start) : 86_400_000;
  const failure = error?.message ?? data?.error;

  return (
    <section aria-labelledby="history-title" className="surface space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="history-title" className="font-semibold">
            Histórico
          </h2>
          <p className="text-xs text-muted-foreground">
            {preset.label}
            {preset.unit ? ` (${preset.unit})` : ""} · média a cada {data?.every ?? "…"}
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
            {HISTORY_RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={rangeId === r.id}
                onClick={() => setRangeId(r.id)}
                className={cn(
                  "min-h-8 flex-1 rounded-md px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:flex-none",
                  rangeId === r.id && "bg-secondary text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {canExport && (
            <Button asChild variant="outline" size="sm">
              <a href={`${base}/export?${query}`} download>
                <DownloadIcon />
                CSV
              </a>
            </Button>
          )}
        </div>
      </div>

      <SeriesLegend items={series} />

      <div className="h-64 sm:h-80" aria-busy={isLoading}>
        {failure ? (
          <ChartMessage tone="error">{failure}</ChartMessage>
        ) : isLoading && rows.length === 0 ? (
          <ChartMessage>Carregando…</ChartMessage>
        ) : rows.length === 0 ? (
          <ChartMessage>Sem leituras neste período.</ChartMessage>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t: number) => formatTick(t, spanMs)}
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
                  <HistoryTooltip {...props} series={series} />
                )}
              />
              {series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
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
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function HistoryTooltip({
  active,
  payload,
  label,
  series,
}: TooltipContentProps & { series: { key: string; label: string; color: string }[] }) {
  if (!active || !payload?.length || typeof label !== "number") return null;
  const row = payload[0]?.payload as Row | undefined;
  if (!row) return null;
  return (
    <TooltipBox
      title={new Date(label).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
      rows={series
        .filter((s) => row[s.key] !== undefined)
        .map((s) => ({ key: s.key, label: s.label, color: s.color, value: formatField(s.key, row[s.key]) }))}
    />
  );
}

/** Junta as séries (uma por campo) em linhas por instante para o Recharts. */
function toRows(series: Record<string, [number, number][]>): Row[] {
  const byTime = new Map<number, Row>();
  for (const [field, points] of Object.entries(series)) {
    for (const [t, v] of points) {
      let row = byTime.get(t);
      if (!row) byTime.set(t, (row = { t } as Row));
      row[field] = v;
    }
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

function formatTick(t: number, spanMs: number): string {
  const date = new Date(t);
  if (spanMs <= 36 * 3_600_000) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (spanMs <= 8 * 86_400_000) {
    return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Casas decimais do eixo pela grandeza: 160 · 12,5 · 0,95. */
function formatAxisValue(value: number): string {
  const magnitude = Math.abs(value);
  return formatNumber(value, magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2);
}
