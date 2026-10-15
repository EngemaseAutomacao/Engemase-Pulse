"use client";

import useSWR from "swr";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { AXIS_TICK, ChartMessage, GRID_STROKE, TooltipBox } from "@/components/charts/chart-parts";
import { fetchJson } from "@/lib/fetcher";
import { formatNumber } from "@/lib/format";
import type { UtilityHistoryResponse } from "@/lib/utility-types";
import { cn } from "@/lib/utils";

export const TREND_RANGES = [
  { id: "24h", label: "24 h" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
] as const;
export type TrendRange = (typeof TREND_RANGES)[number]["id"];

/** Escolha do período dos gráficos de tendência (um só para a tela). */
export function TrendRangePicker({ value, onChange }: { value: TrendRange; onChange: (r: TrendRange) => void }) {
  return (
    <div role="radiogroup" aria-label="Período" className="inline-flex rounded-lg border p-0.5">
      {TREND_RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          role="radio"
          aria-checked={value === r.id}
          onClick={() => onChange(r.id)}
          className={cn(
            "min-h-8 rounded-md px-3 text-xs font-medium transition-colors",
            value === r.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Tendência de uma grandeza de um reservatório ou gerador (média de cada
 * ponto). Uma grandeza por gráfico: duas unidades diferentes nunca dividem eixo.
 */
export function UtilityTrend({
  tenantSlug,
  equipmentId,
  tag,
  label,
  unit,
  decimals = 1,
  range,
  timeZone,
  domain,
  references = [],
  color = "var(--chart-1)",
  height = 180,
}: {
  tenantSlug: string;
  equipmentId: string;
  tag: string;
  label: string;
  unit?: string | null;
  decimals?: number;
  range: TrendRange;
  timeZone: string;
  domain?: [number | "auto", number | "auto"];
  /** Linhas de referência (limites), desenhadas tracejadas. */
  references?: { value: number; label: string }[];
  color?: string;
  height?: number;
}) {
  const { data, error, isLoading } = useSWR<UtilityHistoryResponse>(
    `/api/tenants/${tenantSlug}/utilities/${equipmentId}/history?range=${range}&tags=${tag}`,
    fetchJson,
    { keepPreviousData: true, refreshInterval: range === "24h" ? 300_000 : 0 },
  );
  const points = (data?.series[tag] ?? []).map(([t, v]) => ({ t, v }));
  // Casas do eixo pela amplitude: bateria entre 24,6 e 25,8 V precisa de uma; nível de 0 a 100 %, nenhuma.
  const values = points.map((p) => p.v);
  const spread = values.length ? Math.max(...values) - Math.min(...values) : 0;
  const tickDigits = decimals === 0 || spread >= 10 ? 0 : Math.min(decimals, spread >= 2 ? 0 : 1);
  const fmtTick = (t: number) =>
    new Date(t).toLocaleString("pt-BR", {
      timeZone,
      ...(range === "24h" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" }),
    });
  const valueText = (v: number) => `${formatNumber(v, decimals)}${unit ? ` ${unit}` : ""}`;

  return (
    <figure className="min-w-0 space-y-2">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </figcaption>
      <div style={{ height }} className={cn(isLoading && "opacity-60")}>
        {error ? (
          <ChartMessage tone="error">{error.message}</ChartMessage>
        ) : points.length === 0 ? (
          <ChartMessage>{isLoading ? "Carregando…" : "Sem histórico neste período."}</ChartMessage>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tick={AXIS_TICK}
                tickFormatter={fmtTick}
                minTickGap={40}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                width={44}
                domain={domain ?? ["auto", "auto"]}
                tick={AXIS_TICK}
                tickFormatter={(v: number) => formatNumber(v, tickDigits)}
                axisLine={false}
                tickLine={false}
              />
              {references.map((r) => (
                <ReferenceLine
                  key={r.label}
                  y={r.value}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  label={{ value: r.label, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }}
                />
              ))}
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                content={(props: TooltipContentProps) => {
                  const p = props.payload?.[0]?.payload as { t: number; v: number } | undefined;
                  if (!props.active || !p) return null;
                  return (
                    <TooltipBox
                      title={new Date(p.t).toLocaleString("pt-BR", {
                        timeZone,
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      subtitle={range === "24h" ? "média de 5 min" : range === "7d" ? "média de 15 min" : "média de 1 h"}
                      rows={[{ key: tag, label, value: valueText(p.v), color }]}
                    />
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={2}
                fill={color}
                fillOpacity={0.12}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </figure>
  );
}
