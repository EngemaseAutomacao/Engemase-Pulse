import "server-only";
import { AgentSource } from "./agent";
import type { MeterRef, TelemetrySource } from "./types";

/** Leituras de uma unidade: todas vêm do gateway instalado na unidade. */
export function sourceFor(site: { id: string }): TelemetrySource {
  return new AgentSource(site.id);
}

export function toMeterRef(meter: { id: string }): MeterRef {
  return { id: meter.id };
}
