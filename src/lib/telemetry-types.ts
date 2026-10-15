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
  /** Janela de agregação em ms (pontos alinhados a múltiplos dela). */
  everyMs: number;
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

/** Consumo de um setor no mês, dia a dia. */
export type SectorMonth = {
  id: string;
  tag: string;
  name: string;
  isMain: boolean;
  /** Posição = dia de `MonthConsumptionResponse.days`; null = sem leitura no dia. */
  kwh: (number | null)[];
  total: number;
  /** Custo da energia em R$ (com impostos), se a unidade tem tarifa. */
  cost: number | null;
  /** Mesmo trecho do mês anterior e do mesmo mês do ano anterior (kWh). */
  previousTotal: number | null;
  lastYearTotal: number | null;
};

/** Consumo de uma unidade num mês, por setor e dia, com comparações. */
export type MonthConsumptionResponse = {
  siteId: string;
  /** AAAA-MM. */
  month: string;
  timeZone: string;
  /** Início de cada dia do mês (epoch ms). */
  days: number[];
  sectors: SectorMonth[];
  entrance: Omit<SectorMonth, "id" | "tag" | "name" | "isMain"> & { fromMain: boolean };
  unmeasured: { kwh: (number | null)[]; total: number; cost: number | null } | null;
  /**
   * Trechos comparados. Com o mês em andamento, comparar com o mesmo trecho
   * (ex.: dias 1 a 14) é justo; com o mês fechado, o mês inteiro.
   */
  comparison: { previous: { start: number; stop: number }; lastYear: { start: number; stop: number }; partial: boolean };
  hasTariff: boolean;
  error: string | null;
};

/** Fatura estimada de uma unidade num mês. */
export type BillingResponse = {
  siteId: string;
  month: string;
  timeZone: string;
  tariff: import("./tariff").Tariff;
  bill: import("./tariff").BillEstimate;
  /** Maior demanda (média de 15 min) de cada dia, por posto (kW). */
  dailyDemand: { day: number; peak: number | null; offPeak: number | null }[];
  /** Sem entrada geral marcada: energia é a soma dos medidores e a demanda não é calculada. */
  noMainMeter: boolean;
  error: string | null;
};

/** Resposta de /api/tenants/<slug>/tv: alarmes abertos e consumo de hoje por unidade. */
export type TvResponse = {
  alarms: {
    id: string;
    severity: "INFO" | "WARNING" | "CRITICAL";
    title: string;
    message: string;
    startedAt: string;
    acknowledged: boolean;
  }[];
  alarmCount: number;
  today: { siteId: string; siteName: string; total: number; sectors: { id: string; label: string; kwh: number }[] }[];
  fetchedAt: string;
};
