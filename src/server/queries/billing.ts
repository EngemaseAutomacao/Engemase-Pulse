import "server-only";
import type { SiteTariff } from "@/generated/prisma/client";
import type { BillingResponse, MonthConsumptionResponse, SectorMonth } from "@/lib/telemetry-types";
import { energyCost, estimateBill, periodAt, withTaxes, type Tariff } from "@/lib/tariff";
import { energyBucketStarts } from "@/lib/time-range";
import { addZoned, zonedTimeToUtc } from "@/lib/tz";
import { db } from "@/server/db";
import { getTenantTopology, type SiteTopology } from "@/server/telemetry/topology";

/**
 * Consumo do mês e fatura estimada. As leituras vêm das tabelas do gateway
 * local: consumo por hora (meter_energy_hours) e resumo de 5 min
 * (meter_readings_5m), de onde saem a demanda de 15 min e o fator de potência.
 */

export function toTariff(row: SiteTariff): Tariff {
  return {
    modality: row.modality,
    energyOffPeak: row.energyOffPeak,
    energyPeak: row.energyPeak,
    energyIntermediate: row.energyIntermediate,
    flagAdder: row.flagAdder,
    demandPrice: row.demandPrice,
    demandPeakPrice: row.demandPeakPrice,
    contractedDemand: row.contractedDemand,
    contractedDemandPeak: row.contractedDemandPeak,
    peakStartHour: row.peakStartHour,
    peakEndHour: row.peakEndHour,
    taxRate: row.taxRate,
  };
}

export async function getTariff(siteId: string): Promise<Tariff | null> {
  const row = await db.siteTariff.findUnique({ where: { siteId } });
  return row ? toTariff(row) : null;
}

/** Início e fim (exclusivo) do mês no relógio da unidade. */
export function monthWindow(month: string, timeZone: string): { start: Date; stop: Date } {
  const [year, m] = month.split("-").map(Number);
  return { start: zonedTimeToUtc(year, m, 1, 0, timeZone), stop: zonedTimeToUtc(year, m + 1, 1, 0, timeZone) };
}

type HourRow = { hour: number; kwh: number };

/** Consumo hora a hora de vários medidores. */
export async function hourlyEnergy(meterIds: string[], start: Date, stop: Date): Promise<Map<string, HourRow[]>> {
  const result = new Map<string, HourRow[]>(meterIds.map((id) => [id, []]));
  if (meterIds.length === 0) return result;
  const rows = await db.$queryRaw<{ meter_id: string; hour: number; kwh: number }[]>`
    SELECT meter_id::text, extract(epoch FROM hour)::float8 * 1000 AS hour, value::float8 AS kwh
      FROM meter_energy_hours
     WHERE meter_id = ANY(${meterIds}::uuid[])
       AND quantity = 'ACTIVE'
       AND hour >= ${start.toISOString()}::timestamp
       AND hour < ${stop.toISOString()}::timestamp
     ORDER BY hour`;
  for (const r of rows) result.get(r.meter_id)?.push({ hour: Number(r.hour), kwh: Number(r.kwh) });
  return result;
}

async function energyTotals(meterIds: string[], start: Date, stop: Date): Promise<Map<string, number>> {
  if (meterIds.length === 0 || stop <= start) return new Map();
  const rows = await db.$queryRaw<{ meter_id: string; kwh: number }[]>`
    SELECT meter_id::text, sum(value)::float8 AS kwh
      FROM meter_energy_hours
     WHERE meter_id = ANY(${meterIds}::uuid[])
       AND quantity = 'ACTIVE'
       AND hour >= ${start.toISOString()}::timestamp
       AND hour < ${stop.toISOString()}::timestamp
     GROUP BY meter_id`;
  return new Map(rows.map((r) => [r.meter_id, Number(r.kwh)]));
}

/** Demanda: média da potência ativa em janelas de 15 min (como a distribuidora mede). */
export async function demandWindows(
  meterId: string,
  start: Date,
  stop: Date,
): Promise<{ start: number; kw: number }[]> {
  const rows = await db.$queryRaw<{ start: number; kw: number }[]>`
    SELECT extract(epoch FROM date_bin('15 minutes', ts, TIMESTAMP '2000-01-01'))::float8 * 1000 AS start,
           avg(("values" -> 'Total_kW' ->> 0)::float8) AS kw
      FROM meter_readings_5m
     WHERE meter_id = ${meterId}::uuid
       AND ts >= ${start.toISOString()}::timestamp
       AND ts < ${stop.toISOString()}::timestamp
       AND "values" ? 'Total_kW'
     GROUP BY 1
     ORDER BY 1`;
  return rows.map((r) => ({ start: Number(r.start), kw: Number(r.kw) }));
}

/** Fator de potência médio de cada hora. */
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

function findSite(sites: SiteTopology[], siteId: string) {
  return sites.find((s) => s.id === siteId) ?? null;
}

/** Posição do dia de cada instante (dias em ordem; busca binária). */
function dayIndexOf(days: number[], t: number): number {
  let low = 0;
  let high = days.length - 1;
  if (t < days[0]) return -1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (days[mid] <= t) low = mid;
    else high = mid - 1;
  }
  return low;
}

function sumHours(rows: HourRow[]): HourRow[] {
  const byHour = new Map<number, number>();
  for (const r of rows) byHour.set(r.hour, (byHour.get(r.hour) ?? 0) + r.kwh);
  return [...byHour].map(([hour, kwh]) => ({ hour, kwh })).sort((a, b) => a.hour - b.hour);
}

// ---------------------------------------------------------------------------
// Consumo do mês por setor
// ---------------------------------------------------------------------------

export async function getSiteMonthConsumption(
  tenantId: string,
  siteId: string,
  month: string,
  now = new Date(),
): Promise<MonthConsumptionResponse | null> {
  const site = findSite(await getTenantTopology(tenantId), siteId);
  if (!site) return null;

  const { start, stop } = monthWindow(month, site.timezone);
  const days = energyBucketStarts({ start, stop, interval: "1d", timeZone: site.timezone }).map((d) => d.getTime());
  const meterIds = site.meters.map((m) => m.id);
  const until = new Date(Math.min(stop.getTime(), Math.max(start.getTime(), now.getTime())));
  const partial = until < stop;
  const elapsed = until.getTime() - start.getTime();

  // Mês em andamento: compara com o mesmo trecho (dias 1 a hoje) dos meses de referência.
  const prevStart = addZoned("month", start, -1, site.timezone);
  const prevStop = partial ? new Date(prevStart.getTime() + elapsed) : start;
  const lyStart = addZoned("month", start, -12, site.timezone);
  const lyStop = partial ? new Date(lyStart.getTime() + elapsed) : addZoned("month", stop, -12, site.timezone);

  let error: string | null = null;
  const [hourly, previous, lastYear, tariff] = await Promise.all([
    hourlyEnergy(meterIds, start, stop),
    energyTotals(meterIds, prevStart, prevStop),
    energyTotals(meterIds, lyStart, lyStop),
    getTariff(site.id),
  ]).catch((failure: unknown) => {
    console.error("[consumo do mês]", failure);
    error = "Falha ao consultar o consumo do mês";
    return [new Map<string, HourRow[]>(), new Map<string, number>(), new Map<string, number>(), null] as const;
  });

  const costOf = (rows: HourRow[]) =>
    tariff && rows.length > 0 ? withTaxes(energyCost(rows, site.timezone, tariff), tariff.taxRate) : tariff ? 0 : null;

  const sectors: SectorMonth[] = site.meters.map((meter) => {
    const rows = hourly.get(meter.id) ?? [];
    const kwh: (number | null)[] = days.map(() => null);
    for (const r of rows) {
      const i = dayIndexOf(days, r.hour);
      if (i >= 0) kwh[i] = (kwh[i] ?? 0) + r.kwh;
    }
    return {
      id: meter.id,
      tag: meter.tag,
      name: meter.name,
      isMain: meter.isMain,
      kwh,
      total: rows.reduce((s, r) => s + r.kwh, 0),
      cost: costOf(rows),
      previousTotal: previous.get(meter.id) ?? null,
      lastYearTotal: lastYear.get(meter.id) ?? null,
    };
  });

  const mains = sectors.filter((s) => s.isMain);
  const feeders = sectors.filter((s) => !s.isMain);
  const entranceSet = mains.length > 0 ? mains : sectors;
  const sumOf = (values: (number | null)[]) =>
    values.some((v) => v === null) ? null : values.reduce<number>((a, v) => a + v!, 0);
  const totalOf = (list: (number | null)[]) =>
    list.every((v) => v === null) ? null : list.reduce<number>((a, v) => a + (v ?? 0), 0);
  const entranceRows = sumHours(entranceSet.flatMap((s) => hourly.get(s.id) ?? []));
  const entrance = {
    kwh: days.map((_, i) => sumOf(entranceSet.map((s) => s.kwh[i]))),
    total: entranceSet.reduce((a, s) => a + s.total, 0),
    cost: costOf(entranceRows),
    previousTotal: totalOf(entranceSet.map((s) => s.previousTotal)),
    lastYearTotal: totalOf(entranceSet.map((s) => s.lastYearTotal)),
    fromMain: mains.length > 0,
  };

  let unmeasured: MonthConsumptionResponse["unmeasured"] = null;
  if (mains.length > 0 && feeders.length > 0) {
    const kwh = days.map((_, i) => {
      const main = entrance.kwh[i];
      const fed = sumOf(feeders.map((s) => s.kwh[i]));
      return main === null || fed === null ? null : Math.max(0, main - fed);
    });
    const feederCost = feeders.reduce((a, s) => a + (s.cost ?? 0), 0);
    unmeasured = {
      kwh,
      total: kwh.reduce<number>((a, v) => a + (v ?? 0), 0),
      cost: entrance.cost === null ? null : Math.max(0, entrance.cost - feederCost),
    };
  }

  return {
    siteId: site.id,
    month,
    timeZone: site.timezone,
    days,
    sectors,
    entrance,
    unmeasured,
    comparison: {
      previous: { start: prevStart.getTime(), stop: prevStop.getTime() },
      lastYear: { start: lyStart.getTime(), stop: lyStop.getTime() },
      partial,
    },
    hasTariff: tariff !== null,
    error,
  };
}

// ---------------------------------------------------------------------------
// Fatura estimada
// ---------------------------------------------------------------------------

/** null: a unidade não é deste cliente. `tariff: null`: unidade sem tarifa cadastrada. */
export async function getSiteBilling(
  tenantId: string,
  siteId: string,
  month: string,
  now = new Date(),
): Promise<BillingResponse | { tariff: null } | null> {
  const site = findSite(await getTenantTopology(tenantId), siteId);
  if (!site) return null;
  const tariff = await getTariff(site.id);
  if (!tariff) return { tariff: null };

  const { start, stop } = monthWindow(month, site.timezone);
  const main = site.meters.find((m) => m.isMain) ?? null;
  const meterIds = main ? [main.id] : site.meters.map((m) => m.id);

  let error: string | null = null;
  const [hourly, windows, powerFactor] = await Promise.all([
    hourlyEnergy(meterIds, start, stop),
    main ? demandWindows(main.id, start, stop) : Promise.resolve([]),
    main ? hourlyPowerFactor(main.id, start, stop) : Promise.resolve(new Map<number, number>()),
  ]).catch((failure: unknown) => {
    console.error("[fatura]", failure);
    error = "Falha ao consultar as leituras do mês";
    return [new Map<string, HourRow[]>(), [], new Map<number, number>()] as const;
  });

  const hours = sumHours([...hourly.values()].flat()).map((h) => ({
    ...h,
    powerFactor: powerFactor.get(h.hour) ?? null,
  }));
  const bill = estimateBill({ tariff, timeZone: site.timezone, hours, demandWindows: [...windows], start, stop, now });

  const days = energyBucketStarts({ start, stop, interval: "1d", timeZone: site.timezone }).map((d) => d.getTime());
  const dailyDemand = days.map((day) => ({ day, peak: null as number | null, offPeak: null as number | null }));
  for (const w of windows) {
    const i = dayIndexOf(days, w.start);
    if (i < 0) continue;
    const key = periodAt(w.start, site.timezone, tariff) === "peak" ? "peak" : "offPeak";
    dailyDemand[i][key] = Math.max(dailyDemand[i][key] ?? -Infinity, w.kw);
  }

  return { siteId: site.id, month, timeZone: site.timezone, tariff, bill, dailyDemand, noMainMeter: !main, error };
}
