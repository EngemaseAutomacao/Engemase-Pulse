import "server-only";
import { OFFLINE_AFTER_MS } from "@/config/app";
import { db } from "@/server/db";
import { SUMMARY_FIELDS } from "@/lib/meter-fields";
import type { LiveSnapshot, MeterStatus } from "@/lib/telemetry-types";
import { resolveEnergyPeriod, type EnergyPeriodId, type ResolvedRange } from "@/lib/time-range";
import { getSiteLive } from "./live";
import { sourceFor, toMeterRef } from "./sources";
import { getTenantTopology } from "./topology";
import { TelemetryError, type EnergyBucket, type Series } from "./types";

export { influxSourceFor, sourceFor, toMeterRef } from "./sources";

function errorMessage(error: unknown): string {
  if (error instanceof TelemetryError) return error.message;
  console.error("[telemetria]", error);
  return "Falha inesperada ao consultar as leituras";
}

// ---------------------------------------------------------------------------
// Leituras ao vivo
// ---------------------------------------------------------------------------

export function statusOf(time: string | null, now: number): MeterStatus {
  if (!time) return "no-data";
  return now - Date.parse(time) > OFFLINE_AFTER_MS ? "offline" : "online";
}

export type LiveOptions = {
  /** Só os medidores desta unidade. */
  siteId?: string;
  /** Só este medidor (com todos os campos). */
  meterId?: string;
  /** "summary" devolve só os campos dos cartões e tabelas; "all", todos. */
  fields?: "summary" | "all";
};

/**
 * Última leitura dos medidores ativos do cliente. Topologia e leituras vêm do
 * cache (uma consulta ao InfluxDB por unidade a cada poucos segundos, não
 * importa quantas telas estejam abertas).
 */
export async function getTenantLive(tenantId: string, options: LiveOptions = {}): Promise<LiveSnapshot> {
  const topology = await getTenantTopology(tenantId);
  const sites = topology.filter(
    (site) =>
      (!options.siteId || site.id === options.siteId) &&
      (!options.meterId || site.meters.some((m) => m.id === options.meterId)),
  );

  const now = Date.now();
  const projection = options.fields === "summary" ? SUMMARY_FIELDS : null;
  const snapshot: LiveSnapshot = { meters: {}, errors: {}, fetchedAt: new Date(now).toISOString() };

  const results = await Promise.all(sites.map(async (site) => ({ site, live: await getSiteLive(site) })));
  for (const { site, live } of results) {
    if (live.error) snapshot.errors[site.id] = live.error;
    for (const meter of site.meters) {
      if (options.meterId && meter.id !== options.meterId) continue;
      const reading = live.readings[meter.id];
      if (!reading) continue;
      snapshot.meters[meter.id] = {
        time: reading.time,
        status: statusOf(reading.time, now),
        values: projection ? pick(reading.values, projection) : reading.values,
      };
    }
  }
  return snapshot;
}

function pick(values: Record<string, number>, keys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of keys) if (key in values) out[key] = values[key];
  return out;
}

// ---------------------------------------------------------------------------
// Histórico e consumo de um medidor (sob demanda, sem cache)
// ---------------------------------------------------------------------------

/** Medidor do cliente com a unidade, ou null (não existe ou é de outro cliente). */
export function findTenantMeter(tenantId: string, meterId: string) {
  return db.meter.findFirst({ where: { id: meterId, site: { tenantId } }, include: { site: true } });
}

type TenantMeter = NonNullable<Awaited<ReturnType<typeof findTenantMeter>>>;

export type TelemetryResult<T> = { data: T; error: string | null };

export async function getMeterHistory(
  meter: TenantMeter,
  fields: string[],
  range: ResolvedRange,
): Promise<TelemetryResult<Series>> {
  try {
    const data = await sourceFor(meter.site).history(toMeterRef(meter), {
      fields,
      start: range.start,
      stop: range.stop,
      every: range.every,
    });
    return { data, error: null };
  } catch (error) {
    return { data: {}, error: errorMessage(error) };
  }
}

export async function getMeterEnergy(
  meter: TenantMeter,
  periodId: EnergyPeriodId,
): Promise<TelemetryResult<{ buckets: EnergyBucket[]; window: ReturnType<typeof resolveEnergyPeriod> }>> {
  const window = resolveEnergyPeriod(periodId, new Date(), meter.site.timezone);
  try {
    const buckets = await sourceFor(meter.site).energy(toMeterRef(meter), window);
    return { data: { buckets, window }, error: null };
  } catch (error) {
    return { data: { buckets: [], window }, error: errorMessage(error) };
  }
}
