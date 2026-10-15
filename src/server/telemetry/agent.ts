import "server-only";
import { FIELD_BY_KEY } from "@/lib/meter-fields";
import { INTERVAL_UNIT, type EnergyWindow } from "@/lib/time-range";
import { readAgentLive } from "@/server/agent/live-store";
import { db } from "@/server/db";
import type { EnergyBucket, HistoryQuery, MeterRef, Reading, Series, TelemetrySource } from "./types";

/**
 * Leituras das unidades com gateway: a leitura atual vem do último envio
 * do gateway, o histórico do resumo de 5 min e o consumo das horas fechadas
 * que ele calculou (pelo contador do medidor, ou estimado pela potência).
 */

/** Menor janela guardada: o gateway envia o resumo de 5 em 5 min. */
const MIN_WINDOW_S = 300;

export class AgentSource implements TelemetrySource {
  constructor(private readonly siteId: string) {}

  async latest(meters: MeterRef[]): Promise<Map<string, Reading>> {
    const live = await readAgentLive(this.siteId);
    const readings = new Map<string, Reading>();
    if (!live) return readings;
    for (const meter of meters) {
      const reading = live.readings[meter.id];
      if (reading) readings.set(meter.id, reading);
    }
    return readings;
  }

  async history(meter: MeterRef, query: HistoryQuery): Promise<Series> {
    const fields = query.fields.filter((f) => FIELD_BY_KEY.has(f));
    const series: Series = Object.fromEntries(fields.map((f) => [f, []]));
    if (fields.length === 0) return series;

    const windowS = Math.max(MIN_WINDOW_S, Math.round(durationMs(query.every) / 1000));
    // Contador (energia) não tem média: usa o máximo da janela, que é o último valor.
    const columns = fields.map((field, i) =>
      FIELD_BY_KEY.get(field)?.cumulative
        ? `max(("values" -> $${i + 5}::text ->> 2)::float8) AS f${i}`
        : `avg(("values" -> $${i + 5}::text ->> 0)::float8) AS f${i}`,
    );
    const rows = await db.$queryRawUnsafe<Record<string, number | null>[]>(
      `SELECT extract(epoch FROM date_bin(make_interval(secs => $2::float8), ts, TIMESTAMP '2000-01-01'))::float8 * 1000 AS t,
              ${columns.join(", ")}
         FROM meter_readings_5m
        WHERE meter_id = $1::uuid AND ts >= $3::timestamp AND ts < $4::timestamp
        GROUP BY 1
        ORDER BY 1`,
      meter.id,
      windowS,
      query.start.toISOString(),
      query.stop.toISOString(),
      ...fields,
    );

    for (const row of rows) {
      fields.forEach((field, i) => {
        const value = row[`f${i}`];
        if (value !== null && value !== undefined) series[field].push([Number(row.t), Number(value)]);
      });
    }
    return series;
  }

  /**
   * Consumo agrupado por hora, dia ou mês do calendário local da unidade.
   * Só horas fechadas: a hora em andamento entra quando o gateway a consolida.
   */
  async energy(meter: MeterRef, window: EnergyWindow): Promise<EnergyBucket[]> {
    const unit = INTERVAL_UNIT[window.interval];
    // "hour" guarda o instante em UTC; convertido para o relógio local para agrupar e de volta.
    const rows = await db.$queryRaw<{ start: number; kwh: number; estimated: boolean }[]>`
      SELECT extract(epoch FROM date_trunc(${unit}::text, (hour AT TIME ZONE 'UTC') AT TIME ZONE ${window.timeZone}::text) AT TIME ZONE ${window.timeZone}::text)::float8 * 1000 AS start,
             sum(value)::float8 AS kwh,
             bool_or(source = 'POWER') AS estimated
        FROM meter_energy_hours
       WHERE meter_id = ${meter.id}::uuid
         AND quantity = 'ACTIVE'
         AND hour >= ${window.start.toISOString()}::timestamp
         AND hour < ${window.stop.toISOString()}::timestamp
       GROUP BY 1
       ORDER BY 1`;
    return rows.map((r) => ({ start: Number(r.start), kwh: Number(r.kwh), estimated: Boolean(r.estimated) }));
  }
}

function durationMs(every: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(every);
  if (!match) return MIN_WINDOW_S * 1000;
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "s" | "m" | "h" | "d"];
  return Number(match[1]) * unit;
}
