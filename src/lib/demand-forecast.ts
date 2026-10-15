import { DEMAND_TOLERANCE } from "./tariff";

/**
 * Projeção da demanda da janela de 15 min em andamento (a distribuidora mede
 * a média da potência em janelas fixas de 15 min: :00, :15, :30, :45).
 *
 * Blocos de 5 min já fechados entram pela média deles; o resto da janela é
 * estimado pela potência de agora. Assim dá para avisar no meio da janela,
 * a tempo de desligar alguma carga antes de a média fechar acima da contratada.
 */

export const DEMAND_WINDOW_MS = 15 * 60_000;
const BLOCK_MS = 5 * 60_000;

export type DemandStatus = "ok" | "near" | "over" | "unknown";

export type DemandProjection = {
  windowStart: number;
  windowEnd: number;
  /** Minutos já passados da janela. */
  elapsedMin: number;
  /** Média dos blocos de 5 min fechados (kW). */
  averageSoFar: number | null;
  currentKw: number | null;
  projected: number | null;
};

export function demandWindowStart(now: number): number {
  return Math.floor(now / DEMAND_WINDOW_MS) * DEMAND_WINDOW_MS;
}

export function projectDemand(input: {
  now: number;
  /** Resumos de 5 min da entrada (início do bloco, kW médio). */
  blocks: { ts: number; kw: number }[];
  /** Potência ativa total de agora; null se a leitura não é recente. */
  currentKw: number | null;
}): DemandProjection {
  const windowStart = demandWindowStart(input.now);
  const windowEnd = windowStart + DEMAND_WINDOW_MS;
  const closed = input.blocks.filter((b) => b.ts >= windowStart && b.ts + BLOCK_MS <= Math.min(input.now, windowEnd));
  const coveredMs = closed.length * BLOCK_MS;
  const averageSoFar = closed.length > 0 ? closed.reduce((s, b) => s + b.kw, 0) / closed.length : null;
  // Sem leitura de agora, o último bloco fechado representa o resto.
  const rest = input.currentKw ?? (closed.length > 0 ? closed[closed.length - 1].kw : null);
  const projected =
    rest === null && averageSoFar === null
      ? null
      : ((averageSoFar ?? 0) * coveredMs + (rest ?? averageSoFar ?? 0) * (DEMAND_WINDOW_MS - coveredMs)) / DEMAND_WINDOW_MS;
  return {
    windowStart,
    windowEnd,
    elapsedMin: (input.now - windowStart) / 60_000,
    averageSoFar,
    currentKw: input.currentKw,
    projected,
  };
}

/** over: passa da tolerância (multa) · near: passa de 95 % da contratada. */
export function demandStatus(projected: number | null, contracted: number | null): DemandStatus {
  if (projected === null || !contracted) return "unknown";
  if (projected > contracted * (1 + DEMAND_TOLERANCE)) return "over";
  if (projected > contracted * 0.95) return "near";
  return "ok";
}

/** Demanda agora de uma unidade (resposta de /api/tenants/<slug>/demand). */
export type SiteDemandNow = DemandProjection & {
  siteId: string;
  siteName: string;
  timeZone: string;
  /** Na azul, ponta ou fora ponta; na verde, demanda única. */
  period: "peak" | "offPeak" | "single";
  contracted: number | null;
  status: DemandStatus;
};
