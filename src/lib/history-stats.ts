import { formatField, formatNumber } from "./format";
import { FIELD_BY_KEY } from "./meter-fields";

/** Sufixo das colunas do período anterior nas linhas do gráfico (ex.: "kW1__anterior"). */
export const PREVIOUS_SUFFIX = "__anterior";

export type HistoryRow = { t: number } & Record<string, number>;
type Points = Record<string, [number, number][]>;

/**
 * Período anterior de mesmo tamanho. O deslocamento é um múltiplo da janela
 * de agregação: como as janelas são alinhadas ao relógio, os pontos dos dois
 * períodos caem nos mesmos instantes e as linhas não se intercalam.
 */
export function previousWindow(start: number, stop: number, everyMs: number) {
  const shift = Math.ceil((stop - start) / everyMs) * everyMs;
  return { from: start - shift, to: stop - shift, shift };
}

/**
 * Junta as séries (uma por campo) em linhas por instante para o Recharts.
 * O período anterior entra deslocado para cima do atual e encaixado na grade
 * de `everyMs`, com as colunas terminadas em PREVIOUS_SUFFIX.
 */
export function mergeHistoryRows(
  series: Points,
  previous?: { series: Points; offset: number; everyMs: number } | null,
): HistoryRow[] {
  const byTime = new Map<number, HistoryRow>();
  const put = (t: number, key: string, value: number) => {
    let row = byTime.get(t);
    if (!row) byTime.set(t, (row = { t } as HistoryRow));
    row[key] = value;
  };
  for (const [field, points] of Object.entries(series)) {
    for (const [t, v] of points) put(t, field, v);
  }
  if (previous) {
    const { offset, everyMs } = previous;
    for (const [field, points] of Object.entries(previous.series)) {
      for (const [t, v] of points) put(Math.round((t + offset) / everyMs) * everyMs, field + PREVIOUS_SUFFIX, v);
    }
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

export type PenStats = {
  min: number;
  minT: number;
  max: number;
  maxT: number;
  avg: number;
  last: number;
  lastT: number;
  count: number;
};

/** Mínimo, média, máximo e último valor de uma coluna (sobre as médias de cada janela). */
export function penStats(rows: readonly HistoryRow[], key: string): PenStats | null {
  let stats: PenStats | null = null;
  let sum = 0;
  for (const row of rows) {
    const value = row[key];
    if (value === undefined || !Number.isFinite(value)) continue;
    sum += value;
    if (!stats) {
      stats = { min: value, minT: row.t, max: value, maxT: row.t, avg: value, last: value, lastT: row.t, count: 1 };
      continue;
    }
    stats.count++;
    if (value < stats.min) [stats.min, stats.minT] = [value, row.t];
    if (value > stats.max) [stats.max, stats.maxT] = [value, row.t];
    [stats.last, stats.lastT] = [value, row.t];
  }
  if (stats) stats.avg = sum / stats.count;
  return stats;
}

/** Menor e maior valor das colunas informadas; null sem dados. */
export function valueExtent(rows: readonly HistoryRow[], keys: readonly string[]): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key];
      if (value === undefined || !Number.isFinite(value)) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  return min <= max ? [min, max] : null;
}

/**
 * Casas decimais do eixo Y pela faixa exibida (o eixo tem ~5 marcas):
 * 0–60 kW → 0 · 0,81–0,99 → 2 · 59,95–60,05 Hz → 2. Iguais em todas as marcas.
 */
export function axisDecimals(extent: [number, number] | null): number {
  if (!extent) return 1;
  const step = (extent[1] - extent[0]) / 4;
  if (!(step > 0)) return Math.abs(extent[0]) >= 100 ? 0 : 2;
  return Math.min(4, Math.max(0, -Math.floor(Math.log10(step))));
}

/** Variação relativa (0,1 = +10 %); null quando a base é zero ou falta. */
export function relativeChange(current: number, base: number | null | undefined): number | null {
  if (base === null || base === undefined || base === 0 || !Number.isFinite(base)) return null;
  return (current - base) / Math.abs(base);
}

export type HistoryLimit = {
  key: string;
  value: number;
  label: string;
  /** Estica o eixo para a linha aparecer mesmo longe dos dados. */
  extendAxis: boolean;
};

/**
 * Linhas de referência de um conjunto de grandezas: a faixa normal de cada
 * campo (ex.: fator de potência mínimo 0,92) e, nas correntes, a corrente
 * nominal do disjuntor (essa só aparece quando os dados chegam perto, para
 * não achatar o gráfico).
 */
export function historyLimits(fields: readonly string[], breakerAmps?: number | null): HistoryLimit[] {
  const limits = new Map<string, HistoryLimit>();
  for (const key of fields) {
    const field = FIELD_BY_KEY.get(key);
    const { min, max } = field?.normal ?? {};
    if (min !== undefined) {
      limits.set(`min:${min}`, { key: `min:${min}`, value: min, label: `mín. ${formatField(key, min)}`, extendAxis: true });
    }
    if (max !== undefined) {
      limits.set(`max:${max}`, { key: `max:${max}`, value: max, label: `máx. ${formatField(key, max)}`, extendAxis: true });
    }
  }
  const isCurrent = fields.some((f) => /^I(\d|_AVG)$/.test(f));
  if (isCurrent && breakerAmps && breakerAmps > 0) {
    limits.set("breaker", {
      key: "breaker",
      value: breakerAmps,
      label: `disjuntor ${formatNumber(breakerAmps, 0)} A`,
      extendAxis: false,
    });
  }
  return [...limits.values()];
}
