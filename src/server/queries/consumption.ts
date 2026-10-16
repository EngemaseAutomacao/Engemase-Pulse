import "server-only";
import type { ConsumptionResponse, SectorConsumption } from "@/lib/telemetry-types";
import { energyBucketStarts, type EnergyQuantity, type EnergyWindow } from "@/lib/time-range";
import { addZoned, zonedTimeToUtc } from "@/lib/tz";
import { sourceFor, toMeterRef } from "@/server/telemetry/sources";
import { getTenantTopology } from "@/server/telemetry/topology";
import { TelemetryError } from "@/server/telemetry/types";

/**
 * Consumo de uma unidade num dia, hora a hora, por setor (energia ativa, ou a
 * aparente em kVAh). Com entrada geral
 * cadastrada, os demais medidores são os setores (alimentadores) e o "não
 * medido" é a entrada menos a soma deles: perdas, circuitos sem medidor ou
 * medidor com defeito. Funciona com qualquer fonte de leituras.
 *
 * null: a unidade não existe ou não é deste cliente.
 */
export async function getSiteDayConsumption(
  tenantId: string,
  siteId: string,
  date: string,
  quantity: EnergyQuantity = "ACTIVE",
): Promise<ConsumptionResponse | null> {
  const site = (await getTenantTopology(tenantId)).find((s) => s.id === siteId);
  if (!site) return null;

  const [year, month, day] = date.split("-").map(Number);
  const start = zonedTimeToUtc(year, month, day, 0, site.timezone);
  const window: EnergyWindow = {
    start,
    stop: addZoned("day", start, 1, site.timezone),
    interval: "1h",
    timeZone: site.timezone,
    quantity,
  };
  const hours = energyBucketStarts(window).map((h) => h.getTime());

  let error: string | null = null;
  const source = sourceFor(site);
  const sectors: SectorConsumption[] = await Promise.all(
    site.meters.map(async (meter) => {
      const kwh: (number | null)[] = hours.map(() => null);
      const estimated = hours.map(() => false);
      try {
        const buckets = await source.energy(toMeterRef(meter), window);
        const position = new Map(hours.map((h, i) => [h, i]));
        for (const bucket of buckets) {
          const i = position.get(bucket.start);
          if (i === undefined) continue;
          kwh[i] = bucket.kwh;
          estimated[i] = Boolean(bucket.estimated);
        }
      } catch (failure) {
        if (!(failure instanceof TelemetryError)) console.error("[consumo]", failure);
        error ??= failure instanceof TelemetryError ? failure.message : "Falha inesperada ao consultar o consumo";
      }
      return { id: meter.id, tag: meter.tag, name: meter.name, isMain: meter.isMain, kwh, estimated, total: sum(kwh) };
    }),
  );

  const mains = sectors.filter((s) => s.isMain);
  const feeders = sectors.filter((s) => !s.isMain);
  const entranceSectors = mains.length > 0 ? mains : sectors;
  const entranceKwh = hours.map((_, i) => sumOrNull(entranceSectors.map((s) => s.kwh[i])));
  const entrance = {
    kwh: entranceKwh,
    estimated: hours.map((_, i) => entranceSectors.some((s) => s.estimated[i])),
    total: sum(entranceKwh),
    fromMain: mains.length > 0,
  };

  let unmeasured: ConsumptionResponse["unmeasured"] = null;
  // Na aparente, a entrada não é a soma dos setores (os fatores de potência diferem):
  // o "não medido" só existe na energia ativa.
  if (quantity === "ACTIVE" && mains.length > 0 && feeders.length > 0) {
    // Hora sem leitura de algum alimentador não tem "não medido" confiável. Diferença
    // negativa (soma dos alimentadores um pouco acima da entrada) é erro de medição: vira 0.
    const kwh = hours.map((_, i) => {
      const fed = sumOrNull(feeders.map((s) => s.kwh[i]));
      const main = entranceKwh[i];
      return main === null || fed === null ? null : Math.max(0, main - fed);
    });
    unmeasured = { kwh, total: sum(kwh) };
  }

  return {
    siteId: site.id,
    date,
    quantity,
    unit: quantity === "APPARENT" ? "kVAh" : "kWh",
    timeZone: site.timezone,
    hours,
    sectors,
    entrance,
    unmeasured,
    error,
  };
}

function sum(values: (number | null)[]): number {
  return values.reduce<number>((total, v) => total + (v ?? 0), 0);
}

/** Soma só quando todos têm valor (com um faltando, o total daquela hora não é confiável). */
function sumOrNull(values: (number | null)[]): number | null {
  if (values.length === 0 || values.some((v) => v === null)) return null;
  return sum(values);
}
