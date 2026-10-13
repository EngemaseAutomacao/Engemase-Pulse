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
