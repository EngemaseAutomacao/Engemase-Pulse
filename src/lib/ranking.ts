/** Comparação entre as lojas do cliente num mês (resposta de /api/tenants/<slug>/ranking). */

export type StoreRank = {
  siteId: string;
  siteName: string;
  areaM2: number | null;
  /** kWh da entrada no mês (até agora, se o mês está em andamento). */
  kwh: number;
  /** Mesmo trecho do mês anterior. */
  kwhPrevious: number | null;
  /** R$ com impostos pela fatura estimada (até agora); null sem tarifa. */
  cost: number | null;
  costProjected: number | null;
  powerFactor: number | null;
  maxDemand: number | null;
  contracted: number | null;
  hasTariff: boolean;
  noMainMeter: boolean;
};

export type RankingResponse = { month: string; partial: boolean; stores: StoreRank[] };

export type RankMetric = "kwhPerM2" | "kwh" | "cost" | "costPerM2" | "change" | "powerFactor" | "demandRatio";

export const RANK_METRICS: { id: RankMetric; label: string; unit: string; digits: number; lowerIsBetter: boolean }[] = [
  { id: "kwhPerM2", label: "kWh por m²", unit: "kWh/m²", digits: 1, lowerIsBetter: true },
  { id: "kwh", label: "Consumo", unit: "kWh", digits: 0, lowerIsBetter: true },
  { id: "cost", label: "Custo", unit: "R$", digits: 0, lowerIsBetter: true },
  { id: "costPerM2", label: "R$ por m²", unit: "R$/m²", digits: 2, lowerIsBetter: true },
  { id: "change", label: "Variação x mês anterior", unit: "%", digits: 1, lowerIsBetter: true },
  { id: "powerFactor", label: "Fator de potência", unit: "", digits: 3, lowerIsBetter: false },
  { id: "demandRatio", label: "Demanda / contratada", unit: "%", digits: 0, lowerIsBetter: true },
];

export function metricValue(store: StoreRank, metric: RankMetric): number | null {
  switch (metric) {
    case "kwh":
      return store.kwh;
    case "kwhPerM2":
      return store.areaM2 ? store.kwh / store.areaM2 : null;
    case "cost":
      return store.cost;
    case "costPerM2":
      return store.cost !== null && store.areaM2 ? store.cost / store.areaM2 : null;
    case "change":
      return store.kwhPrevious ? ((store.kwh - store.kwhPrevious) / store.kwhPrevious) * 100 : null;
    case "powerFactor":
      return store.powerFactor;
    case "demandRatio":
      return store.maxDemand !== null && store.contracted ? (store.maxDemand / store.contracted) * 100 : null;
  }
}

/** Lojas na ordem do indicador (a melhor primeiro); sem valor vão para o fim. */
export function rankStores(stores: StoreRank[], metric: RankMetric): StoreRank[] {
  const def = RANK_METRICS.find((m) => m.id === metric)!;
  return [...stores].sort((a, b) => {
    const va = metricValue(a, metric);
    const vb = metricValue(b, metric);
    if (va === null) return vb === null ? a.siteName.localeCompare(b.siteName, "pt-BR") : 1;
    if (vb === null) return -1;
    return def.lowerIsBetter ? va - vb : vb - va;
  });
}
