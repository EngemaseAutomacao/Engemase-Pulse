/**
 * Grandezas de cada multimedidor, com os nomes usados em todo o sistema.
 * O gateway envia com os nomes dele; a tradução está em `painel-fields.ts`.
 */

export type FieldGroup = "voltage" | "current" | "power" | "quality" | "energy";

export type MeterField = {
  key: string;
  label: string;
  unit: string;
  group: FieldGroup;
  /** Casas decimais na exibição. */
  digits: number;
  /** Contador acumulado (energia): não faz sentido tirar média no gráfico. */
  cumulative?: boolean;
  /** Faixa considerada normal; fora dela o valor é destacado. */
  normal?: { min?: number; max?: number };
};

export const FIELD_GROUPS: { key: FieldGroup; label: string }[] = [
  { key: "voltage", label: "Tensão" },
  { key: "current", label: "Corrente" },
  { key: "power", label: "Potência" },
  { key: "quality", label: "Qualidade" },
  { key: "energy", label: "Energia" },
];

export const METER_FIELDS: readonly MeterField[] = [
  // Tensão fase-neutro
  { key: "V1N", label: "Tensão L1-N", unit: "V", group: "voltage", digits: 1 },
  { key: "V2N", label: "Tensão L2-N", unit: "V", group: "voltage", digits: 1 },
  { key: "V3N", label: "Tensão L3-N", unit: "V", group: "voltage", digits: 1 },
  { key: "VN_AVG", label: "Tensão L-N média", unit: "V", group: "voltage", digits: 1 },
  // Tensão fase-fase
  { key: "V12", label: "Tensão L1-L2", unit: "V", group: "voltage", digits: 1 },
  { key: "V23", label: "Tensão L2-L3", unit: "V", group: "voltage", digits: 1 },
  { key: "V31", label: "Tensão L3-L1", unit: "V", group: "voltage", digits: 1 },
  { key: "VLL_AVG", label: "Tensão L-L média", unit: "V", group: "voltage", digits: 1 },
  // Corrente
  { key: "I1", label: "Corrente L1", unit: "A", group: "current", digits: 1 },
  { key: "I2", label: "Corrente L2", unit: "A", group: "current", digits: 1 },
  { key: "I3", label: "Corrente L3", unit: "A", group: "current", digits: 1 },
  { key: "I_AVG", label: "Corrente média", unit: "A", group: "current", digits: 1 },
  { key: "I_N", label: "Corrente de neutro", unit: "A", group: "current", digits: 1 },
  // Potência ativa
  { key: "kW1", label: "Potência ativa L1", unit: "kW", group: "power", digits: 2 },
  { key: "kW2", label: "Potência ativa L2", unit: "kW", group: "power", digits: 2 },
  { key: "kW3", label: "Potência ativa L3", unit: "kW", group: "power", digits: 2 },
  { key: "Total_kW", label: "Potência ativa total", unit: "kW", group: "power", digits: 1 },
  // Potência aparente
  { key: "kVA1", label: "Potência aparente L1", unit: "kVA", group: "power", digits: 2 },
  { key: "kVA2", label: "Potência aparente L2", unit: "kVA", group: "power", digits: 2 },
  { key: "kVA3", label: "Potência aparente L3", unit: "kVA", group: "power", digits: 2 },
  { key: "Total_kVA", label: "Potência aparente total", unit: "kVA", group: "power", digits: 1 },
  // Potência reativa
  { key: "kVAr1", label: "Potência reativa L1", unit: "kVAr", group: "power", digits: 2 },
  { key: "kVAr2", label: "Potência reativa L2", unit: "kVAr", group: "power", digits: 2 },
  { key: "kVAr3", label: "Potência reativa L3", unit: "kVAr", group: "power", digits: 2 },
  { key: "Total_kVAr", label: "Potência reativa total", unit: "kVAr", group: "power", digits: 1 },
  { key: "Demand_kW", label: "Demanda máxima ativa", unit: "kW", group: "power", digits: 1 },
  // Qualidade
  { key: "PF1", label: "Fator de potência L1", unit: "", group: "quality", digits: 3 },
  { key: "PF2", label: "Fator de potência L2", unit: "", group: "quality", digits: 3 },
  { key: "PF3", label: "Fator de potência L3", unit: "", group: "quality", digits: 3 },
  {
    key: "PF_AVG",
    label: "Fator de potência médio",
    unit: "",
    group: "quality",
    digits: 3,
    normal: { min: 0.92 },
  },
  {
    key: "Frequencia",
    label: "Frequência",
    unit: "Hz",
    group: "quality",
    digits: 2,
    normal: { min: 59.5, max: 60.5 },
  },
  // Distorção harmônica (PRODIST: até 10% de THD de tensão em baixa tensão)
  { key: "THD_V1", label: "THD de tensão L1", unit: "%", group: "quality", digits: 1, normal: { max: 10 } },
  { key: "THD_V2", label: "THD de tensão L2", unit: "%", group: "quality", digits: 1, normal: { max: 10 } },
  { key: "THD_V3", label: "THD de tensão L3", unit: "%", group: "quality", digits: 1, normal: { max: 10 } },
  { key: "THD_I1", label: "THD de corrente L1", unit: "%", group: "quality", digits: 1 },
  { key: "THD_I2", label: "THD de corrente L2", unit: "%", group: "quality", digits: 1 },
  { key: "THD_I3", label: "THD de corrente L3", unit: "%", group: "quality", digits: 1 },
  // Energia (contadores)
  { key: "Total_net_kWh", label: "Energia ativa", unit: "kWh", group: "energy", digits: 0, cumulative: true },
  { key: "Total_kVAh", label: "Energia aparente", unit: "kVAh", group: "energy", digits: 0, cumulative: true },
  { key: "Total_kVAhr", label: "Energia reativa", unit: "kVArh", group: "energy", digits: 0, cumulative: true },
];

export const FIELD_BY_KEY: ReadonlyMap<string, MeterField> = new Map(METER_FIELDS.map((f) => [f.key, f]));

export const FIELD_KEYS: readonly string[] = METER_FIELDS.map((f) => f.key);

/**
 * Campos usados nos cartões, tabelas e totais do painel. As telas de lista
 * recebem só estes (bem menos dados por atualização); o detalhe recebe todos.
 */
export const SUMMARY_FIELDS = [
  "Total_kW",
  // Correntes por fase: carga do disjuntor (fase mais carregada) nos cartões e no unifilar.
  "I1",
  "I2",
  "I3",
  "Total_kVA",
  "Total_kVAr",
  "I_AVG",
  "VLL_AVG",
  "PF_AVG",
  "Frequencia",
  "Total_net_kWh",
] as const;

/** Contador usado para calcular consumo por hora/dia/mês. */
export const ENERGY_FIELD = "Total_net_kWh";

/**
 * Conjuntos de campos prontos para os gráficos de histórico. A posição do
 * campo define a cor (--chart-1…4): fases L1/L2/L3 sempre nas três primeiras,
 * total/média na quarta — a mesma fase tem a mesma cor em todos os gráficos.
 * Cada conjunto usa uma única unidade (um só eixo Y).
 */
export const CHART_PRESETS = [
  { id: "power", label: "Potência ativa", unit: "kW", fields: ["kW1", "kW2", "kW3", "Total_kW"] },
  {
    id: "power-total",
    label: "Potências totais",
    unit: "kW / kVA / kVAr",
    fields: ["Total_kW", "Total_kVA", "Total_kVAr"],
    labels: { Total_kW: "Ativa (kW)" },
  },
  { id: "current", label: "Correntes", unit: "A", fields: ["I1", "I2", "I3", "I_AVG"] },
  { id: "voltage-ln", label: "Tensões L-N", unit: "V", fields: ["V1N", "V2N", "V3N", "VN_AVG"] },
  { id: "voltage-ll", label: "Tensões L-L", unit: "V", fields: ["V12", "V23", "V31", "VLL_AVG"] },
  { id: "pf", label: "Fator de potência", unit: "", fields: ["PF1", "PF2", "PF3", "PF_AVG"] },
  { id: "frequency", label: "Frequência", unit: "Hz", fields: ["Frequencia"] },
  { id: "thd-v", label: "THD de tensão", unit: "%", fields: ["THD_V1", "THD_V2", "THD_V3"] },
  { id: "thd-i", label: "THD de corrente", unit: "%", fields: ["THD_I1", "THD_I2", "THD_I3"] },
] as const satisfies readonly {
  id: string;
  label: string;
  unit: string;
  fields: readonly string[];
  labels?: Readonly<Record<string, string>>;
}[];

/** Rótulo curto para legenda de gráfico (ex.: "L1", "Total"). */
export const SERIES_LABEL: Record<string, string> = {
  kW1: "L1", kW2: "L2", kW3: "L3", Total_kW: "Total",
  I1: "L1", I2: "L2", I3: "L3", I_AVG: "Média",
  V1N: "L1-N", V2N: "L2-N", V3N: "L3-N", VN_AVG: "Média",
  V12: "L1-L2", V23: "L2-L3", V31: "L3-L1", VLL_AVG: "Média",
  PF1: "L1", PF2: "L2", PF3: "L3", PF_AVG: "Médio",
  Total_kVA: "Aparente (kVA)", Total_kVAr: "Reativa (kVAr)",
  Frequencia: "Frequência",
  THD_V1: "L1", THD_V2: "L2", THD_V3: "L3",
  THD_I1: "L1", THD_I2: "L2", THD_I3: "L3",
};

export type ChartPresetId = (typeof CHART_PRESETS)[number]["id"];

export function isFieldOutOfRange(field: MeterField, value: number): boolean {
  const { min, max } = field.normal ?? {};
  return (min !== undefined && value < min) || (max !== undefined && value > max);
}
