import { describe, expect, it } from "vitest";
import { breakerLoad } from "./breaker";

describe("breakerLoad", () => {
  it("usa a fase mais carregada", () => {
    const load = breakerLoad({ I1: 290, I2: 315, I3: 300, I_AVG: 301.7 }, 630);
    expect(load).toMatchObject({ phase: "L2", amps: 315, ratio: 0.5, level: "normal" });
  });

  it("cai para a corrente média quando não há corrente por fase", () => {
    expect(breakerLoad({ I_AVG: 170 }, 200)).toMatchObject({ phase: null, amps: 170, level: "high" });
  });

  it("marca carga alta a partir de 80 % e acima do disjuntor depois de 100 %", () => {
    expect(breakerLoad({ I1: 79.9 }, 100)?.level).toBe("normal");
    expect(breakerLoad({ I1: 80 }, 100)?.level).toBe("high");
    expect(breakerLoad({ I1: 100 }, 100)?.level).toBe("high");
    expect(breakerLoad({ I1: 100.5 }, 100)?.level).toBe("over");
  });

  it("sem disjuntor cadastrado ou sem corrente não há carga", () => {
    expect(breakerLoad({ I1: 10 }, null)).toBeNull();
    expect(breakerLoad({ I1: 10 }, 0)).toBeNull();
    expect(breakerLoad({ Total_kW: 5 }, 100)).toBeNull();
  });
});
