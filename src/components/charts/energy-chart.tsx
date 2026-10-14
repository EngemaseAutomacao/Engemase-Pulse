"use client";

import { useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { TableIcon, BarChart3Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJson } from "@/lib/fetcher";
import { formatNumber } from "@/lib/format";
import type { EnergyResponse } from "@/lib/telemetry-types";
import { ENERGY_PERIODS, type EnergyInterval, type EnergyPeriodId } from "@/lib/time-range";
import { cn } from "@/lib/utils";
import { AXIS_TICK, ChartMessage, GRID_STROKE, TooltipBox } from "./chart-parts";

/** Consumo (kWh) por hora, dia ou mês, calculado pelo contador de energia do medidor. */
export function EnergyChart({ tenantSlug, meterId }: { tenantSlug: string; meterId: string }) {
  const [periodId, setPeriodId] = useState<EnergyPeriodId>("today");
  const [showTable, setShowTable] = useState(false);
  const { data, error, isLoading } = useSWR<EnergyResponse>(
    `/api/tenants/${tenantSlug}/meters/${meterId}/energy?period=${periodId}`,
    fetchJson,
    { refreshInterval: 300_000, keepPreviousData: true },
  );

  const interval = data?.interval ?? "1h";
  const timeZone = data?.timeZone ?? "America/Sao_Paulo";
  const buckets = data?.buckets ?? [];
  const failure = error?.message ?? data?.error;
  const hasData = buckets.some((b) => b.kwh !== null);

  return (
    <section aria-labelledby="energy-title" className="surface space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="energy-title" className="font-semibold">
            Consumo de energia
          </h2>
          <p className="text-xs text-muted-foreground">
            Total no período:{" "}
            <span className="tabular font-medium text-foreground">
              {data ? `${formatNumber(data.totalKwh, 1)} kWh` : "…"}
            </span>
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div role="radiogroup" aria-label="Período" className="flex flex-1 rounded-lg border p-0.5 sm:flex-none">
            {ENERGY_PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={periodId === p.id}
                onClick={() => setPeriodId(p.id)}
                className={cn(
                  "min-h-8 flex-1 rounded-md px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:flex-none",
                  periodId === p.id && "bg-secondary text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowTable((v) => !v)}
            aria-label={showTable ? "Ver gráfico" : "Ver tabela"}
            title={showTable ? "Ver gráfico" : "Ver tabela"}
          >
            {showTable ? <BarChart3Icon /> : <TableIcon />}
          </Button>
        </div>
      </div>

      <div className={cn(!showTable && "h-64 sm:h-72")} aria-busy={isLoading}>
        {failure ? (
          <ChartMessage tone="error">{failure}</ChartMessage>
        ) : isLoading && !data ? (
          <ChartMessage>Carregando…</ChartMessage>
        ) : !hasData ? (
          <ChartMessage>Sem consumo registrado neste período.</ChartMessage>
        ) : showTable ? (
          <div className="max-h-72 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Consumo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buckets.map((b) => (
                  <TableRow key={b.start}>
                    <TableCell>{formatBucket(b.start, interval, timeZone, "long")}</TableCell>
                    <TableCell className="tabular text-right">
                      {b.kwh === null ? "—" : `${formatNumber(b.kwh, 1)} kWh`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="start"
                tickFormatter={(t: number) => formatBucket(t, interval, timeZone, "short")}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: GRID_STROKE }}
                minTickGap={16}
              />
              <YAxis
                tickFormatter={(v: number) => formatNumber(v, 0)}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                content={(props: TooltipContentProps) => (
                  <EnergyTooltip {...props} interval={interval} timeZone={timeZone} />
                )}
              />
              <Bar dataKey="kwh" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function EnergyTooltip({
  active,
  payload,
  interval,
  timeZone,
}: TooltipContentProps & { interval: EnergyInterval; timeZone: string }) {
  const bucket = payload?.[0]?.payload as { start: number; kwh: number | null } | undefined;
  if (!active || !bucket) return null;
  return (
    <TooltipBox
      title={formatBucket(bucket.start, interval, timeZone, "long")}
      rows={[
        {
          key: "kwh",
          label: "Consumo",
          color: "var(--primary)",
          value: bucket.kwh === null ? "sem dados" : `${formatNumber(bucket.kwh, 1)} kWh`,
        },
      ]}
    />
  );
}

export function formatBucket(start: number, interval: EnergyInterval, timeZone: string, style: "short" | "long"): string {
  const date = new Date(start);
  if (interval === "1h") {
    const hour = date.toLocaleTimeString("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" });
    if (style === "short") return hour;
    const end = new Date(start + 3_600_000).toLocaleTimeString("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" });
    return `${date.toLocaleDateString("pt-BR", { timeZone })} ${hour}–${end}`;
  }
  if (interval === "1d") {
    return date.toLocaleDateString("pt-BR", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      ...(style === "long" ? { weekday: "short", year: "numeric" } : {}),
    });
  }
  return date.toLocaleDateString("pt-BR", { timeZone, month: style === "short" ? "short" : "long", year: "numeric" });
}
