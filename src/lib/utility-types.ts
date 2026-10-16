import type {
  AnnunciatorWindow,
  GeneratorStats,
  LeakCheck,
  LevelMark,
  TagInfo,
  UtilityModule,
  WaterDay,
  WaterSignal,
} from "@/lib/utilities";

/** Respostas das rotas dos módulos Água e Gerador (as telas consomem estes tipos). */

export type UtilityLive = {
  /** Última leitura do equipamento (ISO) ou null. */
  time: string | null;
  online: boolean;
  values: Record<string, number>;
};

type EquipmentBase = {
  id: string;
  name: string;
  tag: string | null;
  siteId: string;
  siteName: string;
  timeZone: string;
  live: UtilityLive | null;
  faults: { name: string; label: string }[];
  tagInfo: Record<string, TagInfo> | null;
};

export type WaterView = EquipmentBase & {
  kind: "WATER";
  capacityL: number | null;
  levelPct: number | null;
  volumeL: number | null;
  /** Consumo na última hora e meia a três horas (L/h). */
  usageLh: number | null;
  /** Horas até esvaziar no ritmo atual, sem reposição. */
  autonomyH: number | null;
  /** Consumo calculado só pelo nível (sem medidor de vazão): estimado na reposição. */
  levelOnly: boolean;
  hasPumpSignal: boolean;
  pumpOn: boolean | null;
  pressure: number | null;
  inflow: number | null;
  /** Coluna d'água (m), quando o CLP informa. */
  columnM: number | null;
  /** Horímetro da bomba de recalque (h). */
  pumpHours: number | null;
  /** Linhas de nível do gateway (alto, partida da bomba, baixo, crítico), de cima para baixo. */
  marks: LevelMark[];
  /** Boias, bomba em automático, falhas da bomba e do sensor. */
  signals: WaterSignal[];
  /** Dias (fuso da unidade), do mais antigo ao de hoje. */
  days: WaterDay[];
  /** Madrugada mais recente já completa (0h–5h). */
  leak: LeakCheck & { day: string | null };
};

export type GeneratorRunView = {
  id: number;
  startedAt: string;
  endedAt: string | null;
  reason: string | null;
  result: string | null;
  status: "running" | "ok" | "failed" | "tripped";
  durationSeconds: number | null;
  liters: number | null;
  kwh: number | null;
  batteryDrop: number | null;
  startSeconds: number | null;
};

export type EngineReading = { name: string; label: string; unit: string | null; decimals: number; value: number };

export type GeneratorView = EquipmentBase & {
  kind: "GENERATOR";
  state: string | null;
  running: boolean;
  ready: boolean | null;
  dieselPct: number | null;
  dieselL: number | null;
  tankL: number | null;
  autonomyH: number | null;
  batteryV: number | null;
  powerKw: number | null;
  nominalKw: number | null;
  daysSinceRun: number | null;
  mainsPresent: boolean | null;
  breakerClosed: boolean | null;
  hourMeter: number | null;
  /** Leituras do motor e do alternador que o controlador informa. */
  engine: EngineReading[];
  /** Janelas do anunciador de falhas, com a 1ª falha marcada. */
  annunciator: AnnunciatorWindow[];
  /** Linhas de nível do tanque de diesel. */
  marks: LevelMark[];
  /** Corridas dos últimos 30 dias. */
  stats30: GeneratorStats;
  /** Fração do tempo pronto para partir nos últimos 30 dias (0–1). */
  readiness30: number | null;
  runs: GeneratorRunView[];
};

export type UtilityView = WaterView | GeneratorView;

export type UtilitySiteView = {
  id: string;
  name: string;
  timeZone: string;
  /** Último envio do gateway da unidade (ISO) ou null. */
  receivedAt: string | null;
  equipment: UtilityView[];
};

export type UtilitiesResponse = {
  module: UtilityModule;
  sites: UtilitySiteView[];
  fetchedAt: string;
};

export type UtilityHistoryResponse = {
  /** Pontos por tag: [epoch ms, média]. */
  series: Record<string, [number, number][]>;
  /** Tamanho de cada ponto (ms). */
  everyMs: number;
};
