import type { EnergyInterval } from "@/lib/time-range";
import type { MeterRef } from "../types";

/**
 * Construção das consultas Flux. Nada de concatenar texto do usuário cru:
 * todo valor entra como literal escapado (fluxString) ou é validado antes
 * (durações, datas).
 */

/** Literal de string Flux com escape de \, " e interpolação ${. */
export function fluxString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$\{/g, "\\${")}"`;
}

const DURATION = /^\d{1,4}(ms|s|m|h|d|w|mo|y)$/;

export function fluxDuration(value: string): string {
  if (!DURATION.test(value)) throw new Error(`Duração Flux inválida: ${value}`);
  return value;
}

export function fluxTime(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error("Data inválida na consulta Flux");
  return `time(v: ${fluxString(date.toISOString())})`;
}

/** Predicado que seleciona as séries de um medidor. */
export function meterPredicate(meter: MeterRef): string {
  const parts = [`r._measurement == ${fluxString(meter.measurement)}`];
  if (meter.tagKey && meter.tagValue !== null) {
    parts.push(`r[${fluxString(meter.tagKey)}] == ${fluxString(meter.tagValue)}`);
  }
  return parts.join(" and ");
}

/** Último ponto de cada série dos medidores informados (todos da mesma unidade). */
export function latestQuery(bucket: string, meters: MeterRef[], lookback = "24h"): string {
  const predicate = meters.map((m) => `(${meterPredicate(m)})`).join(" or ");
  const tagKeys = [...new Set(meters.flatMap((m) => (m.tagKey ? [m.tagKey] : [])))];
  const columns = ["_time", "_measurement", "_field", "_value", ...tagKeys].map(fluxString).join(", ");
  return `from(bucket: ${fluxString(bucket)})
  |> range(start: -${fluxDuration(lookback)})
  |> filter(fn: (r) => ${predicate})
  |> last()
  |> keep(columns: [${columns}])`;
}

/** Média por janela dos campos pedidos de um medidor. */
export function historyQuery(
  bucket: string,
  meter: MeterRef,
  fields: string[],
  start: Date,
  stop: Date,
  every: string,
): string {
  const fieldSet = fields.map(fluxString).join(", ");
  return `from(bucket: ${fluxString(bucket)})
  |> range(start: ${fluxTime(start)}, stop: ${fluxTime(stop)})
  |> filter(fn: (r) => ${meterPredicate(meter)})
  |> filter(fn: (r) => contains(value: r._field, set: [${fieldSet}]))
  |> group(columns: ["_field"])
  |> aggregateWindow(every: ${fluxDuration(every)}, fn: mean, createEmpty: false)
  |> keep(columns: ["_time", "_field", "_value"])`;
}

/**
 * Consumo por janela a partir do contador acumulado de energia.
 * Pega o último valor do contador em cada janela e subtrai o da janela anterior,
 * por isso a consulta começa uma janela antes (`queryStart`). Janelas no
 * calendário local da unidade (option location). Se o medidor tiver mais de
 * uma série (ex.: tag trocada no gateway), cada uma vem separada e o
 * chamador soma por janela.
 */
export function energyQuery(
  bucket: string,
  meter: MeterRef,
  field: string,
  queryStart: Date,
  stop: Date,
  interval: EnergyInterval,
  timeZone: string,
): string {
  return `import "timezone"
option location = timezone.location(name: ${fluxString(timeZone)})

from(bucket: ${fluxString(bucket)})
  |> range(start: ${fluxTime(queryStart)}, stop: ${fluxTime(stop)})
  |> filter(fn: (r) => ${meterPredicate(meter)} and r._field == ${fluxString(field)})
  |> aggregateWindow(every: ${fluxDuration(interval)}, fn: last, createEmpty: false, timeSrc: "_start")
  |> difference(nonNegative: true)
  |> keep(columns: ["_time", "_value"])`;
}

export function measurementsQuery(bucket: string): string {
  return `import "influxdata/influxdb/schema"
schema.measurements(bucket: ${fluxString(bucket)}, start: -30d)`;
}
