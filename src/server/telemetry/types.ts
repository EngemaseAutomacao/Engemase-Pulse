import type { EnergyWindow } from "@/lib/time-range";

/** O que a camada de telemetria precisa saber de um medidor. */
export type MeterRef = {
  id: string;
  measurement: string;
  tagKey: string | null;
  tagValue: string | null;
};

/** Última leitura de cada campo. `time` é o ponto mais recente (ISO) ou null. */
export type Reading = { time: string | null; values: Record<string, number> };

/** Pontos por campo: [epoch ms, valor]. */
export type Series = Record<string, [number, number][]>;

export type HistoryQuery = { fields: string[]; start: Date; stop: Date; every: string };

/**
 * Consumo de uma janela; `start` é o início da janela (epoch ms). `estimated`:
 * calculado pela potência média porque o contador não serviu (Painel local).
 */
export type EnergyBucket = { start: number; kwh: number; estimated?: boolean };

/**
 * Fonte de leituras de uma unidade. Implementações: InfluxDB (produção)
 * e simulada (demonstração e desenvolvimento sem gateway).
 */
export interface TelemetrySource {
  latest(meters: MeterRef[]): Promise<Map<string, Reading>>;
  history(meter: MeterRef, query: HistoryQuery): Promise<Series>;
  energy(meter: MeterRef, window: EnergyWindow): Promise<EnergyBucket[]>;
}

export class TelemetryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TelemetryError";
  }
}
