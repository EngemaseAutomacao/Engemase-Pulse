/**
 * Tradução das grandezas do Painel local (supervisório da loja) para os campos
 * do sistema (`meter-fields.ts`). Os nomes da esquerda são os `nome` das tags
 * nos perfis de equipamento do Painel (ex.: perfis/7kt0310-entrada.json).
 * Grandeza que não está aqui é ignorada.
 */
export const PAINEL_FIELD_MAP: Readonly<Record<string, string>> = {
  tensao_an: "V1N",
  tensao_bn: "V2N",
  tensao_cn: "V3N",
  tensao_ab: "V12",
  tensao_bc: "V23",
  tensao_ca: "V31",
  corrente_a: "I1",
  corrente_b: "I2",
  corrente_c: "I3",
  corrente_n: "I_N",
  potencia_ativa: "Total_kW",
  potencia_aparente: "Total_kVA",
  potencia_reativa: "Total_kVAr",
  fp: "PF_AVG",
  frequencia: "Frequencia",
  demanda: "Demand_kW",
  energia_ativa: "Total_net_kWh",
  energia_aparente: "Total_kVAh",
  energia_reativa: "Total_kVAhr",
  // No Painel o THD sem sufixo é o da fase A (a tela mostra "THD tensão V1").
  thd_tensao: "THD_V1",
  thd_tensao_b: "THD_V2",
  thd_tensao_c: "THD_V3",
  thd_corrente: "THD_I1",
  thd_corrente_b: "THD_I2",
  thd_corrente_c: "THD_I3",
};

/** Médias que o Painel não manda, mas as telas usam: calculadas quando há as três fases. */
const DERIVED_AVERAGES: readonly [string, readonly [string, string, string]][] = [
  ["VN_AVG", ["V1N", "V2N", "V3N"]],
  ["VLL_AVG", ["V12", "V23", "V31"]],
  ["I_AVG", ["I1", "I2", "I3"]],
];

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Valores instantâneos do Painel → campos do sistema (com as médias por fase). */
export function mapPainelValues(valores: Readonly<Record<string, unknown>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [tag, value] of Object.entries(valores)) {
    const key = PAINEL_FIELD_MAP[tag];
    if (key && isNumber(value)) out[key] = value;
  }
  for (const [key, phases] of DERIVED_AVERAGES) {
    if (key in out) continue;
    const values = phases.map((p) => out[p]);
    if (values.every(isNumber)) out[key] = (values[0] + values[1] + values[2]) / 3;
  }
  return out;
}

export type SummaryTriple = [avg: number, min: number, max: number];

/**
 * Resumo de 5 min do Painel ({ tag: [média, mín, máx] }) → campos do sistema.
 * As médias por fase também são derivadas aqui (mín/máx da média = média dos mín/máx,
 * uma aproximação suficiente para o gráfico).
 */
export function mapPainelSummary(valores: Readonly<Record<string, unknown>>): Record<string, SummaryTriple> {
  const out: Record<string, SummaryTriple> = {};
  for (const [tag, triple] of Object.entries(valores)) {
    const key = PAINEL_FIELD_MAP[tag];
    if (key && Array.isArray(triple) && triple.length === 3 && triple.every(isNumber)) {
      out[key] = [triple[0], triple[1], triple[2]];
    }
  }
  for (const [key, phases] of DERIVED_AVERAGES) {
    if (key in out) continue;
    const triples = phases.map((p) => out[p]);
    if (triples.every(Boolean)) {
      out[key] = [0, 1, 2].map((i) => (triples[0][i] + triples[1][i] + triples[2][i]) / 3) as SummaryTriple;
    }
  }
  return out;
}
