import "server-only";
import { PF_MINIMUM, energyPowerFactor, topDemandWindows } from "@/lib/reports";
import { DEMAND_TOLERANCE, periodAt, type Tariff } from "@/lib/tariff";
import { energyBucketStarts } from "@/lib/time-range";
import { db } from "@/server/db";
import { demandWindows, getTariff, hourlyEnergy } from "@/server/queries/billing";
import type { SiteTopology } from "@/server/telemetry/topology";

/**
 * Relatório de demanda e fator de potência da entrada geral: a maior demanda
 * de cada dia (janelas de 15 min, como a distribuidora mede) contra a
 * contratada, os maiores picos, e o fator de potência hora a hora, com o
 * reativo excedente estimado (abaixo de 0,92).
 */

export type DemandPeriod = "peak" | "offPeak" | "single";

export type DemandReport = {
  meter: { id: string; tag: string; name: string };
  tariff: Tariff | null;
  /** Ponta e fora ponta (azul); "single" nas demais e sem tarifa. */
  splitPeak: boolean;
  contracted: { peak: number | null; offPeak: number | null };
  days: number[];
  dailyMax: { peak: (number | null)[]; offPeak: (number | null)[] };
  monthMax: Record<"peak" | "offPeak", { kw: number; at: number } | null>;
  /** Dias acima da contratada mais a tolerância de 5 %. */
  overruns: { day: number; period: DemandPeriod; kw: number; contracted: number }[];
  topWindows: { start: number; kw: number; day: number; period: DemandPeriod }[];
  pf: {
    /** kWh ÷ kVAh do mês (pela energia aparente), ou a média ponderada das horas. */
    month: number | null;
    fromEnergy: boolean;
    daily: (number | null)[];
    hoursMeasured: number;
    hoursBelow: number;
    /** kvarh além do que 0,92 permitiria: Σ kWh × (0,92 ÷ FP − 1) nas horas abaixo. */
    excessKvarh: number;
    worstDays: { day: number; hoursBelow: number; minPf: number }[];
  };
  kwh: number;
  kvah: number | null;
};

/** Hora com consumo de verdade (com a loja fechada, o FP de poucos watts não diz nada). */
const MIN_HOUR_KW = 1;

export async function getDemandReport(site: SiteTopology, start: Date, stop: Date): Promise<DemandReport | null> {
  const main = site.meters.find((m) => m.isMain);
  if (!main) return null;
  const timeZone = site.timezone;
  const [tariff, windows, hourly, pfRows, apparent] = await Promise.all([
    getTariff(site.id),
    demandWindows(main.id, start, stop),
    hourlyEnergy([main.id], start, stop),
    db.$queryRaw<{ hour: number; pf: number | null; kw: number | null }[]>`
      SELECT extract(epoch FROM date_trunc('hour', ts))::float8 * 1000 AS hour,
             avg(abs(("values" -> 'PF_AVG' ->> 0)::float8)) AS pf,
             avg(("values" -> 'Total_kW' ->> 0)::float8) AS kw
        FROM meter_readings_5m
       WHERE meter_id = ${main.id}::uuid
         AND ts >= ${start.toISOString()}::timestamp
         AND ts < ${stop.toISOString()}::timestamp
         AND "values" ? 'PF_AVG'
       GROUP BY 1
       ORDER BY 1`,
    db.$queryRaw<{ kvah: number | null }[]>`
      SELECT sum(value)::float8 AS kvah
        FROM meter_energy_hours
       WHERE meter_id = ${main.id}::uuid
         AND quantity = 'APPARENT'
         AND hour >= ${start.toISOString()}::timestamp
         AND hour < ${stop.toISOString()}::timestamp`,
  ]);

  const days = energyBucketStarts({ start, stop, interval: "1d", timeZone }).map((d) => d.getTime());
  const dayOf = (t: number) => {
    let lo = 0;
    let hi = days.length - 1;
    if (t < days[0]) return -1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (days[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  // Ponta e fora ponta só na azul (demanda contratada por posto); na verde a
  // demanda é uma só, a maior do mês em qualquer horário.
  const splitPeak = tariff?.modality === "BLUE";
  const periodOf = (t: number): DemandPeriod =>
    !splitPeak ? "single" : periodAt(t, timeZone, tariff!) === "peak" ? "peak" : "offPeak";
  const contracted = {
    peak: splitPeak ? tariff!.contractedDemandPeak : null,
    offPeak: tariff?.contractedDemand ?? null,
  };
  const dailyMax = { peak: days.map(() => null as number | null), offPeak: days.map(() => null as number | null) };
  const monthMax: DemandReport["monthMax"] = { peak: null, offPeak: null };
  const tagged = windows.flatMap((w) => {
    const i = dayOf(w.start);
    if (i < 0 || !Number.isFinite(w.kw)) return [];
    const period = periodOf(w.start);
    const key = period === "peak" ? "peak" : "offPeak";
    dailyMax[key][i] = Math.max(dailyMax[key][i] ?? -Infinity, w.kw);
    if (!monthMax[key] || w.kw > monthMax[key]!.kw) monthMax[key] = { kw: w.kw, at: w.start };
    return [{ start: w.start, kw: w.kw, day: days[i], period }];
  });
  const overruns: DemandReport["overruns"] = [];
  days.forEach((day, i) => {
    for (const key of ["peak", "offPeak"] as const) {
      const kw = dailyMax[key][i];
      // sem a contratada de ponta cadastrada, a ponta compara com a contratada única
      const limit = key === "peak" ? (contracted.peak ?? contracted.offPeak) : contracted.offPeak;
      if (kw !== null && limit && kw > limit * (1 + DEMAND_TOLERANCE)) {
        overruns.push({ day, period: splitPeak ? key : "single", kw, contracted: limit });
      }
    }
  });

  // Fator de potência hora a hora, ponderado pela potência; excedente pela energia da hora.
  const kwhByHour = new Map((hourly.get(main.id) ?? []).map((h) => [h.hour, h.kwh]));
  const acc = days.map(() => ({ kw: 0, kwPf: 0, below: 0, minPf: Infinity }));
  let hoursMeasured = 0;
  let hoursBelow = 0;
  let excessKvarh = 0;
  let weighted = 0;
  let weight = 0;
  for (const r of pfRows) {
    const pf = r.pf === null ? null : Math.min(1, Number(r.pf));
    const kw = Number(r.kw ?? 0);
    if (pf === null || !(pf > 0) || kw < MIN_HOUR_KW) continue;
    const hour = Number(r.hour);
    const i = dayOf(hour);
    if (i < 0) continue;
    hoursMeasured += 1;
    acc[i].kw += kw;
    acc[i].kwPf += kw * pf;
    weighted += kw * pf;
    weight += kw;
    if (pf < PF_MINIMUM) {
      hoursBelow += 1;
      acc[i].below += 1;
      acc[i].minPf = Math.min(acc[i].minPf, pf);
      excessKvarh += (kwhByHour.get(hour) ?? kw) * (PF_MINIMUM / pf - 1);
    }
  }

  const kwh = [...kwhByHour.values()].reduce((s, v) => s + v, 0);
  const kvah = apparent[0]?.kvah === null || apparent[0]?.kvah === undefined ? null : Number(apparent[0].kvah);
  const fromEnergy = kvah !== null ? energyPowerFactor(kwh, kvah) : null;

  return {
    meter: { id: main.id, tag: main.tag, name: main.name },
    tariff,
    splitPeak,
    contracted,
    days,
    dailyMax,
    monthMax,
    overruns,
    topWindows: topDemandWindows(tagged, 10),
    pf: {
      month: fromEnergy ?? (weight > 0 ? weighted / weight : null),
      fromEnergy: fromEnergy !== null,
      daily: acc.map((a) => (a.kw > 0 ? a.kwPf / a.kw : null)),
      hoursMeasured,
      hoursBelow,
      excessKvarh,
      worstDays: acc
        .map((a, i) => ({ day: days[i], hoursBelow: a.below, minPf: a.minPf }))
        .filter((d) => d.hoursBelow > 0)
        .sort((a, b) => b.hoursBelow - a.hoursBelow || a.minPf - b.minPf)
        .slice(0, 8),
    },
    kwh,
    kvah,
  };
}
