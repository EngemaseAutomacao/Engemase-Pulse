import { POWER_FACTOR_REF } from "./tariff";

/**
 * Correção do fator de potência: quantos kVAr de capacitor a entrada precisa
 * para ficar em 0,92 e quanto excedente de reativo isso tiraria da fatura.
 *
 * Cada amostra é a média de 5 min da potência ativa (kW) e reativa (kVAr,
 * positiva = indutiva). O banco recomendado cobre 95 % do tempo e é
 * arredondado para um tamanho comercial; supõe banco automático (entra em
 * estágios só quando precisa), então não sobrecompensa nas horas leves.
 */

export const CAPACITOR_SIZES = [2.5, 5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500];

export type PowerSample = { kw: number; kvar: number };

/** kVAr indutivos acima do que 0,92 permite (0 se já está bom ou capacitivo). */
export function requiredKvar(sample: PowerSample, target = POWER_FACTOR_REF): number {
  if (sample.kw <= 0 || sample.kvar <= 0) return 0;
  return Math.max(0, sample.kvar - sample.kw * Math.tan(Math.acos(target)));
}

export function powerFactorOf(sample: PowerSample): number | null {
  const s = Math.hypot(sample.kw, sample.kvar);
  return s > 0 ? Math.abs(sample.kw) / s : null;
}

/** Excedente de reativo (kvarh) de uma amostra de `hours` horas com FP abaixo de 0,92. */
export function excessKvarh(sample: PowerSample, hours: number): number {
  const pf = powerFactorOf(sample);
  if (pf === null || pf >= POWER_FACTOR_REF || sample.kw <= 0) return 0;
  return sample.kw * hours * (POWER_FACTOR_REF / pf - 1);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

export type CapacitorAnalysis = {
  samples: number;
  /** FP médio ponderado pela energia. */
  averagePf: number | null;
  /** Fração do tempo (com carga) abaixo de 0,92. */
  shareBelow: number;
  /** kVAr necessários em 95 % do tempo e no pior momento. */
  p95: number;
  max: number;
  /** Tamanho comercial ≥ p95; null se não precisa. */
  recommended: number | null;
  /** Excedente de reativo no período, hoje e com o banco recomendado (kvarh). */
  excessNow: number;
  excessAfter: number;
  /** Fração do tempo capacitivo (kVAr negativo) com FP abaixo de 0,92 — atenção a capacitores fixos. */
  capacitiveShare: number;
};

export function analyzeCapacitors(samples: PowerSample[], sampleHours = 5 / 60): CapacitorAnalysis {
  const loaded = samples.filter((s) => s.kw > 0);
  const required = loaded.map((s) => requiredKvar(s)).sort((a, b) => a - b);
  const p95 = percentile(required, 0.95);
  const recommended = p95 < 1 ? null : (CAPACITOR_SIZES.find((size) => size >= p95) ?? Math.ceil(p95 / 50) * 50);
  let energy = 0;
  let weighted = 0;
  let below = 0;
  let capacitive = 0;
  let excessNow = 0;
  let excessAfter = 0;
  for (const s of loaded) {
    const pf = powerFactorOf(s);
    if (pf === null) continue;
    energy += s.kw;
    weighted += pf * s.kw;
    if (pf < POWER_FACTOR_REF) {
      below += 1;
      if (s.kvar < 0) capacitive += 1;
    }
    excessNow += excessKvarh(s, sampleHours);
    // Banco automático: compensa só o necessário, até o tamanho instalado.
    const compensated = recommended === null ? s : { kw: s.kw, kvar: s.kvar - Math.min(recommended, requiredKvar(s)) };
    excessAfter += excessKvarh(compensated, sampleHours);
  }
  return {
    samples: loaded.length,
    averagePf: energy > 0 ? weighted / energy : null,
    shareBelow: loaded.length > 0 ? below / loaded.length : 0,
    p95,
    max: required.length > 0 ? required[required.length - 1] : 0,
    recommended,
    excessNow,
    excessAfter,
    capacitiveShare: loaded.length > 0 ? capacitive / loaded.length : 0,
  };
}

/** Resposta de /api/tenants/<slug>/power-factor. */
export type PowerFactorResponse = {
  siteId: string;
  /** Dias analisados (até agora) e quantos tiveram leitura. */
  days: number;
  coveredDays: number;
  analysis: CapacitorAnalysis | null;
  /** Grupo A (verde/azul) paga o excedente de reativo. */
  groupA: boolean;
  hasTariff: boolean;
  /** R$ por mês (com impostos) do excedente hoje e com o banco recomendado; só Grupo A. */
  monthlyCostNow: number | null;
  monthlyCostAfter: number | null;
  noMainMeter: boolean;
  /** Sem kVAr medido: o reativo foi estimado pelo FP (supondo indutivo). */
  estimatedReactive: boolean;
};
