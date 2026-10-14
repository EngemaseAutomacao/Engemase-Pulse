import { formatField } from "./format";
import { FIELD_BY_KEY } from "./meter-fields";
import type { LiveMeter } from "./telemetry-types";

/**
 * Regras de alarme — lógica pura (sem banco), usada pelo avaliador no servidor
 * e pelas telas para descrever as regras.
 */

export type Severity = "INFO" | "WARNING" | "CRITICAL";
export type RuleKind = "THRESHOLD" | "OFFLINE";
export type ComparisonKind = "ABOVE" | "BELOW";

export const SEVERITY_LABEL: Record<Severity, string> = {
  INFO: "Informativo",
  WARNING: "Atenção",
  CRITICAL: "Crítico",
};

export const SEVERITY_RANK: Record<Severity, number> = { INFO: 1, WARNING: 2, CRITICAL: 3 };

/** A partir desta severidade o alarme gera notificação push. */
export const PUSH_MIN_SEVERITY: Severity = "WARNING";

export type RuleDefinition = {
  kind: RuleKind;
  field: string | null;
  comparison: ComparisonKind | null;
  threshold: number;
};

export function describeRule(rule: RuleDefinition): string {
  if (rule.kind === "OFFLINE") {
    return `Sem leituras por mais de ${rule.threshold} min`;
  }
  const field = rule.field ? FIELD_BY_KEY.get(rule.field) : undefined;
  const label = field?.label ?? rule.field ?? "Campo";
  const direction = rule.comparison === "BELOW" ? "abaixo de" : "acima de";
  return `${label} ${direction} ${formatField(rule.field ?? "", rule.threshold)}`;
}

export type Evaluation =
  | { state: "triggered"; value: number | null; detail: string }
  | { state: "normal" }
  /** Sem dados suficientes para decidir: mantém o alarme como está. */
  | { state: "unknown" };

/**
 * Avalia uma regra contra a última leitura de um medidor.
 * @param siteError erro ao ler a unidade (banco ou cache indisponível etc.)
 */
export function evaluateRule(
  rule: RuleDefinition,
  reading: LiveMeter | undefined,
  siteError: string | undefined,
  now: number,
): Evaluation {
  if (rule.kind === "OFFLINE") {
    if (siteError) return { state: "triggered", value: null, detail: `Falha na leitura: ${siteError}` };
    if (!reading?.time) return { state: "triggered", value: null, detail: "Nenhuma leitura recebida nas últimas 24 h" };
    const minutes = (now - Date.parse(reading.time)) / 60_000;
    return minutes > rule.threshold
      ? { state: "triggered", value: Math.round(minutes), detail: `Última leitura há ${Math.round(minutes)} min` }
      : { state: "normal" };
  }

  // THRESHOLD: só decide com leitura recente; medidor sem comunicação é papel da regra OFFLINE.
  if (!rule.field || !rule.comparison || reading?.status !== "online") return { state: "unknown" };
  const value = reading.values[rule.field];
  if (value === undefined || !Number.isFinite(value)) return { state: "unknown" };
  const triggered = rule.comparison === "ABOVE" ? value > rule.threshold : value < rule.threshold;
  return triggered
    ? { state: "triggered", value, detail: `Valor atual: ${formatField(rule.field, value)}` }
    : { state: "normal" };
}
