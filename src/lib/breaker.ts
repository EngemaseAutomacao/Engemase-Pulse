/**
 * Carga do disjuntor de um medidor: a corrente da fase mais carregada sobre a
 * corrente nominal do disjuntor (vem do cadastro do gateway). É a fase mais
 * carregada que faz o disjuntor desarmar, não a média.
 */

/** A partir daqui a carga é "alta" (folga pequena para picos). */
export const BREAKER_HIGH_LOAD = 0.8;

export type BreakerLevel = "normal" | "high" | "over";

export type BreakerLoad = {
  /** Corrente nominal do disjuntor. */
  ratedAmps: number;
  /** Corrente da fase mais carregada (ou a média, se o medidor não manda por fase). */
  amps: number;
  /** Fase mais carregada; null quando só há a corrente média. */
  phase: "L1" | "L2" | "L3" | null;
  /** amps / ratedAmps (1 = 100 %). */
  ratio: number;
  level: BreakerLevel;
};

export const BREAKER_LEVEL_LABEL: Record<BreakerLevel, string> = {
  normal: "Normal",
  high: "Carga alta",
  over: "Acima do disjuntor",
};

export function breakerLoad(values: Record<string, number>, ratedAmps: number | null | undefined): BreakerLoad | null {
  if (!ratedAmps || ratedAmps <= 0) return null;
  const phases = (
    [
      ["L1", values.I1],
      ["L2", values.I2],
      ["L3", values.I3],
    ] as const
  ).filter((p): p is readonly ["L1" | "L2" | "L3", number] => Number.isFinite(p[1]));

  let amps: number;
  let phase: BreakerLoad["phase"] = null;
  if (phases.length > 0) {
    [phase, amps] = phases.reduce((max, p) => (p[1] > max[1] ? p : max));
  } else if (Number.isFinite(values.I_AVG)) {
    amps = values.I_AVG;
  } else {
    return null;
  }

  const ratio = amps / ratedAmps;
  const level: BreakerLevel = ratio > 1 ? "over" : ratio >= BREAKER_HIGH_LOAD ? "high" : "normal";
  return { ratedAmps, amps, phase, ratio, level };
}
