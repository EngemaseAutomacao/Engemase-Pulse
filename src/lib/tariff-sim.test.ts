import { describe, expect, it } from "vitest";
import { demandCost, optimalDemand, simulate, type MonthUsage, type SimPrices } from "./tariff-sim";

const month = (over: Partial<MonthUsage>): MonthUsage => ({
  month: "2026-01",
  kwhPeak: 1000,
  kwhIntermediate: 500,
  kwhOffPeak: 8500,
  demandAll: 100,
  demandPeak: 80,
  demandOffPeak: 100,
  reactiveKvarh: 0,
  coverage: 1,
  ...over,
});

const prices: SimPrices = {
  conventional: { energy: 0.8 },
  white: { peak: 1.5, intermediate: 1, offPeak: 0.6 },
  green: { energyPeak: 2, energyOffPeak: 0.5, demand: 30 },
  blue: { energyPeak: 0.7, energyOffPeak: 0.5, demandPeak: 60, demandOffPeak: 25 },
  flagAdder: 0,
  taxRate: 0,
};

describe("demanda contratada", () => {
  it("cobra a maior entre medida e contratada, e a ultrapassagem em dobro acima de 5 %", () => {
    // 100 medidos, 90 contratados: passa de 94,5 → ultrapassagem de 10 kW.
    expect(demandCost([100], 90, 10)).toBe(100 * 10 + 10 * 10 * 2);
    // 94 medidos, 90 contratados: dentro da tolerância.
    expect(demandCost([94], 90, 10)).toBe(94 * 10);
    expect(demandCost([null, 50], 90, 10)).toBe(90 * 10);
  });

  it("ideal: contratar o necessário, sem pagar ultrapassagem nem sobra", () => {
    const best = optimalDemand([100, 100, 100, 60], 10)!;
    // Abaixo de ~95 kW paga multa nos meses de 100; acima, paga sobra nos meses de 60.
    expect(best.contracted).toBeGreaterThanOrEqual(96);
    expect(best.contracted).toBeLessThanOrEqual(100);
    expect(optimalDemand([10, 12], 10)!.contracted).toBe(30); // mínimo do Grupo A
    expect(optimalDemand([null], 10)).toBeNull();
  });
});

describe("simulate", () => {
  it("convencional e branca (Grupo B)", () => {
    const months = [month({})];
    expect(simulate("CONVENTIONAL", months, prices, { single: null, peak: null, offPeak: null }).total).toBeCloseTo(
      10_000 * 0.8,
    );
    expect(simulate("WHITE", months, prices, { single: null, peak: null, offPeak: null }).total).toBeCloseTo(
      1000 * 1.5 + 500 * 1 + 8500 * 0.6,
    );
  });

  it("verde e azul com o contrato informado, reativo e impostos por dentro", () => {
    const months = [month({ reactiveKvarh: 100 })];
    const green = simulate("GREEN", months, { ...prices, taxRate: 20 }, { single: 100, peak: null, offPeak: null });
    expect(green.energy).toBeCloseTo(1000 * 2 + 9000 * 0.5);
    expect(green.demand).toBe(100 * 30);
    expect(green.reactive).toBe(100 * 0.5);
    expect(green.total).toBeCloseTo((green.energy + green.demand + green.reactive) / 0.8);

    const blue = simulate("BLUE", months, prices, { single: null, peak: 80, offPeak: 100 });
    expect(blue.demand).toBe(80 * 60 + 100 * 25);
  });

  it("aponta o que falta preencher", () => {
    const result = simulate("BLUE", [month({})], { ...prices, blue: { ...prices.blue, demandPeak: null } }, {
      single: null,
      peak: 80,
      offPeak: null,
    });
    expect(result.total).toBeNull();
    expect(result.missing).toEqual(["demanda na ponta", "demanda contratada"]);
  });
});
