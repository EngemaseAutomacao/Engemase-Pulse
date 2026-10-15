/**
 * Metas mensais de consumo (kWh) e de custo (R$) por unidade e por setor.
 * A projeção estende o que já foi consumido até o fim do mês, pelas horas
 * que têm leitura (uma unidade sem internet por dois dias não vira "consumo zero").
 */

export type TargetStatus = "ok" | "near" | "over" | "none";

/** Projeção do mês; null antes de haver leitura. */
export function projectMonth(soFar: number, coveredHours: number, elapsedHours: number, monthHours: number): number | null {
  const base = Math.min(coveredHours, elapsedHours);
  if (base <= 0 || monthHours <= 0) return null;
  if (elapsedHours >= monthHours) return soFar;
  return soFar * (monthHours / base);
}

/** near: projeção acima de 90 % da meta · over: acima da meta. */
export function targetStatus(projected: number | null, target: number | null | undefined): TargetStatus {
  if (!target || projected === null) return "none";
  if (projected > target) return "over";
  if (projected > target * 0.9) return "near";
  return "ok";
}

/** Antes disso a projeção oscila demais para avisar (dias do mês). */
export const TARGET_ALERT_AFTER_DAYS = 5;

export type TargetRow = {
  /** "unidade:<id>" ou "medidor:<id>" */
  scope: string;
  siteId: string;
  meterId: string | null;
  label: string;
  detail: string;
  kwhSoFar: number;
  kwhProjected: number | null;
  /** R$ com impostos (energia; na unidade, a fatura estimada com demanda). */
  costSoFar: number | null;
  costProjected: number | null;
  targetKwh: number | null;
  targetCost: number | null;
};

export type SiteTargets = {
  siteId: string;
  siteName: string;
  month: string;
  timeZone: string;
  hasTariff: boolean;
  rows: TargetRow[];
};
