import { ENERGY_FIELD, FIELD_KEYS } from "@/lib/meter-fields";
import { INTERVAL_UNIT, type EnergyWindow } from "@/lib/time-range";
import { addZoned } from "@/lib/tz";
import type { EnergyBucket, HistoryQuery, MeterRef, Reading, Series, TelemetrySource } from "./types";

/**
 * Fonte simulada, determinística por medidor: o mesmo medidor no mesmo instante
 * sempre gera os mesmos valores. A potência segue uma curva diária (pico à tarde)
 * e a energia é a integral exata dessa curva, então gráficos de potência e de
 * consumo ficam coerentes entre si.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Pico de carga às 17h UTC (14h em Brasília). */
const PEAK_OFFSET_MS = 17 * HOUR_MS;
/** Leituras "chegam" a cada 5 s. */
const SAMPLE_MS = 5_000;

type Profile = {
  baseKw: number;
  swingKw: number;
  phaseVoltage: number;
  powerFactor: number;
  imbalance: [number, number, number];
  energyOffsetKwh: number;
  seed: number;
};

export class SimulatedSource implements TelemetrySource {
  async latest(meters: MeterRef[]): Promise<Map<string, Reading>> {
    const now = Math.floor(Date.now() / SAMPLE_MS) * SAMPLE_MS;
    return new Map(
      meters.map((meter) => [meter.id, { time: new Date(now).toISOString(), values: sample(profileOf(meter), now) }]),
    );
  }

  async history(meter: MeterRef, query: HistoryQuery): Promise<Series> {
    const profile = profileOf(meter);
    const everyMs = durationMs(query.every);
    const stop = Math.min(query.stop.getTime(), Date.now());
    const series: Series = Object.fromEntries(query.fields.map((f) => [f, []]));

    for (let t = Math.ceil(query.start.getTime() / everyMs) * everyMs; t <= stop; t += everyMs) {
      const values = sample(profile, t);
      for (const field of query.fields) {
        const value = values[field];
        if (value !== undefined) series[field].push([t, value]);
      }
    }
    return series;
  }

  async energy(meter: MeterRef, window: EnergyWindow): Promise<EnergyBucket[]> {
    const profile = profileOf(meter);
    const unit = INTERVAL_UNIT[window.interval];
    const now = Date.now();
    const buckets: EnergyBucket[] = [];

    for (let start = window.start; start < window.stop; start = addZoned(unit, start, 1, window.timeZone)) {
      if (start.getTime() >= now) break;
      const end = Math.min(addZoned(unit, start, 1, window.timeZone).getTime(), now);
      buckets.push({ start: start.getTime(), kwh: energyAt(profile, end) - energyAt(profile, start.getTime()) });
    }
    return buckets;
  }
}

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

const profiles = new Map<string, Profile>();

function profileOf(meter: MeterRef): Profile {
  const key = `${meter.id}:${meter.measurement}`;
  let profile = profiles.get(key);
  if (!profile) {
    const random = mulberry32(hashString(key));
    const baseKw = 15 + random() * 250;
    profile = {
      baseKw,
      swingKw: baseKw * (0.3 + random() * 0.25),
      phaseVoltage: random() < 0.5 ? 127 : 220,
      powerFactor: 0.88 + random() * 0.1,
      imbalance: [random() * 0.12 - 0.06, random() * 0.12 - 0.06, random() * 0.12 - 0.06],
      energyOffsetKwh: 10_000 + random() * 90_000,
      seed: hashString(meter.id),
    };
    profiles.set(key, profile);
  }
  return profile;
}

/** Potência ativa sem ruído: P(t) = A + B·cos(2π(t − pico)/dia). */
function powerAt(p: Profile, t: number): number {
  return p.baseKw + p.swingKw * Math.cos((2 * Math.PI * (t - PEAK_OFFSET_MS)) / DAY_MS);
}

/** "Instalação" fictícia dos medidores: o contador de energia conta a partir daqui. */
const COUNTER_START_MS = Date.UTC(2025, 0, 1);

/** Integral exata de P(t) em kWh (contador acumulado, sempre crescente). */
function energyAt(p: Profile, t: number): number {
  const hours = (t - COUNTER_START_MS) / HOUR_MS;
  const angle = (2 * Math.PI * (t - PEAK_OFFSET_MS)) / DAY_MS;
  return p.energyOffsetKwh + p.baseKw * hours + (p.swingKw * 24 * Math.sin(angle)) / (2 * Math.PI);
}

function sample(p: Profile, t: number): Record<string, number> {
  const random = mulberry32(p.seed ^ Math.floor(t / SAMPLE_MS));
  const noise = (amplitude: number) => 1 + (random() * 2 - 1) * amplitude;

  const totalKw = powerAt(p, t) * noise(0.02);
  const shares = p.imbalance.map((d) => (1 + d) / 3);
  const shareSum = shares.reduce((a, b) => a + b, 0);

  const vln = p.imbalance.map((d) => p.phaseVoltage * (1 - d * 0.15) * noise(0.004));
  const pf = [0, 1, 2].map(() => Math.min(0.999, p.powerFactor * noise(0.01)));
  const kw = shares.map((s) => (totalKw * s) / shareSum);
  const kva = kw.map((v, i) => v / pf[i]);
  const kvar = kva.map((v, i) => Math.sqrt(Math.max(0, v ** 2 - kw[i] ** 2)));
  const current = kva.map((v, i) => (v * 1000) / vln[i]);
  const vll = [
    Math.sqrt(3) * ((vln[0] + vln[1]) / 2),
    Math.sqrt(3) * ((vln[1] + vln[2]) / 2),
    Math.sqrt(3) * ((vln[2] + vln[0]) / 2),
  ];
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const avg = (values: number[]) => sum(values) / values.length;

  const energy = energyAt(p, t);
  const pfAvg = avg(pf);
  const values: Record<string, number> = {
    V1N: vln[0],
    V2N: vln[1],
    V3N: vln[2],
    VN_AVG: avg(vln),
    V12: vll[0],
    V23: vll[1],
    V31: vll[2],
    VLL_AVG: avg(vll),
    I1: current[0],
    I2: current[1],
    I3: current[2],
    I_AVG: avg(current),
    kW1: kw[0],
    kW2: kw[1],
    kW3: kw[2],
    Total_kW: sum(kw),
    kVA1: kva[0],
    kVA2: kva[1],
    kVA3: kva[2],
    Total_kVA: sum(kva),
    kVAr1: kvar[0],
    kVAr2: kvar[1],
    kVAr3: kvar[2],
    Total_kVAr: sum(kvar),
    PF1: pf[0],
    PF2: pf[1],
    PF3: pf[2],
    PF_AVG: pfAvg,
    Frequencia: 60 + 0.03 * Math.sin(t / 97_000) + (random() * 2 - 1) * 0.01,
    [ENERGY_FIELD]: energy,
    Total_kVAh: energy / p.powerFactor,
    Total_kVAhr: energy * Math.tan(Math.acos(p.powerFactor)),
  };
  // Garante que só campos do catálogo saiam daqui.
  return Object.fromEntries(FIELD_KEYS.filter((k) => k in values).map((k) => [k, values[k]]));
}

function durationMs(every: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(every);
  if (!match) return 300_000;
  const unit = { s: 1_000, m: 60_000, h: HOUR_MS, d: DAY_MS }[match[2] as "s" | "m" | "h" | "d"];
  return Number(match[1]) * unit;
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
