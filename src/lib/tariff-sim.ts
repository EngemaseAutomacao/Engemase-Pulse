import { DEMAND_OVERRUN_FACTOR, DEMAND_TOLERANCE, withTaxes, type Tariff, type TariffModality } from "./tariff";

/**
 * Simulador de tarifa: com o consumo e a demanda medidos mês a mês, quanto a
 * unidade pagaria em cada modalidade e qual demanda contratada sai mais barata.
 *
 * Grupo A (média tensão) escolhe entre verde e azul; Grupo B (baixa tensão)
 * entre convencional e branca. É uma estimativa: usa os preços informados,
 * sem itens como iluminação pública, e as regras de troca de contrato da
 * distribuidora (prazos, carência) continuam valendo.
 */

/** Uso de um mês do calendário, já separado pelos postos tarifários. */
export type MonthUsage = {
  /** AAAA-MM */
  month: string;
  kwhPeak: number;
  /** Uma hora antes e uma depois da ponta, em dias úteis (só a branca cobra diferente). */
  kwhIntermediate: number;
  kwhOffPeak: number;
  /** Maior média de 15 min no mês: geral, na ponta e fora dela (kW). */
  demandAll: number | null;
  demandPeak: number | null;
  demandOffPeak: number | null;
  /** Excedente de reativo (kvarh) com FP abaixo de 0,92 — cobrado só no Grupo A. */
  reactiveKvarh: number;
  /** Fração das horas do mês com leitura (0–1). */
  coverage: number;
};

/** Dados de uma unidade para o simulador (últimos 12 meses fechados). */
export type SimulationData = {
  siteId: string;
  siteName: string;
  timeZone: string;
  tariff: Tariff | null;
  peakStartHour: number;
  peakEndHour: number;
  months: MonthUsage[];
  noMainMeter: boolean;
  /** Ainda sem mês fechado: os meses são só o atual, até agora (valores parciais). */
  partialCurrent: boolean;
};

export type SimPrices = {
  conventional: { energy: number | null };
  white: { peak: number | null; intermediate: number | null; offPeak: number | null };
  green: { energyPeak: number | null; energyOffPeak: number | null; demand: number | null };
  blue: {
    energyPeak: number | null;
    energyOffPeak: number | null;
    demandPeak: number | null;
    demandOffPeak: number | null;
  };
  /** Adicional da bandeira (R$/kWh), igual em todas. */
  flagAdder: number;
  /** ICMS + PIS/COFINS (%), por dentro. */
  taxRate: number;
};

export type Contract = { single: number | null; peak: number | null; offPeak: number | null };

export type SimResult = {
  modality: TariffModality;
  /** null: faltam preços para esta modalidade. */
  total: number | null;
  energy: number;
  demand: number;
  overrun: number;
  reactive: number;
  missing: string[];
};

/** Menor demanda contratável no Grupo A (kW). */
export const MIN_CONTRACTED_DEMAND = 30;

/** Custo de demanda do mês: faturada (maior entre medida e contratada) mais a ultrapassagem em dobro. */
export function demandMonthCost(measured: number | null, contracted: number, price: number) {
  const billed = Math.max(measured ?? 0, contracted);
  const overrun = measured !== null && measured > contracted * (1 + DEMAND_TOLERANCE) ? measured - contracted : 0;
  return { demand: billed * price, overrun: overrun * price * DEMAND_OVERRUN_FACTOR };
}

/** Custo total da demanda nos meses informados (só os que têm medição). */
export function demandCost(values: (number | null)[], contracted: number, price: number): number {
  return values.reduce<number>((sum, measured) => {
    if (measured === null) return sum;
    const c = demandMonthCost(measured, contracted, price);
    return sum + c.demand + c.overrun;
  }, 0);
}

/**
 * Demanda contratada que minimiza o custo nos meses medidos, de kW em kW,
 * a partir do mínimo do Grupo A. null sem medição.
 */
export function optimalDemand(values: (number | null)[], price: number): { contracted: number; cost: number } | null {
  const measured = values.filter((v): v is number => v !== null);
  if (measured.length === 0 || !(price > 0)) return null;
  const top = Math.max(MIN_CONTRACTED_DEMAND, Math.ceil(Math.max(...measured) * 1.1));
  let best = { contracted: MIN_CONTRACTED_DEMAND, cost: Infinity };
  for (let c = MIN_CONTRACTED_DEMAND; c <= top; c++) {
    const cost = demandCost(values, c, price);
    if (cost < best.cost - 1e-9) best = { contracted: c, cost };
  }
  return best;
}

const sum = (months: MonthUsage[], pick: (m: MonthUsage) => number) => months.reduce((s, m) => s + pick(m), 0);

/** Quanto custariam os meses informados numa modalidade, com o contrato dado (Grupo A). */
export function simulate(modality: TariffModality, months: MonthUsage[], prices: SimPrices, contract: Contract): SimResult {
  const missing: string[] = [];
  const need = (value: number | null, label: string) => {
    if (value === null || !Number.isFinite(value)) missing.push(label);
    return value ?? 0;
  };
  const flag = prices.flagAdder;
  let energy = 0;
  let demand = 0;
  let overrun = 0;
  let reactive = 0;

  if (modality === "CONVENTIONAL") {
    const price = need(prices.conventional.energy, "energia");
    energy = sum(months, (m) => m.kwhPeak + m.kwhIntermediate + m.kwhOffPeak) * (price + flag);
  } else if (modality === "WHITE") {
    const peak = need(prices.white.peak, "energia na ponta");
    const mid = need(prices.white.intermediate, "energia no intermediário");
    const off = need(prices.white.offPeak, "energia fora ponta");
    energy =
      sum(months, (m) => m.kwhPeak) * (peak + flag) +
      sum(months, (m) => m.kwhIntermediate) * (mid + flag) +
      sum(months, (m) => m.kwhOffPeak) * (off + flag);
  } else {
    const tariff = modality === "GREEN" ? prices.green : prices.blue;
    const peak = need(tariff.energyPeak, "energia na ponta");
    const off = need(tariff.energyOffPeak, "energia fora ponta");
    energy =
      sum(months, (m) => m.kwhPeak) * (peak + flag) + sum(months, (m) => m.kwhIntermediate + m.kwhOffPeak) * (off + flag);
    reactive = sum(months, (m) => m.reactiveKvarh) * off;
    const charges: { values: (number | null)[]; contracted: number | null; price: number }[] =
      modality === "GREEN"
        ? [{ values: months.map((m) => m.demandAll), contracted: contract.single, price: need(prices.green.demand, "demanda") }]
        : [
            {
              values: months.map((m) => m.demandPeak),
              contracted: contract.peak,
              price: need(prices.blue.demandPeak, "demanda na ponta"),
            },
            {
              values: months.map((m) => m.demandOffPeak),
              contracted: contract.offPeak,
              price: need(prices.blue.demandOffPeak, "demanda fora ponta"),
            },
          ];
    for (const charge of charges) {
      if (charge.contracted === null) {
        missing.push("demanda contratada");
        continue;
      }
      for (const measured of charge.values) {
        if (measured === null) continue;
        const c = demandMonthCost(measured, charge.contracted, charge.price);
        demand += c.demand;
        overrun += c.overrun;
      }
    }
  }

  const subtotal = energy + demand + overrun + reactive;
  return {
    modality,
    total: missing.length > 0 ? null : withTaxes(subtotal, prices.taxRate),
    energy,
    demand,
    overrun,
    reactive,
    missing: [...new Set(missing)],
  };
}
