import { FIELD_BY_KEY } from "./meter-fields";
import { ENERGY_PERIODS, resolveEnergyPeriod, type EnergyPeriodId } from "./time-range";

/**
 * Comparação de medidores (mesma unidade ou unidades diferentes).
 *
 * No máximo 3: as linhas ficam sobrepostas no mesmo gráfico, então todas as
 * cores precisam se distinguir entre si, não só as vizinhas. Com as séries
 * 1–3 (azul, laranja, verde-água) isso vale nos dois temas, inclusive para
 * daltonismo; a 4ª cor da paleta se confunde com a laranja.
 */
export const MAX_COMPARED_METERS = 3;

/** Grandezas comparáveis: uma por vez, então o gráfico tem um só eixo. */
export const COMPARE_FIELDS = [
  "Total_kW",
  "Total_kVA",
  "Total_kVAr",
  "Demand_kW",
  "I_AVG",
  "I_N",
  "VLL_AVG",
  "VN_AVG",
  "PF_AVG",
  "Frequencia",
  "THD_V1",
  "THD_I1",
] as const;

export type CompareField = (typeof COMPARE_FIELDS)[number];

export const COMPARE_PERIODS = ENERGY_PERIODS;

export type CompareState = { meterIds: string[]; field: CompareField; period: EnergyPeriodId };

export const DEFAULT_COMPARE_FIELD: CompareField = "Total_kW";

const isCompareField = (v: unknown): v is CompareField => COMPARE_FIELDS.includes(v as CompareField);
const isPeriod = (v: unknown): v is EnergyPeriodId => COMPARE_PERIODS.some((p) => p.id === v);

/** Lê `?m=id,id&g=campo&p=período`, descartando medidores que a pessoa não pode ver. */
export function parseCompareSearch(
  search: { m?: string | string[]; g?: string | string[]; p?: string | string[] },
  allowedIds: ReadonlySet<string>,
): CompareState {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const meterIds = [...new Set((first(search.m) ?? "").split(",").filter((id) => allowedIds.has(id)))].slice(
    0,
    MAX_COMPARED_METERS,
  );
  const field = first(search.g);
  const period = first(search.p);
  return {
    meterIds,
    field: isCompareField(field) ? field : DEFAULT_COMPARE_FIELD,
    period: isPeriod(period) ? period : "today",
  };
}

export function compareSearch(state: CompareState): string {
  const params = new URLSearchParams();
  if (state.meterIds.length) params.set("m", state.meterIds.join(","));
  if (state.field !== DEFAULT_COMPARE_FIELD) params.set("g", state.field);
  if (state.period !== "today") params.set("p", state.period);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function compareFieldLabel(field: CompareField): string {
  const meta = FIELD_BY_KEY.get(field);
  return meta ? `${meta.label}${meta.unit ? ` (${meta.unit})` : ""}` : field;
}

/**
 * Intervalo do histórico para o período, igual ao do consumo (calendário da
 * unidade), para os dois gráficos mostrarem o mesmo trecho de tempo.
 */
export function compareHistoryWindow(period: EnergyPeriodId, now: Date, timeZone: string): { from: Date; to: Date } {
  const { start } = resolveEnergyPeriod(period, now, timeZone);
  // Logo depois da meia-noite "hoje" teria segundos: mostra a última hora.
  const from = now.getTime() - start.getTime() < 60_000 ? new Date(now.getTime() - 3_600_000) : start;
  return { from, to: now };
}
