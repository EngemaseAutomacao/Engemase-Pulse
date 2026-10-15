import { zonedParts } from "./tz";

/**
 * Tarifa de energia de uma unidade e o cálculo da fatura estimada.
 *
 * Modalidades (ANEEL):
 *  - Convencional: um preço por kWh (Grupo B, ou A convencional).
 *  - Branca (Grupo B): kWh mais caro na ponta e no intermediário (1 h antes e 1 h depois).
 *  - Verde (Grupo A): kWh de ponta e fora ponta + uma demanda contratada.
 *  - Azul (Grupo A): kWh de ponta e fora ponta + demanda contratada de ponta e de fora ponta.
 *
 * A ponta só vale em dias úteis (segunda a sexta, menos feriados nacionais).
 * É uma estimativa: o mês é o do calendário (a distribuidora usa o ciclo de
 * leitura) e itens como iluminação pública ou créditos não entram.
 */

export const TARIFF_MODALITIES = ["CONVENTIONAL", "WHITE", "GREEN", "BLUE"] as const;
export type TariffModality = (typeof TARIFF_MODALITIES)[number];

export const TARIFF_MODALITY_LABEL: Record<TariffModality, string> = {
  CONVENTIONAL: "Convencional (preço único)",
  WHITE: "Branca (Grupo B)",
  GREEN: "Verde (Grupo A)",
  BLUE: "Azul (Grupo A)",
};

export type Tariff = {
  modality: TariffModality;
  /** R$/kWh fora ponta (na convencional, o preço único). */
  energyOffPeak: number;
  /** R$/kWh na ponta (branca, verde e azul). */
  energyPeak: number | null;
  /** R$/kWh no intermediário (só branca). */
  energyIntermediate: number | null;
  /** Adicional da bandeira tarifária, R$/kWh (0 na verde). */
  flagAdder: number;
  /** R$/kW da demanda (verde; na azul, a de fora ponta). */
  demandPrice: number | null;
  /** R$/kW da demanda de ponta (azul). */
  demandPeakPrice: number | null;
  /** kW contratados (verde; na azul, fora ponta). */
  contractedDemand: number | null;
  /** kW contratados na ponta (azul). */
  contractedDemandPeak: number | null;
  /** Hora em que a ponta começa (0–23) e termina (exclusiva, 1–24). */
  peakStartHour: number;
  peakEndHour: number;
  /** ICMS + PIS/COFINS em %, calculados "por dentro"; 0 se os preços já têm impostos. */
  taxRate: number;
};

export type Period = "peak" | "intermediate" | "offPeak";

export const PERIOD_LABEL: Record<Period, string> = {
  peak: "Ponta",
  intermediate: "Intermediário",
  offPeak: "Fora ponta",
};

/** Tolerância da demanda: até 5 % acima da contratada não é ultrapassagem. */
export const DEMAND_TOLERANCE = 0.05;
/** A ultrapassagem é cobrada pelo dobro da tarifa de demanda. */
export const DEMAND_OVERRUN_FACTOR = 2;
/** Fator de potência de referência: abaixo disso há excedente de reativo (Grupo A). */
export const POWER_FACTOR_REF = 0.92;

export const hasDemand = (modality: TariffModality) => modality === "GREEN" || modality === "BLUE";

// ---------------------------------------------------------------------------
// Calendário: feriados nacionais e postos tarifários
// ---------------------------------------------------------------------------

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

const holidayCache = new Map<number, Set<string>>();

/**
 * Feriados nacionais em que não há ponta: os fixos e os móveis (terça de
 * Carnaval, Sexta-feira Santa e Corpus Christi). Chave "MM-DD".
 */
export function nationalHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const key = (date: Date) =>
    `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  const easter = easterSunday(year);
  const easterDate = Date.UTC(year, easter.month - 1, easter.day);
  const fromEaster = (days: number) => key(new Date(easterDate + days * 86_400_000));
  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
  const set = new Set([...fixed, fromEaster(-47), fromEaster(-2), fromEaster(60)]);
  holidayCache.set(year, set);
  return set;
}

/** Dia útil para a tarifa: segunda a sexta e não feriado nacional. */
export function isPeakDay(year: number, month: number, day: number): boolean {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !nationalHolidays(year).has(`${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}

/** Posto tarifário de um instante, no relógio local da unidade. */
export function periodAt(
  instant: Date | number,
  timeZone: string,
  tariff: Pick<Tariff, "modality" | "peakStartHour" | "peakEndHour">,
): Period {
  if (tariff.modality === "CONVENTIONAL") return "offPeak";
  const p = zonedParts(new Date(instant), timeZone);
  if (!isPeakDay(p.year, p.month, p.day)) return "offPeak";
  if (p.hour >= tariff.peakStartHour && p.hour < tariff.peakEndHour) return "peak";
  if (tariff.modality === "WHITE" && (p.hour === tariff.peakStartHour - 1 || p.hour === tariff.peakEndHour)) {
    return "intermediate";
  }
  return "offPeak";
}

/** R$/kWh no posto, com a bandeira. */
export function energyPrice(period: Period, tariff: Tariff): number {
  const base =
    tariff.modality === "CONVENTIONAL"
      ? tariff.energyOffPeak
      : period === "peak"
        ? (tariff.energyPeak ?? tariff.energyOffPeak)
        : period === "intermediate"
          ? (tariff.energyIntermediate ?? tariff.energyOffPeak)
          : tariff.energyOffPeak;
  return base + tariff.flagAdder;
}

/** Impostos "por dentro": o valor com impostos é o valor sem eles dividido por (1 − alíquota). */
export function withTaxes(value: number, taxRate: number): number {
  return taxRate > 0 && taxRate < 100 ? value / (1 - taxRate / 100) : value;
}

/** Custo de energia (sem impostos) de uma série horária. */
export function energyCost(hours: { hour: number; kwh: number }[], timeZone: string, tariff: Tariff): number {
  return hours.reduce((sum, h) => sum + h.kwh * energyPrice(periodAt(h.hour, timeZone, tariff), tariff), 0);
}

// ---------------------------------------------------------------------------
// Demanda e reativo
// ---------------------------------------------------------------------------

export type DemandCharge = {
  period: "single" | "peak" | "offPeak";
  /** Maior média de 15 min medida no mês (kW). */
  measured: number | null;
  contracted: number | null;
  /** kW faturados: a maior entre medida e contratada. */
  billed: number;
  price: number;
  cost: number;
  /** kW acima da contratada quando passou da tolerância de 5 %. */
  overrun: number;
  overrunCost: number;
};

function demandCharge(
  period: DemandCharge["period"],
  measured: number | null,
  contracted: number | null,
  price: number | null,
): DemandCharge {
  const unitPrice = price ?? 0;
  const billed = Math.max(measured ?? 0, contracted ?? 0);
  const overrun =
    measured !== null && contracted !== null && measured > contracted * (1 + DEMAND_TOLERANCE)
      ? measured - contracted
      : 0;
  return {
    period,
    measured,
    contracted,
    billed,
    price: unitPrice,
    cost: billed * unitPrice,
    overrun,
    overrunCost: overrun * unitPrice * DEMAND_OVERRUN_FACTOR,
  };
}

export type MaxDemand = { all: number | null; peak: number | null; offPeak: number | null };

/** Maior demanda (média de 15 min) no total e por posto. */
export function maxDemand(windows: { start: number; kw: number }[], timeZone: string, tariff: Tariff): MaxDemand {
  const result: MaxDemand = { all: null, peak: null, offPeak: null };
  for (const w of windows) {
    const key = periodAt(w.start, timeZone, tariff) === "peak" ? "peak" : "offPeak";
    result.all = Math.max(result.all ?? -Infinity, w.kw);
    result[key] = Math.max(result[key] ?? -Infinity, w.kw);
  }
  return result;
}

export function demandCharges(tariff: Tariff, demand: MaxDemand): DemandCharge[] {
  if (tariff.modality === "GREEN") {
    return [demandCharge("single", demand.all, tariff.contractedDemand, tariff.demandPrice)];
  }
  if (tariff.modality === "BLUE") {
    return [
      demandCharge("peak", demand.peak, tariff.contractedDemandPeak, tariff.demandPeakPrice),
      demandCharge("offPeak", demand.offPeak, tariff.contractedDemand, tariff.demandPrice),
    ];
  }
  return [];
}

/** Excedente de reativo de uma hora (kvarh equivalente) com FP abaixo de 0,92. */
export function reactiveExcess(kwh: number, powerFactor: number | null): number {
  if (powerFactor === null || powerFactor <= 0 || powerFactor >= POWER_FACTOR_REF) return 0;
  return kwh * (POWER_FACTOR_REF / powerFactor - 1);
}

// ---------------------------------------------------------------------------
// Fatura estimada
// ---------------------------------------------------------------------------

export type BillInput = {
  tariff: Tariff;
  timeZone: string;
  /** Consumo da entrada hora a hora (kWh) e o fator de potência médio da hora. */
  hours: { hour: number; kwh: number; powerFactor: number | null }[];
  /** Média de 15 min da potência ativa da entrada (kW). */
  demandWindows: { start: number; kw: number }[];
  /** Início e fim do mês (fim exclusivo) e o agora, para a projeção. */
  start: Date;
  stop: Date;
  now: Date;
};

export type BillLine = { period: Period; kwh: number; price: number; cost: number };

export type BillEstimate = {
  energy: BillLine[];
  demand: DemandCharge[];
  /** Só Grupo A (verde e azul). */
  reactive: { kvarh: number; hoursBelow: number; price: number; cost: number } | null;
  maxDemand: MaxDemand;
  /** Fator de potência médio ponderado pelo consumo. */
  averagePowerFactor: number | null;
  subtotal: number;
  taxes: number;
  total: number;
  /** Mês em andamento: o total estimado para o mês inteiro. */
  projection: { total: number; elapsed: number } | null;
};

export function estimateBill(input: BillInput): BillEstimate {
  const { tariff, timeZone } = input;
  const byPeriod = new Map<Period, number>();
  let weightedPf = 0;
  let pfWeight = 0;
  let reactiveKvarh = 0;
  let hoursBelow = 0;
  for (const h of input.hours) {
    const period = periodAt(h.hour, timeZone, tariff);
    byPeriod.set(period, (byPeriod.get(period) ?? 0) + h.kwh);
    if (h.powerFactor !== null && h.powerFactor > 0) {
      weightedPf += h.powerFactor * h.kwh;
      pfWeight += h.kwh;
      const excess = reactiveExcess(h.kwh, h.powerFactor);
      if (excess > 0) {
        reactiveKvarh += excess;
        hoursBelow += 1;
      }
    }
  }

  const periods: Period[] =
    tariff.modality === "CONVENTIONAL"
      ? ["offPeak"]
      : tariff.modality === "WHITE"
        ? ["peak", "intermediate", "offPeak"]
        : ["peak", "offPeak"];
  const energy = periods.map((period) => {
    const kwh = byPeriod.get(period) ?? 0;
    const price = energyPrice(period, tariff);
    return { period, kwh, price, cost: kwh * price };
  });

  const demand = maxDemand(input.demandWindows, timeZone, tariff);
  const demandLines = demandCharges(tariff, demand);
  // O excedente de reativo é valorado pela tarifa de energia fora ponta.
  const reactive = hasDemand(tariff.modality)
    ? { kvarh: reactiveKvarh, hoursBelow, price: tariff.energyOffPeak, cost: reactiveKvarh * tariff.energyOffPeak }
    : null;

  const energyTotal = energy.reduce((s, l) => s + l.cost, 0);
  const demandTotal = demandLines.reduce((s, l) => s + l.cost + l.overrunCost, 0);
  const subtotal = energyTotal + demandTotal + (reactive?.cost ?? 0);
  const total = withTaxes(subtotal, tariff.taxRate);

  let projection: BillEstimate["projection"] = null;
  const span = input.stop.getTime() - input.start.getTime();
  const elapsedTime = Math.min(1, Math.max(0, (input.now.getTime() - input.start.getTime()) / span));
  // Unidade que começou a enviar no meio do mês (ou ficou sem internet): projeta pelas
  // horas que têm leitura, senão a falta de dado viraria "consumo zero".
  const covered = (input.hours.length * 3_600_000) / span;
  const elapsed = Math.min(elapsedTime, covered);
  if (elapsedTime < 1 && elapsed > 0) {
    // Energia e reativo crescem com o tempo; a demanda é do mês (já está no valor faturado).
    const variable = (energyTotal + (reactive?.cost ?? 0)) / elapsed;
    projection = { total: withTaxes(variable + demandTotal, tariff.taxRate), elapsed };
  }

  return {
    energy,
    demand: demandLines,
    reactive,
    maxDemand: demand,
    averagePowerFactor: pfWeight > 0 ? weightedPf / pfWeight : null,
    subtotal,
    taxes: total - subtotal,
    total,
    projection,
  };
}
