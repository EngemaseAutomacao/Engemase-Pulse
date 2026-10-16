"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import {
  ActivityIcon,
  CalculatorIcon,
  FileTextIcon,
  GaugeIcon,
  ReceiptTextIcon,
  SunsetIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { AXIS_TICK, ChartMessage, GRID_STROKE, TooltipBox } from "@/components/charts/chart-parts";
import { MonthNav, localMonth } from "@/components/consumption/month-consumption";
import { DemandNow } from "@/components/demand/demand-now";
import { CapacitorCard } from "./capacitor-card";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/forms/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJson } from "@/lib/fetcher";
import { formatMoney, formatNumber } from "@/lib/format";
import {
  DEMAND_TOLERANCE,
  PERIOD_LABEL,
  POWER_FACTOR_REF,
  TARIFF_MODALITY_LABEL,
  hasDemand,
  type DemandCharge,
} from "@/lib/tariff";
import type { BillingResponse } from "@/lib/telemetry-types";
import { cn } from "@/lib/utils";

type SiteOption = { id: string; name: string; timezone: string };

const DEMAND_LABEL: Record<DemandCharge["period"], string> = {
  single: "Demanda",
  peak: "Demanda na ponta",
  offPeak: "Demanda fora ponta",
};

/** Fatura estimada do mês por unidade. */
export function BillingView({ tenantSlug, sites }: { tenantSlug: string; sites: SiteOption[] }) {
  const [siteId, setSiteId] = useState(sites[0].id);
  const site = sites.find((s) => s.id === siteId) ?? sites[0];
  const current = localMonth(new Date(), site.timezone);
  const [chosen, setChosen] = useState<string | null>(null);
  const month = chosen && chosen <= current ? chosen : current;
  const { data, error, isLoading } = useSWR<BillingResponse | { tariff: null }>(
    `/api/tenants/${tenantSlug}/billing?site=${site.id}&month=${month}`,
    fetchJson,
    { refreshInterval: month === current ? 300_000 : 0, keepPreviousData: true },
  );
  const failure = error?.message ?? (data && "error" in data ? data.error : null);

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
        <MonthNav month={month} current={current} onChange={(m) => setChosen(m >= current ? null : m)} />
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/${tenantSlug}/fatura/simulador?unidade=${site.id}`}>
              <CalculatorIcon />
              Simular tarifa e demanda
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/relatorio/${tenantSlug}?unidade=${site.id}&mes=${month}`} target="_blank" rel="noopener">
              <FileTextIcon />
              Relatório do mês
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/relatorio/${tenantSlug}/demanda?unidade=${site.id}&mes=${month}`} target="_blank" rel="noopener">
              <FileTextIcon />
              Relatório de demanda e FP
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
      ) : data && data.tariff === null ? (
        <div className="flex flex-col items-center gap-2 surface px-6 py-14 text-center">
          <ReceiptTextIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">Tarifa desta unidade ainda não cadastrada</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Com a modalidade, os preços e a demanda contratada da fatura da distribuidora, o sistema estima a fatura do
            mês. Peça à Engemase para cadastrar.
          </p>
        </div>
      ) : data ? (
        <div className={cn("space-y-6 transition-opacity", isLoading && "opacity-60")}>
          {month === current && <DemandNow tenantSlug={tenantSlug} siteId={site.id} />}
          <Bill data={data as BillingResponse} inProgress={month === current} />
          <CapacitorCard tenantSlug={tenantSlug} siteId={site.id} />
        </div>
      ) : null}
    </div>
  );
}

function Bill({ data, inProgress }: { data: BillingResponse; inProgress: boolean }) {
  const { bill, tariff } = data;
  const groupA = hasDemand(tariff.modality);
  const overrun = bill.demand.filter((d) => d.overrun > 0);
  const overrunCost = overrun.reduce((s, d) => s + d.overrunCost, 0);
  const peakLine = bill.energy.find((l) => l.period === "peak");
  const energyKwh = bill.energy.reduce((s, l) => s + l.kwh, 0);
  const mainDemand = bill.demand.find((d) => d.period !== "peak") ?? null;
  const slack = !inProgress
    ? bill.demand.filter((d) => d.measured !== null && d.contracted && d.measured < d.contracted * 0.8)
    : [];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label={inProgress && bill.projection ? "Projeção do mês" : "Fatura estimada"}
          value={formatMoney(inProgress && bill.projection ? bill.projection.total : bill.total, true)}
          icon={<ReceiptTextIcon />}
          detail={
            inProgress && bill.projection
              ? `Até agora: ${formatMoney(bill.total, true)} · ${TARIFF_MODALITY_LABEL[tariff.modality]}`
              : TARIFF_MODALITY_LABEL[tariff.modality]
          }
        />
        {groupA ? (
          <StatTile
            label="Demanda máxima"
            value={mainDemand?.measured === null || !mainDemand ? "—" : formatNumber(mainDemand.measured, 0)}
            unit="kW"
            icon={<GaugeIcon />}
            detail={
              overrun.length > 0 ? (
                <span className="flex items-center gap-1 text-warning">
                  <TriangleAlertIcon className="size-3.5" aria-hidden />
                  Ultrapassagem:{" "}
                  {formatNumber(
                    overrun.reduce((s, d) => s + d.overrun, 0),
                    1,
                  )}{" "}
                  kW
                </span>
              ) : (
                `Contratada: ${formatNumber(mainDemand?.contracted ?? 0, 0)} kW`
              )
            }
          />
        ) : (
          <StatTile
            label="Consumo"
            value={formatNumber(energyKwh, 0)}
            unit="kWh"
            icon={<ActivityIcon />}
            detail="Energia do mês"
          />
        )}
        <StatTile
          label="Na ponta"
          value={peakLine ? formatNumber(peakLine.kwh, 0) : "—"}
          unit={peakLine ? "kWh" : undefined}
          icon={<SunsetIcon />}
          detail={
            peakLine
              ? `${formatMoney(peakLine.cost, true)} · ${String(tariff.peakStartHour).padStart(2, "0")}h–${String(tariff.peakEndHour).padStart(2, "0")}h em dias úteis`
              : "Tarifa convencional: preço único"
          }
        />
        <StatTile
          label="Fator de potência"
          value={bill.averagePowerFactor === null ? "—" : formatNumber(bill.averagePowerFactor, 3)}
          icon={<ActivityIcon />}
          detail={
            bill.reactive
              ? bill.reactive.hoursBelow > 0
                ? `${bill.reactive.hoursBelow} h abaixo de ${formatNumber(POWER_FACTOR_REF, 2)}`
                : `Sem horas abaixo de ${formatNumber(POWER_FACTOR_REF, 2)}`
              : "Grupo B: sem cobrança de reativo"
          }
        />
      </div>

      {overrun.length > 0 && (
        <div role="alert" className="space-y-1 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-warning">
            <TriangleAlertIcon className="size-4" aria-hidden />A demanda passou da contratada
          </p>
          <p className="text-foreground/80">
            Multa estimada de {formatMoney(overrunCost)} (o que passa da contratada é cobrado em dobro quando excede{" "}
            {formatNumber(DEMAND_TOLERANCE * 100, 0)} %). Vale deslocar cargas do horário de maior demanda ou rever o
            contrato com a distribuidora.
          </p>
        </div>
      )}
      {slack.length > 0 && (
        <div className="rounded-xl border p-4 text-sm text-muted-foreground">
          A maior demanda do mês ficou abaixo de 80 % da contratada
          {slack
            .map(
              (d) =>
                ` (${DEMAND_LABEL[d.period].toLowerCase()}: ${formatNumber((d.measured! / d.contracted!) * 100, 0)} %)`,
            )
            .join("")}
          . Se isso se repetir, dá para avaliar uma redução do contrato.
        </div>
      )}
      {data.noMainMeter && (
        <p className="text-sm text-muted-foreground">
          Sem entrada geral marcada no gateway: a energia é a soma dos medidores e a demanda não é calculada.
        </p>
      )}

      <section aria-labelledby="bill-title" className="overflow-hidden surface">
        <h2 id="bill-title" className="px-4 pt-4 font-semibold">
          Composição {inProgress ? "até agora" : "do mês"}
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Item</TableHead>
              <TableHead className="text-right">Quantidade</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead className="pr-4 text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bill.energy.map((line) => (
              <TableRow key={line.period}>
                <TableCell className="pl-4">
                  Energia{tariff.modality === "CONVENTIONAL" ? "" : ` — ${PERIOD_LABEL[line.period].toLowerCase()}`}
                </TableCell>
                <TableCell className="text-right tabular">{formatNumber(line.kwh, 0)} kWh</TableCell>
                <TableCell className="text-right text-muted-foreground tabular">
                  {formatMoney(line.price)}/kWh
                </TableCell>
                <TableCell className="pr-4 text-right tabular">{formatMoney(line.cost)}</TableCell>
              </TableRow>
            ))}
            {bill.demand.map((d) => (
              <DemandRows key={d.period} charge={d} />
            ))}
            {bill.reactive && (
              <TableRow>
                <TableCell className="pl-4">Excedente de reativo (estimado)</TableCell>
                <TableCell className="text-right tabular">{formatNumber(bill.reactive.kvarh, 0)} kvarh</TableCell>
                <TableCell className="text-right text-muted-foreground tabular">
                  {formatMoney(bill.reactive.price)}/kvarh
                </TableCell>
                <TableCell className="pr-4 text-right tabular">{formatMoney(bill.reactive.cost)}</TableCell>
              </TableRow>
            )}
            {bill.taxes > 0 && (
              <TableRow>
                <TableCell className="pl-4">Impostos (ICMS, PIS/COFINS)</TableCell>
                <TableCell className="text-right tabular">{formatNumber(tariff.taxRate, 1)} %</TableCell>
                <TableCell />
                <TableCell className="pr-4 text-right tabular">{formatMoney(bill.taxes)}</TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="pl-4 font-medium" colSpan={3}>
                Total estimado {inProgress ? "até agora" : ""}
              </TableCell>
              <TableCell className="pr-4 text-right font-semibold tabular">{formatMoney(bill.total)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        <p className="px-4 py-3 text-xs text-muted-foreground">
          Estimativa pelas medições e pela tarifa cadastrada, no mês do calendário. A fatura da distribuidora usa o
          ciclo de leitura e pode ter outros itens (iluminação pública, créditos, juros).
          {inProgress &&
            bill.projection &&
            " A projeção estende o consumo medido até o fim do mês; a demanda já entra pelo valor faturado."}
        </p>
      </section>

      {groupA && !data.noMainMeter && <DemandCharts data={data} />}
    </>
  );
}

function DemandRows({ charge }: { charge: DemandCharge }) {
  return (
    <>
      <TableRow>
        <TableCell className="pl-4">
          {DEMAND_LABEL[charge.period]}
          <span className="block text-xs text-muted-foreground">
            medida {charge.measured === null ? "—" : `${formatNumber(charge.measured, 1)} kW`} · contratada{" "}
            {formatNumber(charge.contracted ?? 0, 0)} kW
          </span>
        </TableCell>
        <TableCell className="text-right tabular">{formatNumber(charge.billed, 1)} kW</TableCell>
        <TableCell className="text-right text-muted-foreground tabular">{formatMoney(charge.price)}/kW</TableCell>
        <TableCell className="pr-4 text-right tabular">{formatMoney(charge.cost)}</TableCell>
      </TableRow>
      {charge.overrun > 0 && (
        <TableRow>
          <TableCell className="pl-4">
            <span className="flex items-center gap-1.5">
              <TriangleAlertIcon className="size-3.5 text-warning" aria-hidden />
              Ultrapassagem de demanda
              {charge.period === "peak" ? " (ponta)" : charge.period === "offPeak" ? " (fora ponta)" : ""}
            </span>
          </TableCell>
          <TableCell className="text-right tabular">{formatNumber(charge.overrun, 1)} kW</TableCell>
          <TableCell className="text-right text-muted-foreground tabular">{formatMoney(charge.price * 2)}/kW</TableCell>
          <TableCell className="pr-4 text-right tabular">{formatMoney(charge.overrunCost)}</TableCell>
        </TableRow>
      )}
    </>
  );
}

type DemandRow = { t: number; kw: number | null };

/** Maior demanda de cada dia contra a contratada (um gráfico por posto na azul). */
function DemandCharts({ data }: { data: BillingResponse }) {
  const blue = data.tariff.modality === "BLUE";
  const charts = blue
    ? [
        {
          key: "peak",
          title: "Demanda na ponta",
          contracted: data.tariff.contractedDemandPeak,
          pick: (d: BillingResponse["dailyDemand"][number]) => d.peak,
        },
        {
          key: "offPeak",
          title: "Demanda fora ponta",
          contracted: data.tariff.contractedDemand,
          pick: (d: BillingResponse["dailyDemand"][number]) => d.offPeak,
        },
      ]
    : [
        {
          key: "all",
          title: "Demanda máxima por dia",
          contracted: data.tariff.contractedDemand,
          pick: (d: BillingResponse["dailyDemand"][number]) =>
            d.peak === null && d.offPeak === null ? null : Math.max(d.peak ?? 0, d.offPeak ?? 0),
        },
      ];

  return (
    <div className={cn("grid gap-4", blue && "lg:grid-cols-2")}>
      {charts.map((chart) => {
        const rows: DemandRow[] = data.dailyDemand.map((d) => ({ t: d.day, kw: chart.pick(d) }));
        const has = rows.some((r) => r.kw !== null);
        const max = Math.max(0, ...rows.map((r) => r.kw ?? 0), (chart.contracted ?? 0) * (1 + DEMAND_TOLERANCE));
        return (
          <section key={chart.key} className="space-y-3 surface p-4">
            <div>
              <h2 className="font-semibold">{chart.title}</h2>
              <p className="text-xs text-muted-foreground">
                Maior média de 15 min de cada dia (kW) · linha cheia: contratada (
                {formatNumber(chart.contracted ?? 0, 0)} kW) · tracejada: tolerância de{" "}
                {formatNumber(DEMAND_TOLERANCE * 100, 0)} %
              </p>
            </div>
            <div className="h-56">
              {!has ? (
                <ChartMessage>Sem medições de demanda neste mês.</ChartMessage>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                    <XAxis
                      dataKey="t"
                      tickFormatter={(t: number) =>
                        new Date(t).toLocaleDateString("pt-BR", { timeZone: data.timeZone, day: "numeric" })
                      }
                      tick={AXIS_TICK}
                      tickLine={false}
                      axisLine={{ stroke: GRID_STROKE }}
                      minTickGap={8}
                    />
                    <YAxis
                      domain={[0, niceCeil(max * 1.05)]}
                      tick={AXIS_TICK}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tickFormatter={(v: number) => formatNumber(v, 0)}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)" }}
                      content={(props: TooltipContentProps) => {
                        const row = props.payload?.[0]?.payload as DemandRow | undefined;
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
                                key: "kw",
                                label: "Demanda máxima",
                                value: row.kw === null ? "sem leitura" : `${formatNumber(row.kw, 1)} kW`,
                              },
                              { key: "c", label: "Contratada", value: `${formatNumber(chart.contracted ?? 0, 0)} kW` },
                            ]}
                          />
                        );
                      }}
                    />
                    <Bar
                      dataKey="kw"
                      fill="var(--primary)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={20}
                      isAnimationActive={false}
                    />
                    {chart.contracted ? (
                      <>
                        <ReferenceLine
                          y={chart.contracted}
                          stroke="var(--foreground)"
                          strokeWidth={1.5}
                          ifOverflow="extendDomain"
                        />
                        <ReferenceLine
                          y={chart.contracted * (1 + DEMAND_TOLERANCE)}
                          stroke="var(--muted-foreground)"
                          strokeDasharray="4 4"
                          ifOverflow="extendDomain"
                        />
                      </>
                    ) : null}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Topo do eixo num número redondo (1, 2, 2,5 ou 5 × 10ⁿ). */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
}
