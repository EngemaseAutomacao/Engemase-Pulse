import "server-only";
import { periodAt, reactiveExcess } from "@/lib/tariff";
import type { MonthUsage, SimulationData } from "@/lib/tariff-sim";
import { addZoned, startOfZoned, zonedParts } from "@/lib/tz";
import { cached } from "@/server/cache";
import { db } from "@/server/db";
import { getTariff, hourlyEnergy } from "@/server/queries/billing";
import { getTenantTopology } from "@/server/telemetry/topology";

/**
 * Dados do simulador de tarifa: os últimos 12 meses fechados da entrada geral,
 * separados pelos postos (ponta, intermediário, fora ponta) com a maior
 * demanda de cada posto e o excedente de reativo. As contas por modalidade
 * são feitas na tela (src/lib/tariff-sim.ts), para responder na hora a cada
 * preço digitado.
 */

const MONTHS = 12;

export async function getSimulationData(tenantId: string, siteId: string, now = new Date()): Promise<SimulationData | null> {
  const site = (await getTenantTopology(tenantId)).find((s) => s.id === siteId);
  if (!site) return null;
  const tariff = await getTariff(site.id);
  const main = site.meters.find((m) => m.isMain) ?? null;
  const stop = startOfZoned("month", now, site.timezone);
  const start = addZoned("month", stop, -MONTHS, site.timezone);
  const peakStartHour = tariff?.peakStartHour ?? 18;
  const peakEndHour = tariff?.peakEndHour ?? 21;

  const meterIds = site.meters.map((m) => m.id);
  let months = await cached(
    `tariff-sim:v1:${site.id}:${start.toISOString()}:${peakStartHour}-${peakEndHour}`,
    6 * 3_600_000,
    () => loadMonths(site.timezone, main?.id ?? null, meterIds, start, stop, peakStartHour, peakEndHour),
  );
  // Loja nova, sem mês fechado: simula com o mês atual até agora (melhor que nada, avisado na tela).
  const partialCurrent = months.every((m) => m.coverage === 0);
  if (partialCurrent) {
    months = await cached(
      `tariff-sim:v1:${site.id}:atual:${Math.floor(now.getTime() / 3_600_000)}:${peakStartHour}-${peakEndHour}`,
      3_600_000,
      () =>
        loadMonths(site.timezone, main?.id ?? null, meterIds, stop, addZoned("month", stop, 1, site.timezone), peakStartHour, peakEndHour),
    );
  }
  return {
    partialCurrent,
    siteId: site.id,
    siteName: site.name,
    timeZone: site.timezone,
    tariff,
    peakStartHour,
    peakEndHour,
    months,
    noMainMeter: !main,
  };
}

async function loadMonths(
  timeZone: string,
  mainId: string | null,
  meterIds: string[],
  start: Date,
  stop: Date,
  peakStartHour: number,
  peakEndHour: number,
): Promise<MonthUsage[]> {
  const [energy, demand, powerFactor] = await Promise.all([
    hourlyEnergy(mainId ? [mainId] : meterIds, start, stop),
    mainId ? hourlyMaxDemand(mainId, start, stop) : Promise.resolve(new Map<number, number>()),
    mainId ? hourlyPowerFactor(mainId, start, stop) : Promise.resolve(new Map<number, number>()),
  ]);

  const byMonth = new Map<string, MonthUsage & { hours: number }>();
  const monthOf = (t: number) => {
    const p = zonedParts(new Date(t), timeZone);
    const key = `${p.year}-${String(p.month).padStart(2, "0")}`;
    let row = byMonth.get(key);
    if (!row) {
      row = {
        month: key,
        kwhPeak: 0,
        kwhIntermediate: 0,
        kwhOffPeak: 0,
        demandAll: null,
        demandPeak: null,
        demandOffPeak: null,
        reactiveKvarh: 0,
        coverage: 0,
        hours: 0,
      };
      byMonth.set(key, row);
    }
    return row;
  };
  const white = { modality: "WHITE" as const, peakStartHour, peakEndHour };
  const kwhByHour = new Map<number, number>();
  for (const rows of energy.values()) for (const r of rows) kwhByHour.set(r.hour, (kwhByHour.get(r.hour) ?? 0) + r.kwh);

  for (const [hour, kwh] of kwhByHour) {
    const row = monthOf(hour);
    row.hours += 1;
    const period = periodAt(hour, timeZone, white);
    if (period === "peak") row.kwhPeak += kwh;
    else if (period === "intermediate") row.kwhIntermediate += kwh;
    else row.kwhOffPeak += kwh;
    row.reactiveKvarh += reactiveExcess(kwh, powerFactor.get(hour) ?? null);
  }
  for (const [hour, kw] of demand) {
    const row = monthOf(hour);
    const key = periodAt(hour, timeZone, white) === "peak" ? "demandPeak" : "demandOffPeak";
    row.demandAll = Math.max(row.demandAll ?? -Infinity, kw);
    row[key] = Math.max(row[key] ?? -Infinity, kw);
  }

  // Todos os meses do intervalo, inclusive os sem leitura (cobertura 0).
  const result: MonthUsage[] = [];
  for (let m = start; m < stop; m = addZoned("month", m, 1, timeZone)) {
    const p = zonedParts(m, timeZone);
    const key = `${p.year}-${String(p.month).padStart(2, "0")}`;
    const next = addZoned("month", m, 1, timeZone);
    const hoursInMonth = Math.round((next.getTime() - m.getTime()) / 3_600_000);
    const row = byMonth.get(key);
    if (!row) {
      result.push({
        month: key,
        kwhPeak: 0,
        kwhIntermediate: 0,
        kwhOffPeak: 0,
        demandAll: null,
        demandPeak: null,
        demandOffPeak: null,
        reactiveKvarh: 0,
        coverage: 0,
      });
      continue;
    }
    const { hours, ...usage } = row;
    result.push({ ...usage, coverage: Math.min(1, hours / hoursInMonth) });
  }
  return result;
}

/** Maior média de 15 min dentro de cada hora (kW). */
async function hourlyMaxDemand(meterId: string, start: Date, stop: Date): Promise<Map<number, number>> {
  const rows = await db.$queryRaw<{ hour: number; kw: number }[]>`
    SELECT extract(epoch FROM date_trunc('hour', w))::float8 * 1000 AS hour, max(kw)::float8 AS kw
      FROM (
        SELECT date_bin('15 minutes', ts, TIMESTAMP '2000-01-01') AS w, avg(("values" -> 'Total_kW' ->> 0)::float8) AS kw
          FROM meter_readings_5m
         WHERE meter_id = ${meterId}::uuid
           AND ts >= ${start.toISOString()}::timestamp
           AND ts < ${stop.toISOString()}::timestamp
           AND "values" ? 'Total_kW'
         GROUP BY 1
      ) windows
     GROUP BY 1`;
  return new Map(rows.map((r) => [Number(r.hour), Number(r.kw)]));
}

async function hourlyPowerFactor(meterId: string, start: Date, stop: Date): Promise<Map<number, number>> {
  const rows = await db.$queryRaw<{ hour: number; pf: number }[]>`
    SELECT extract(epoch FROM date_trunc('hour', ts))::float8 * 1000 AS hour,
           avg(("values" -> 'PF_AVG' ->> 0)::float8) AS pf
      FROM meter_readings_5m
     WHERE meter_id = ${meterId}::uuid
       AND ts >= ${start.toISOString()}::timestamp
       AND ts < ${stop.toISOString()}::timestamp
       AND "values" ? 'PF_AVG'
     GROUP BY 1`;
  return new Map(rows.map((r) => [Number(r.hour), Math.abs(Number(r.pf))]));
}
