"use client";

import { useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { FileTextIcon, InfoIcon } from "lucide-react";
import { AXIS_TICK, ChartMessage, GRID_STROKE } from "@/components/charts/chart-parts";
import { MonthNav, localMonth } from "@/components/consumption/month-consumption";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJson } from "@/lib/fetcher";
import { formatMoney, formatNumber } from "@/lib/format";
import { RANK_METRICS, metricValue, rankStores, type RankMetric, type RankingResponse } from "@/lib/ranking";
import { cn } from "@/lib/utils";

/** Unidades lado a lado num mês, ordenadas pelo indicador escolhido. */
export function StoreRanking({ tenantSlug, timeZone }: { tenantSlug: string; timeZone: string }) {
  const current = localMonth(new Date(), timeZone);
  const [chosen, setChosen] = useState<string | null>(null);
  const month = chosen && chosen <= current ? chosen : current;
  const [metric, setMetric] = useState<RankMetric | null>(null);
  const { data, error, isLoading } = useSWR<RankingResponse>(
    `/api/tenants/${tenantSlug}/ranking?month=${month}`,
    fetchJson,
    { keepPreviousData: true, refreshInterval: month === current ? 600_000 : 0 },
  );
  const stores = data?.stores ?? [];
  const anyArea = stores.some((s) => s.areaM2);
  const active: RankMetric = metric ?? (anyArea ? "kwhPerM2" : "kwh");
  const def = RANK_METRICS.find((m) => m.id === active)!;
  const ranked = rankStores(stores, active);
  const rows = ranked
    .map((s) => ({ name: s.siteName, value: metricValue(s, active) }))
    .filter((r): r is { name: string; value: number } => r.value !== null);
  const available = RANK_METRICS.filter((m) => stores.some((s) => metricValue(s, m.id) !== null));
  const format = (v: number) =>
    def.id === "cost" || def.id === "costPerM2" ? formatMoney(v, def.id === "cost") : formatNumber(v, def.digits);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <MonthNav month={month} current={current} onChange={(m) => setChosen(m >= current ? null : m)} />
        {data?.partial && <span className="text-xs text-muted-foreground">Mês em andamento: valores até agora.</span>}
        <Button asChild variant="outline" size="sm" className="sm:ml-auto">
          <a href={`/relatorio/${tenantSlug}/unidades?mes=${month}`} target="_blank" rel="noopener">
            <FileTextIcon />
            Relatório comparativo
          </a>
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}

      <section className={cn("space-y-4 surface p-4", isLoading && "opacity-60")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{def.label}</h2>
            <p className="text-xs text-muted-foreground">
              {def.lowerIsBetter ? "Menor é melhor" : "Maior é melhor"} · a melhor unidade primeiro
            </p>
          </div>
          <div role="radiogroup" aria-label="Indicador" className="flex flex-wrap gap-1 rounded-lg border p-0.5">
            {available.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active === m.id}
                onClick={() => setMetric(m.id)}
                className={cn(
                  "min-h-8 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground",
                  active === m.id && "bg-secondary text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: Math.max(160, rows.length * 40 + 40) }}>
          {rows.length === 0 ? (
            <ChartMessage>{isLoading ? "Carregando…" : "Sem dados para este indicador no mês."}</ChartMessage>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 80, bottom: 4, left: 8 }}>
                <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                <XAxis
                  type="number"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => formatNumber(v, def.digits > 1 ? 1 : 0)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ ...AXIS_TICK, fill: "var(--foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={140}
                />
                <Bar
                  dataKey="value"
                  fill="var(--chart-1)"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={22}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="value"
                    position="right"
                    formatter={(v: unknown) =>
                      `${format(Number(v))}${def.unit && !def.unit.startsWith("R$") ? ` ${def.unit}` : ""}`
                    }
                    style={{ fill: "var(--foreground)", fontSize: 12 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        {!anyArea && (
          <p className="flex gap-1.5 text-xs text-muted-foreground">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Para comparar em kWh/m², a Engemase cadastra a área de cada unidade (Administração → Unidades).
          </p>
        )}
      </section>

      <section className="overflow-x-auto surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Unidade</TableHead>
              <TableHead className="text-right">Consumo</TableHead>
              <TableHead className="text-right">kWh/m²</TableHead>
              <TableHead className="text-right">Custo</TableHead>
              <TableHead className="text-right">x mês anterior</TableHead>
              <TableHead className="text-right">FP</TableHead>
              <TableHead className="pr-4 text-right">Demanda máx.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((s) => {
              const change = metricValue(s, "change");
              const perM2 = metricValue(s, "kwhPerM2");
              const ratio = metricValue(s, "demandRatio");
              return (
                <TableRow key={s.siteId}>
                  <TableCell className="pl-4 font-medium">
                    {s.siteName}
                    {s.areaM2 && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {formatNumber(s.areaM2, 0)} m²
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular">{formatNumber(s.kwh, 0)} kWh</TableCell>
                  <TableCell className="text-right tabular">{perM2 === null ? "—" : formatNumber(perM2, 1)}</TableCell>
                  <TableCell className="text-right tabular">
                    {s.cost === null ? "—" : formatMoney(s.cost, true)}
                    {data?.partial && s.costProjected !== null && (
                      <span className="block text-xs text-muted-foreground">
                        projeção {formatMoney(s.costProjected, true)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {change === null ? "—" : `${change > 0 ? "+" : ""}${formatNumber(change, 1)} %`}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {s.powerFactor === null ? "—" : formatNumber(s.powerFactor, 3)}
                  </TableCell>
                  <TableCell className="pr-4 text-right tabular">
                    {s.maxDemand === null ? "—" : `${formatNumber(s.maxDemand, 0)} kW`}
                    {ratio !== null && (
                      <span className={cn("block text-xs", ratio > 100 ? "text-destructive" : "text-muted-foreground")}>
                        {formatNumber(ratio, 0)} % da contratada
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
