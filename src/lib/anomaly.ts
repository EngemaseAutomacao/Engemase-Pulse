/**
 * Consumo fora do padrão: cada hora é comparada com a mesma hora do mesmo dia
 * da semana nas 4 semanas anteriores (a loja tem rotina semanal: abre,
 * fecha, liga a iluminação, faz degelo nos mesmos horários).
 *
 * A faixa normal usa a mediana e o desvio mediano (MAD), que não se deixam
 * levar por uma semana atípica. Um piso em kWh evita alarme por variação
 * pequena em circuito de consumo baixo.
 */

export type Baseline = {
  median: number;
  /** Abaixo disso é "abaixo do normal"; null quando o normal já é quase zero. */
  low: number | null;
  high: number;
  samples: number;
};

export type HourState = "high" | "low" | "normal";

/** Mínimo de semanas com leitura para ter um "normal". */
export const MIN_BASELINE_WEEKS = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * @param history consumo (kWh) da mesma hora nas semanas anteriores
 * @param typical consumo médio por hora do medidor (escala do circuito)
 */
export function baselineOf(history: number[], typical: number): Baseline | null {
  if (history.length < MIN_BASELINE_WEEKS) return null;
  const m = median(history);
  const mad = median(history.map((v) => Math.abs(v - m)));
  const spread = Math.max(1.4826 * mad, 0.15 * m);
  const floor = Math.max(0.5, 0.1 * typical);
  const high = Math.max(m * 1.5, m + 3 * spread, m + floor);
  const low = m >= 2 * floor ? Math.min(m * 0.4, m - 3 * spread) : null;
  return { median: m, low: low !== null && low > 0 ? low : null, high, samples: history.length };
}

export function classifyHour(value: number, baseline: Baseline): HourState {
  if (value > baseline.high) return "high";
  if (baseline.low !== null && value < baseline.low) return "low";
  return "normal";
}

/**
 * Decisão com as duas últimas horas fechadas: alarma só quando as duas saem
 * do normal para o mesmo lado (uma hora estranha sozinha não basta); volta ao
 * normal quando a última hora fica normal. null = sem dados para decidir.
 */
export function anomalyState(last: HourState | null, previous: HourState | null): HourState | null {
  if (last === null) return null;
  if (last === "normal") return "normal";
  return previous === last ? last : null;
}
