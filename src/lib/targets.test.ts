import { describe, expect, it } from "vitest";
import { projectMonth, targetStatus } from "./targets";

describe("metas", () => {
  it("projeta pelo que foi medido até agora", () => {
    // 10 dias de 30, 1.000 kWh → 3.000 kWh.
    expect(projectMonth(1000, 240, 240, 720)).toBe(3000);
    // Faltaram 2 dias de leitura: projeta pelas 192 h medidas.
    expect(projectMonth(800, 192, 240, 720)).toBe(3000);
    expect(projectMonth(0, 0, 0, 720)).toBeNull();
    expect(projectMonth(3100, 700, 720, 720)).toBe(3100); // mês fechado
  });

  it("situação contra a meta", () => {
    expect(targetStatus(3000, 4000)).toBe("ok");
    expect(targetStatus(3700, 4000)).toBe("near");
    expect(targetStatus(4100, 4000)).toBe("over");
    expect(targetStatus(4100, null)).toBe("none");
    expect(targetStatus(null, 4000)).toBe("none");
  });
});
