import { z } from "zod";
import { FIELD_KEYS } from "./meter-fields";
import { ENERGY_PERIOD_IDS, HISTORY_RANGE_IDS, MAX_HISTORY_SPAN_MS } from "./time-range";

/**
 * Parâmetros aceitos pelas rotas de telemetria. Compartilhados entre o
 * servidor (validação) e o navegador (montagem da URL).
 */

const fieldList = z
  .string()
  .transform((value) => [...new Set(value.split(",").filter(Boolean))])
  .pipe(
    z
      .array(z.enum(FIELD_KEYS as [string, ...string[]]))
      .min(1, "Informe ao menos um campo")
      .max(12, "No máximo 12 campos por consulta"),
  );

const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

/** Período pré-definido (range) ou personalizado (from/to). */
export const historyParams = z
  .object({
    fields: fieldList,
    range: z.enum(HISTORY_RANGE_IDS).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine((p) => p.range || (p.from && p.to), "Informe o período")
  .refine((p) => !p.from || !p.to || (p.to > p.from && +p.to - +p.from <= MAX_HISTORY_SPAN_MS), {
    message: "Período inválido (máximo de 1 ano)",
  });

export type HistoryParams = z.input<typeof historyParams>;

export const energyParams = z.object({ period: z.enum(ENERGY_PERIOD_IDS) });

/**
 * Leituras ao vivo: por padrão só os campos de resumo de todos os medidores;
 * com `meter`, só aquele medidor com todos os campos.
 */
export const liveParams = z.object({
  site: z.uuid().optional(),
  meter: z.uuid().optional(),
  view: z.enum(["summary", "full"]).default("summary"),
});

/** Converte URLSearchParams em objeto simples para o zod. */
export function searchParamsObject(params: URLSearchParams): Record<string, string> {
  return Object.fromEntries(params.entries());
}
