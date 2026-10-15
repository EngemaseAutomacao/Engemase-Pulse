import { describe, expect, it } from "vitest";
import {
  PREVIOUS_SUFFIX,
  axisDecimals,
  historyLimits,
  mergeHistoryRows,
  penStats,
  previousWindow,
  relativeChange,
  valueExtent,
} from "./history-stats";

const MIN5 = 300_000;

describe("previousWindow", () => {
  it("volta exatamente um período quando ele é múltiplo da janela", () => {
    expect(previousWindow(86_400_000, 2 * 86_400_000, MIN5)).toEqual({ from: 0, to: 86_400_000, shift: 86_400_000 });
  });

  it("arredonda o deslocamento para cima, em janelas inteiras", () => {
    const w = previousWindow(0, 7 * 60_000, MIN5);
    expect(w.shift).toBe(2 * MIN5);
    expect(w.to - w.from).toBe(7 * 60_000);
  });
});

describe("mergeHistoryRows", () => {
  it("junta os campos por instante e encaixa o período anterior na mesma grade", () => {
    const rows = mergeHistoryRows(
      { kW1: [[MIN5, 10], [2 * MIN5, 12]] },
      // Anterior deslocado com sobra de 1 s (ex.: consulta de 1 min atrás): cai no mesmo instante.
      { series: { kW1: [[-86_400_000 + MIN5, 8]] }, offset: 86_400_000 + 1_000, everyMs: MIN5 },
    );
    expect(rows).toEqual([
      { t: MIN5, kW1: 10, [`kW1${PREVIOUS_SUFFIX}`]: 8 },
      { t: 2 * MIN5, kW1: 12 },
    ]);
  });
});

describe("penStats", () => {
  it("mínimo, média, máximo e último, ignorando instantes sem a pena", () => {
    const stats = penStats(
      [
        { t: 1, kW1: 5 },
        { t: 2, kW2: 100 },
        { t: 3, kW1: 1 },
        { t: 4, kW1: 9 },
      ],
      "kW1",
    );
    expect(stats).toEqual({ min: 1, minT: 3, max: 9, maxT: 4, avg: 5, last: 9, lastT: 4, count: 3 });
  });

  it("sem dados, null", () => {
    expect(penStats([{ t: 1, kW2: 3 }], "kW1")).toBeNull();
  });
});

describe("relativeChange", () => {
  it("variação sobre a base, sem dividir por zero", () => {
    expect(relativeChange(110, 100)).toBeCloseTo(0.1);
    expect(relativeChange(-90, -100)).toBeCloseTo(0.1);
    expect(relativeChange(5, 0)).toBeNull();
  });
});

describe("historyLimits", () => {
  it("faixa normal sem repetir o mesmo limite das três fases", () => {
    const limits = historyLimits(["PF1", "PF2", "PF3", "PF_AVG"]);
    expect(limits.map((l) => l.value)).toEqual([0.92]);
  });

  it("disjuntor só nas correntes e sem esticar o eixo", () => {
    expect(historyLimits(["kW1", "Total_kW"], 400)).toEqual([]);
    const [breaker] = historyLimits(["I1", "I2", "I3", "I_AVG"], 400);
    expect(breaker).toMatchObject({ value: 400, extendAxis: false });
  });
});

describe("eixo Y", () => {
  it("mesmas casas decimais em todas as marcas, pela faixa exibida", () => {
    expect(axisDecimals([4, 12])).toBe(0);
    expect(axisDecimals([0, 60])).toBe(0);
    expect(axisDecimals([0.81, 0.99])).toBe(2);
    expect(axisDecimals([59.95, 60.05])).toBe(2);
    expect(axisDecimals([220, 220])).toBe(0);
    expect(axisDecimals(null)).toBe(1);
  });

  it("faixa considera só as colunas pedidas", () => {
    expect(valueExtent([{ t: 1, a: 3, b: 100 }, { t: 2, a: -1 }], ["a"])).toEqual([-1, 3]);
    expect(valueExtent([{ t: 1, b: 1 }], ["a"])).toBeNull();
  });
});
