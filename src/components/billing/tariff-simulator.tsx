"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { BadgeCheckIcon, InfoIcon } from "lucide-react";
import { AXIS_TICK, ChartMessage, GRID_STROKE, TooltipBox } from "@/components/charts/chart-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, formatNumber } from "@/lib/format";
import { TARIFF_MODALITY_LABEL, hasDemand, type TariffModality } from "@/lib/tariff";
import {
  MIN_CONTRACTED_DEMAND,
  demandCost,
  optimalDemand,
  simulate,
  type Contract,
  type MonthUsage,
  type SimPrices,
  type SimulationData,
} from "@/lib/tariff-sim";
import { parseDecimal } from "@/lib/validation";
import { cn } from "@/lib/utils";

type Group = "A" | "B";

/** Campos de preço digitados como texto (vírgula decimal); null = vazio. */
type PriceText = Record<string, string>;

const num = (text: string | undefined, thousands = false) => {
  const value = parseDecimal(text ?? "", thousands);
  return value === null || Number.isNaN(value) ? null : value;
};
/** Número para o campo: sem zeros à direita depois da vírgula (160 continua 160; 0,45000 vira 0,45). */
const text = (value: number | null | undefined, digits = 5) => {
  if (value === null || value === undefined) return "";
  const formatted = formatNumber(value, digits);
  return formatted.includes(",") ? formatted.replace(/0+$/, "").replace(/,$/, "") : formatted;
};

function initialPrices(data: SimulationData): PriceText {
  const t = data.tariff;
  const p: PriceText = { flag: text(t?.flagAdder ?? 0), tax: text(t?.taxRate ?? 0, 2) };
  if (!t) return p;
  if (t.modality === "CONVENTIONAL") p["conventional.energy"] = text(t.energyOffPeak);
  if (t.modality === "WHITE") {
    p["white.peak"] = text(t.energyPeak);
    p["white.intermediate"] = text(t.energyIntermediate);
    p["white.offPeak"] = text(t.energyOffPeak);
  }
  if (t.modality === "GREEN") {
    p["green.energyPeak"] = text(t.energyPeak);
    p["green.energyOffPeak"] = text(t.energyOffPeak);
    p["green.demand"] = text(t.demandPrice, 2);
    p["contract.single"] = text(t.contractedDemand, 0);
  }
  if (t.modality === "BLUE") {
    p["blue.energyPeak"] = text(t.energyPeak);
    p["blue.energyOffPeak"] = text(t.energyOffPeak);
    p["blue.demandPeak"] = text(t.demandPeakPrice, 2);
    p["blue.demandOffPeak"] = text(t.demandPrice, 2);
    p["contract.peak"] = text(t.contractedDemandPeak, 0);
    p["contract.offPeak"] = text(t.contractedDemand, 0);
  }
  return p;
}

function toPrices(p: PriceText): SimPrices {
  return {
    conventional: { energy: num(p["conventional.energy"]) },
    white: { peak: num(p["white.peak"]), intermediate: num(p["white.intermediate"]), offPeak: num(p["white.offPeak"]) },
    green: { energyPeak: num(p["green.energyPeak"]), energyOffPeak: num(p["green.energyOffPeak"]), demand: num(p["green.demand"]) },
    blue: {
      energyPeak: num(p["blue.energyPeak"]),
      energyOffPeak: num(p["blue.energyOffPeak"]),
      demandPeak: num(p["blue.demandPeak"]),
      demandOffPeak: num(p["blue.demandOffPeak"]),
    },
    flagAdder: num(p.flag) ?? 0,
    taxRate: num(p.tax) ?? 0,
  };
}

type Option = {
  key: string;
  label: string;
  detail: string;
  modality: TariffModality;
  contract: Contract;
  current?: boolean;
};

/** Simulador: custo de cada modalidade e a demanda contratada ideal, com os meses medidos. */
export function TariffSimulator({ data }: { data: SimulationData }) {
  const [group, setGroup] = useState<Group>(data.tariff && !hasDemand(data.tariff.modality) ? "B" : "A");
  const [priceText, setPriceText] = useState<PriceText>(() => initialPrices(data));
  const set = (key: string, value: string) => setPriceText((p) => ({ ...p, [key]: value }));

  const measured = data.months.filter((m) => m.coverage > 0);
  const partial = measured.filter((m) => m.coverage < 0.9);
  const prices = toPrices(priceText);
  const currentContract: Contract = {
    single: num(priceText["contract.single"], true),
    peak: num(priceText["contract.peak"], true),
    offPeak: num(priceText["contract.offPeak"], true),
  };

  const greenIdeal = optimalDemand(measured.map((m) => m.demandAll), prices.green.demand ?? 0);
  const bluePeakIdeal = optimalDemand(measured.map((m) => m.demandPeak), prices.blue.demandPeak ?? 0);
  const blueOffIdeal = optimalDemand(measured.map((m) => m.demandOffPeak), prices.blue.demandOffPeak ?? 0);
  const currentModality = data.tariff?.modality ?? null;

  const options: Option[] =
    group === "B"
      ? [
          { key: "conv", label: "Convencional", detail: "Preço único", modality: "CONVENTIONAL", contract: currentContract },
          { key: "white", label: "Branca", detail: "Mais cara na ponta e no intermediário", modality: "WHITE", contract: currentContract },
        ]
      : [
          ...(currentContract.single !== null
            ? [{ key: "green-now", label: "Verde", detail: `Contrato atual: ${formatNumber(currentContract.single, 0)} kW`, modality: "GREEN" as const, contract: currentContract }]
            : []),
          ...(greenIdeal
            ? [{ key: "green-ideal", label: "Verde", detail: `Demanda ideal: ${formatNumber(greenIdeal.contracted, 0)} kW`, modality: "GREEN" as const, contract: { ...currentContract, single: greenIdeal.contracted } }]
            : []),
          ...(currentContract.peak !== null && currentContract.offPeak !== null
            ? [{ key: "blue-now", label: "Azul", detail: `Contrato atual: ${formatNumber(currentContract.peak, 0)} kW ponta · ${formatNumber(currentContract.offPeak, 0)} kW fora ponta`, modality: "BLUE" as const, contract: currentContract }]
            : []),
          ...(bluePeakIdeal && blueOffIdeal
            ? [{ key: "blue-ideal", label: "Azul", detail: `Demanda ideal: ${formatNumber(bluePeakIdeal.contracted, 0)} kW ponta · ${formatNumber(blueOffIdeal.contracted, 0)} kW fora ponta`, modality: "BLUE" as const, contract: { ...currentContract, peak: bluePeakIdeal.contracted, offPeak: blueOffIdeal.contracted } }]
            : []),
        ];
  for (const option of options) {
    option.current =
      option.modality === currentModality &&
      (group === "B" || option.key.endsWith("-now"));
  }
  const results = options.map((option) => ({ option, result: simulate(option.modality, measured, prices, option.contract) }));
  const priced = results.filter((r) => r.result.total !== null);
  const cheapest = priced.length > 1 ? priced.reduce((a, b) => (b.result.total! < a.result.total! ? b : a)) : null;
  const current = results.find((r) => r.option.current && r.result.total !== null) ?? null;

  if (measured.length === 0) {
    return (
      <div className="surface px-6 py-14 text-center text-sm text-muted-foreground">
        Ainda não há leituras de consumo desta unidade para simular.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="surface space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Preços da distribuidora</h2>
            <p className="text-xs text-muted-foreground">
              Preencha pela tabela da sua distribuidora (R$ sem impostos). Os da tarifa cadastrada já vêm preenchidos.
            </p>
          </div>
          <div role="radiogroup" aria-label="Grupo" className="flex rounded-lg border p-0.5">
            {(["A", "B"] as const).map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={group === g}
                onClick={() => setGroup(g)}
                className={cn(
                  "min-h-8 rounded-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground",
                  group === g && "bg-secondary text-foreground",
                )}
              >
                Grupo {g} {g === "A" ? "(verde × azul)" : "(convencional × branca)"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {group === "A" ? (
            <>
              <PriceGroup title="Verde">
                <PriceField id="green.energyPeak" label="Energia na ponta (R$/kWh)" value={priceText} onChange={set} />
                <PriceField id="green.energyOffPeak" label="Energia fora ponta (R$/kWh)" value={priceText} onChange={set} />
                <PriceField id="green.demand" label="Demanda (R$/kW)" value={priceText} onChange={set} />
                <PriceField id="contract.single" label="Contratada hoje (kW)" value={priceText} onChange={set} />
              </PriceGroup>
              <PriceGroup title="Azul">
                <PriceField id="blue.energyPeak" label="Energia na ponta (R$/kWh)" value={priceText} onChange={set} />
                <PriceField id="blue.energyOffPeak" label="Energia fora ponta (R$/kWh)" value={priceText} onChange={set} />
                <PriceField id="blue.demandPeak" label="Demanda na ponta (R$/kW)" value={priceText} onChange={set} />
                <PriceField id="blue.demandOffPeak" label="Demanda fora ponta (R$/kW)" value={priceText} onChange={set} />
                <PriceField id="contract.peak" label="Contratada na ponta hoje (kW)" value={priceText} onChange={set} />
                <PriceField id="contract.offPeak" label="Contratada fora ponta hoje (kW)" value={priceText} onChange={set} />
              </PriceGroup>
            </>
          ) : (
            <>
              <PriceGroup title="Convencional">
                <PriceField id="conventional.energy" label="Energia (R$/kWh)" value={priceText} onChange={set} />
              </PriceGroup>
              <PriceGroup title="Branca">
                <PriceField id="white.peak" label="Ponta (R$/kWh)" value={priceText} onChange={set} />
                <PriceField id="white.intermediate" label="Intermediário (R$/kWh)" value={priceText} onChange={set} />
                <PriceField id="white.offPeak" label="Fora ponta (R$/kWh)" value={priceText} onChange={set} />
              </PriceGroup>
            </>
          )}
          <PriceGroup title="Iguais em todas">
            <PriceField id="flag" label="Bandeira (R$/kWh)" value={priceText} onChange={set} />
            <PriceField id="tax" label="ICMS + PIS/COFINS (%)" value={priceText} onChange={set} />
          </PriceGroup>
        </div>
      </section>

      <section aria-labelledby="sim-result" className="overflow-hidden surface">
        <div className="px-4 pt-4">
          <h2 id="sim-result" className="font-semibold">
            Quanto custaria
          </h2>
          <p className="text-xs text-muted-foreground">
            {data.partialCurrent
              ? `Ainda não há mês fechado: a simulação usa ${monthLabel(measured[0].month)} até agora (valores parciais), com impostos.`
              : `${measured.length} ${measured.length === 1 ? "mês medido" : "meses medidos"} (${monthLabel(measured[0].month)} a ${monthLabel(measured[measured.length - 1].month)}), com impostos.`}
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Opção</TableHead>
              <TableHead className="text-right">No período</TableHead>
              <TableHead className="text-right">Por mês</TableHead>
              <TableHead className="pr-4 text-right">Diferença</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map(({ option, result }) => {
              const diff = current && result.total !== null ? result.total - current.result.total! : null;
              return (
                <TableRow key={option.key}>
                  <TableCell className="pl-4">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {option.label}
                      {option.current && <span className="text-xs font-normal text-muted-foreground">(atual)</span>}
                      {cheapest?.option.key === option.key && (
                        <span className="flex items-center gap-1 text-xs font-medium text-success">
                          <BadgeCheckIcon className="size-3.5" aria-hidden />
                          Mais barata
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">{option.detail}</span>
                    {result.missing.length > 0 && (
                      <span className="block text-xs text-warning">Falta: {result.missing.join(", ")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular">{formatMoney(result.total, true)}</TableCell>
                  <TableCell className="text-right tabular">
                    {result.total === null ? "—" : formatMoney(result.total / measured.length, true)}
                  </TableCell>
                  <TableCell className="pr-4 text-right tabular">
                    {diff === null || option.current
                      ? "—"
                      : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${formatMoney(Math.abs(diff), true)}`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="flex gap-2 px-4 py-3 text-xs text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Estimativa com os preços acima e o consumo medido pela entrada geral. A troca de modalidade ou de demanda
          contratada segue as regras da distribuidora (pedido por escrito, prazos e carência); demanda mínima de{" "}
          {MIN_CONTRACTED_DEMAND} kW no Grupo A.
          {partial.length > 0 && ` ${partial.length} mês(es) com leitura incompleta entram com o que foi medido.`}
        </p>
      </section>

      {group === "A" && !data.noMainMeter && (
        <div className="grid gap-4 lg:grid-cols-2">
          <DemandHistory
            title="Demanda máxima por mês"
            subtitle="Para a verde (demanda única)"
            months={data.months}
            pick={(m) => m.demandAll}
            current={currentContract.single}
            ideal={greenIdeal?.contracted ?? null}
            price={prices.green.demand}
          />
          <DemandHistory
            title="Demanda na ponta e fora ponta"
            subtitle="Para a azul: ponta (barras) · fora ponta no resumo"
            months={data.months}
            pick={(m) => m.demandPeak}
            current={currentContract.peak}
            ideal={bluePeakIdeal?.contracted ?? null}
            price={prices.blue.demandPeak}
            extra={
              blueOffIdeal
                ? `Fora ponta: ideal ${formatNumber(blueOffIdeal.contracted, 0)} kW${
                    currentContract.offPeak !== null ? ` (hoje ${formatNumber(currentContract.offPeak, 0)} kW)` : ""
                  }.`
                : undefined
            }
          />
        </div>
      )}

      <MonthlyUsage months={data.months} group={group} peakStartHour={data.peakStartHour} peakEndHour={data.peakEndHour} />
    </div>
  );
}

function PriceGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2 rounded-lg border p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">{title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function PriceField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: PriceText;
  onChange: (key: string, value: string) => void;
}) {
  const invalid = Number.isNaN(parseDecimal(value[id] ?? "", id.startsWith("contract.")));
  return (
    <div className="grid gap-1">
      <Label htmlFor={`sim-${id}`} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <Input
        id={`sim-${id}`}
        inputMode="decimal"
        value={value[id] ?? ""}
        onChange={(e) => onChange(id, e.target.value)}
        aria-invalid={invalid || undefined}
        className="h-8 tabular"
      />
    </div>
  );
}

type DemandRow = { month: string; kw: number | null };

function DemandHistory({
  title,
  subtitle,
  months,
  pick,
  current,
  ideal,
  price,
  extra,
}: {
  title: string;
  subtitle: string;
  months: MonthUsage[];
  pick: (m: MonthUsage) => number | null;
  current: number | null;
  ideal: number | null;
  price: number | null;
  extra?: string;
}) {
  const rows: DemandRow[] = months.map((m) => ({ month: m.month, kw: pick(m) }));
  const has = rows.some((r) => r.kw !== null);
  const values = rows.map((r) => r.kw);
  const saving =
    current !== null && ideal !== null && price ? demandCost(values, current, price) - demandCost(values, ideal, price) : null;
  return (
    <section className="surface space-y-3 p-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">
          {subtitle} · linha cheia: contratada hoje
          {current !== null ? ` (${formatNumber(current, 0)} kW)` : ""} · tracejada: ideal
          {ideal !== null ? ` (${formatNumber(ideal, 0)} kW)` : ""}
        </p>
      </div>
      <div className="h-52">
        {!has ? (
          <ChartMessage>Sem medição de demanda no período.</ChartMessage>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="month" tickFormatter={(m: string) => monthLabel(m, true)} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatNumber(v, 0)} />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                content={(props: TooltipContentProps) => {
                  const row = props.payload?.[0]?.payload as DemandRow | undefined;
                  if (!props.active || !row) return null;
                  return (
                    <TooltipBox
                      title={monthLabel(row.month)}
                      rows={[{ key: "kw", label: "Maior demanda", value: row.kw === null ? "—" : `${formatNumber(row.kw, 1)} kW` }]}
                    />
                  );
                }}
              />
              <Bar dataKey="kw" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              {current !== null && <ReferenceLine y={current} stroke="var(--foreground)" strokeWidth={1.5} ifOverflow="extendDomain" />}
              {ideal !== null && (
                <ReferenceLine y={ideal} stroke="var(--foreground)" strokeDasharray="5 4" strokeWidth={1.5} ifOverflow="extendDomain" />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {(saving !== null || extra) && (
        <p className="text-sm">
          {saving !== null &&
            (Math.abs(saving) < 1
              ? "O contrato atual já está no ponto ideal para os meses medidos. "
              : `Contratando ${formatNumber(ideal!, 0)} kW, a demanda custaria ${formatMoney(Math.abs(saving), true)} ${
                  saving > 0 ? "a menos" : "a mais"
                } no período (sem impostos). `)}
          {extra && <span className="text-muted-foreground">{extra}</span>}
        </p>
      )}
    </section>
  );
}

function MonthlyUsage({
  months,
  group,
  peakStartHour,
  peakEndHour,
}: {
  months: MonthUsage[];
  group: Group;
  peakStartHour: number;
  peakEndHour: number;
}) {
  const hh = (h: number) => `${String(h).padStart(2, "0")}h`;
  return (
    <details className="surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Consumo e demanda mês a mês</summary>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Mês</TableHead>
              <TableHead className="text-right">Ponta ({hh(peakStartHour)}–{hh(peakEndHour)})</TableHead>
              {group === "B" && <TableHead className="text-right">Intermediário</TableHead>}
              <TableHead className="text-right">Fora ponta</TableHead>
              {group === "A" && <TableHead className="text-right">Demanda máx.</TableHead>}
              {group === "A" && <TableHead className="text-right">Reativo exc.</TableHead>}
              <TableHead className="pr-4 text-right">Leitura</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {months.map((m) => (
              <TableRow key={m.month}>
                <TableCell className="pl-4">{monthLabel(m.month)}</TableCell>
                <TableCell className="text-right tabular">{formatNumber(m.kwhPeak, 0)} kWh</TableCell>
                {group === "B" && <TableCell className="text-right tabular">{formatNumber(m.kwhIntermediate, 0)} kWh</TableCell>}
                <TableCell className="text-right tabular">
                  {formatNumber(group === "B" ? m.kwhOffPeak : m.kwhOffPeak + m.kwhIntermediate, 0)} kWh
                </TableCell>
                {group === "A" && (
                  <TableCell className="text-right tabular">{m.demandAll === null ? "—" : `${formatNumber(m.demandAll, 0)} kW`}</TableCell>
                )}
                {group === "A" && <TableCell className="text-right tabular">{formatNumber(m.reactiveKvarh, 0)} kvarh</TableCell>}
                <TableCell className={cn("pr-4 text-right tabular", m.coverage < 0.9 && "text-warning")}>
                  {formatNumber(m.coverage * 100, 0)} %
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="px-4 pb-3 text-xs text-muted-foreground">
        {TARIFF_MODALITY_LABEL.WHITE}: o intermediário é a hora antes e a hora depois da ponta, em dias úteis.
      </p>
    </details>
  );
}

function monthLabel(month: string, short = false): string {
  const [y, m] = month.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", {
    month: short ? "short" : "long",
    year: short ? "2-digit" : "numeric",
    timeZone: "UTC",
  });
  return short ? label.replace(". de ", "/").replace(" de ", "/") : label;
}
