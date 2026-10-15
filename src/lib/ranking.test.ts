import { describe, expect, it } from "vitest";
import { metricValue, rankStores, type StoreRank } from "./ranking";

const store = (over: Partial<StoreRank>): StoreRank => ({
  siteId: over.siteName ?? "x",
  siteName: "Loja",
  areaM2: null,
  kwh: 0,
  kwhPrevious: null,
  cost: null,
  costProjected: null,
  powerFactor: null,
  maxDemand: null,
  contracted: null,
  hasTariff: false,
  noMainMeter: false,
  ...over,
});

describe("ranking de lojas", () => {
  it("kWh/m² ordena da mais eficiente para a menos; sem área vai para o fim", () => {
    const stores = [
      store({ siteName: "A", kwh: 30_000, areaM2: 1000 }),
      store({ siteName: "B", kwh: 20_000, areaM2: 1000 }),
      store({ siteName: "C", kwh: 5_000 }),
    ];
    expect(rankStores(stores, "kwhPerM2").map((s) => s.siteName)).toEqual(["B", "A", "C"]);
  });

  it("fator de potência: maior é melhor; variação e demanda em %", () => {
    expect(rankStores([store({ siteName: "A", powerFactor: 0.9 }), store({ siteName: "B", powerFactor: 0.97 })], "powerFactor")[0].siteName).toBe("B");
    expect(metricValue(store({ kwh: 110, kwhPrevious: 100 }), "change")).toBeCloseTo(10);
    expect(metricValue(store({ maxDemand: 90, contracted: 100 }), "demandRatio")).toBeCloseTo(90);
  });
});
