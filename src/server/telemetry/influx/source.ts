import "server-only";
import { ENERGY_FIELD } from "@/lib/meter-fields";
import { INTERVAL_UNIT, type EnergyWindow } from "@/lib/time-range";
import { addZoned } from "@/lib/tz";
import type { EnergyBucket, HistoryQuery, MeterRef, Reading, Series, TelemetrySource } from "../types";
import type { FluxRow } from "./csv";
import { queryFlux, type InfluxConnection } from "./client";
import { energyQuery, historyQuery, latestQuery, measurementsQuery } from "./flux";

export class InfluxSource implements TelemetrySource {
  constructor(private readonly connection: InfluxConnection) {}

  async latest(meters: MeterRef[]): Promise<Map<string, Reading>> {
    const result = new Map<string, Reading>();
    if (meters.length === 0) return result;

    const rows = await queryFlux(this.connection, latestQuery(this.connection.bucket, meters));
    for (const meter of meters) {
      result.set(meter.id, toReading(rows.filter((row) => rowBelongsTo(row, meter))));
    }
    return result;
  }

  async history(meter: MeterRef, query: HistoryQuery): Promise<Series> {
    // Janelas de 1 h ou mais leem o bucket agregado (se existir): muito menos pontos para varrer.
    const bucket = this.connection.rollupBucket && windowMs(query.every) >= HOUR_MS ? this.connection.rollupBucket : this.connection.bucket;
    const flux = historyQuery(bucket, meter, query.fields, query.start, query.stop, query.every);
    const rows = await queryFlux(this.connection, flux);

    const series: Series = Object.fromEntries(query.fields.map((f) => [f, []]));
    for (const row of rows) {
      const field = row._field;
      const time = typeof row._time === "string" ? Date.parse(row._time) : NaN;
      if (typeof field !== "string" || typeof row._value !== "number" || Number.isNaN(time)) continue;
      (series[field] ??= []).push([time, row._value]);
    }
    for (const points of Object.values(series)) points.sort((a, b) => a[0] - b[0]);
    return series;
  }

  async energy(meter: MeterRef, window: EnergyWindow): Promise<EnergyBucket[]> {
    const queryStart = addZoned(INTERVAL_UNIT[window.interval], window.start, -1, window.timeZone);
    // Consumo diário/mensal sai do bucket agregado (o contador de cada hora basta).
    const bucket = this.connection.rollupBucket && window.interval !== "1h" ? this.connection.rollupBucket : this.connection.bucket;
    const flux = energyQuery(
      bucket,
      meter,
      ENERGY_FIELD,
      queryStart,
      window.stop,
      window.interval,
      window.timeZone,
    );
    const rows = await queryFlux(this.connection, flux);

    // Soma por janela (o medidor pode ter mais de uma série no período).
    const totals = new Map<number, number>();
    for (const row of rows) {
      const start = typeof row._time === "string" ? Date.parse(row._time) : NaN;
      if (Number.isNaN(start) || typeof row._value !== "number" || start < window.start.getTime()) continue;
      totals.set(start, (totals.get(start) ?? 0) + row._value);
    }
    return [...totals].map(([start, kwh]) => ({ start, kwh })).sort((a, b) => a.start - b.start);
  }

  /** Testa a conexão e devolve os measurements com dados nos últimos 30 dias. */
  async listMeasurements(): Promise<string[]> {
    const rows = await queryFlux(this.connection, measurementsQuery(this.connection.bucket));
    return rows
      .map((row) => row._value)
      .filter((v): v is string => typeof v === "string")
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }
}

const HOUR_MS = 3_600_000;
const UNIT_MS: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: HOUR_MS, d: 24 * HOUR_MS, w: 7 * 24 * HOUR_MS };

/** Duração de uma janela Flux simples ("5m", "2h", "1d") em ms; 0 se não reconhecida. */
export function windowMs(every: string): number {
  const match = /^(\d+)(ms|s|m|h|d|w)$/.exec(every);
  return match ? Number(match[1]) * UNIT_MS[match[2]] : 0;
}

function rowBelongsTo(row: FluxRow, meter: MeterRef): boolean {
  if (row._measurement !== meter.measurement) return false;
  if (meter.tagKey && meter.tagValue !== null) return row[meter.tagKey] === meter.tagValue;
  return true;
}

/** Junta as últimas linhas de um medidor: por campo, fica o ponto mais recente. */
export function toReading(rows: FluxRow[]): Reading {
  const values: Record<string, number> = {};
  const fieldTimes: Record<string, number> = {};
  let latest = -Infinity;

  for (const row of rows) {
    const field = row._field;
    // Compara como número: o RFC3339 do Influx tem precisão variável e não ordena como texto.
    const rowTime = typeof row._time === "string" ? Date.parse(row._time) : NaN;
    if (typeof field !== "string" || Number.isNaN(rowTime)) continue;
    if (fieldTimes[field] !== undefined && fieldTimes[field] >= rowTime) continue;

    if (typeof row._value === "number") values[field] = row._value;
    else if (typeof row._value === "boolean") values[field] = row._value ? 1 : 0;
    else continue;

    fieldTimes[field] = rowTime;
    latest = Math.max(latest, rowTime);
  }
  return { time: Number.isFinite(latest) ? new Date(latest).toISOString() : null, values };
}
