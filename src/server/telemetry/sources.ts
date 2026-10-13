import "server-only";
import { decryptSecret } from "@/server/crypto";
import { InfluxSource } from "./influx/source";
import { SimulatedSource } from "./simulated";
import { TelemetryError, type MeterRef, type TelemetrySource } from "./types";

/** O que é preciso da unidade para consultar suas leituras. */
export type SiteTelemetryConfig = {
  telemetrySource: "INFLUXDB" | "SIMULATED";
  influxUrl: string | null;
  influxOrg: string | null;
  influxBucket: string | null;
  influxRollupBucket?: string | null;
  influxTokenEncrypted: string | null;
};

const simulated = new SimulatedSource();

export function influxSourceFor(site: SiteTelemetryConfig): InfluxSource {
  const { influxUrl, influxOrg, influxBucket, influxTokenEncrypted } = site;
  if (!influxUrl || !influxOrg || !influxBucket || !influxTokenEncrypted) {
    throw new TelemetryError("Conexão com o InfluxDB não configurada para esta unidade");
  }
  return new InfluxSource({
    url: influxUrl,
    org: influxOrg,
    bucket: influxBucket,
    rollupBucket: site.influxRollupBucket || null,
    token: decryptSecret(influxTokenEncrypted),
  });
}

export function sourceFor(site: SiteTelemetryConfig): TelemetrySource {
  return site.telemetrySource === "SIMULATED" ? simulated : influxSourceFor(site);
}

export function toMeterRef(meter: {
  id: string;
  influxMeasurement: string;
  influxTagKey: string | null;
  influxTagValue: string | null;
}): MeterRef {
  return {
    id: meter.id,
    measurement: meter.influxMeasurement,
    tagKey: meter.influxTagKey || null,
    tagValue: meter.influxTagKey ? (meter.influxTagValue ?? "") : null,
  };
}
