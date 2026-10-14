import type { EnergyInterval } from "./time-range";

/**
 * Formatos das respostas das rotas /api/tenants/... — compartilhados entre
 * o servidor (que monta) e o navegador (que consome).
 */

export type MeterStatus = "online" | "offline" | "no-data";

export type LiveMeter = { time: string | null; status: MeterStatus; values: Record<string, number> };

export type LiveSnapshot = {
  /** Por id do medidor. Medidores de unidades com erro não aparecem. */
  meters: Record<string, LiveMeter>;
  /** Por id da unidade: mensagem de erro da consulta. */
  errors: Record<string, string>;
  fetchedAt: string;
};

export type HistoryResponse = {
  /** Por campo: pontos [epoch ms, valor]. */
  series: Record<string, [number, number][]>;
  error: string | null;
  start: string;
  stop: string;
  every: string;
};

export type EnergyResponse = {
  interval: EnergyInterval;
  timeZone: string;
  buckets: { start: number; kwh: number | null }[];
  totalKwh: number;
  error: string | null;
};

/** Consumo de um medidor hora a hora num dia (posição = hora de `ConsumptionResponse.hours`). */
export type SectorConsumption = {
  id: string;
  tag: string;
  name: string;
  isMain: boolean;
  kwh: (number | null)[];
  /** Hora estimada pela potência (o contador não serviu). */
  estimated: boolean[];
  total: number;
};

/** Consumo de uma unidade num dia, por setor, no fuso da unidade. */
export type ConsumptionResponse = {
  siteId: string;
  /** AAAA-MM-DD no calendário local da unidade. */
  date: string;
  timeZone: string;
  /** Início de cada hora do dia (epoch ms). */
  hours: number[];
  sectors: SectorConsumption[];
  /**
   * Total da instalação: a entrada geral, se houver; senão, a soma dos medidores.
   * `fromMain` diz qual dos dois.
   */
  entrance: { kwh: (number | null)[]; estimated: boolean[]; total: number; fromMain: boolean };
  /** Entrada geral menos a soma dos alimentadores; null sem entrada geral ou sem alimentadores. */
  unmeasured: { kwh: (number | null)[]; total: number } | null;
  error: string | null;
};
