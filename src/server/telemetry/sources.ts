import "server-only";
import type { TelemetrySource as TelemetrySourceKind } from "@/generated/prisma/enums";
import { decryptSecret } from "@/server/crypto";
import { AgentSource } from "./agent";
import { InfluxSource } from "./influx/source";
import { SimulatedSource } from "./simulated";
import { TelemetryError, type MeterRef, type TelemetrySource } from "./types";

/** O que é preciso da unidade para consultar suas leituras. */
export type SiteTelemetryConfig = {
  telemetrySource: TelemetrySourceKind;
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

export function sourceFor(site: SiteTelemetryConfig & { id: string }): TelemetrySource {
  switch (site.telemetrySource) {
    case "SIMULATED":
      return simulated;
    case "AGENT":
      return new AgentSource(site.id);
    case "INFLUXDB":
      return influxSourceFor(site);
  }
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
