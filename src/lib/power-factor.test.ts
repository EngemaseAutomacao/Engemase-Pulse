import { describe, expect, it } from "vitest";
import { analyzeCapacitors, excessKvarh, powerFactorOf, requiredKvar } from "./power-factor";

describe("fator de potência", () => {
  it("kVAr que faltam para 0,92", () => {
    // 100 kW com FP 0,8 → 75 kVAr; em 0,92 cabem 42,6 kVAr → faltam ~32,4.
    expect(requiredKvar({ kw: 100, kvar: 75 })).toBeCloseTo(75 - 100 * Math.tan(Math.acos(0.92)), 5);
    expect(requiredKvar({ kw: 100, kvar: 30 })).toBe(0);
    expect(requiredKvar({ kw: 100, kvar: -50 })).toBe(0);
    expect(powerFactorOf({ kw: 100, kvar: 75 })).toBeCloseTo(0.8);
  });

  it("excedente de reativo da amostra", () => {
    expect(excessKvarh({ kw: 100, kvar: 75 }, 1)).toBeCloseTo(100 * (0.92 / 0.8 - 1));
    expect(excessKvarh({ kw: 100, kvar: 20 }, 1)).toBe(0);
  });

  it("recomenda tamanho comercial que cobre 95 % do tempo e zera o excedente", () => {
    const samples = [
      ...Array.from({ length: 95 }, () => ({ kw: 100, kvar: 75 })), // falta ~32 kVAr
      ...Array.from({ length: 5 }, () => ({ kw: 200, kvar: 200 })), // pico raro
    ];
    const a = analyzeCapacitors(samples, 1);
    expect(a.recommended).toBe(40);
    expect(a.shareBelow).toBe(1);
    expect(a.excessAfter).toBeLessThan(a.excessNow);
    expect(a.excessAfter).toBeGreaterThan(0); // o pico raro continua acima
  });

  it("sem necessidade quando o FP já é bom", () => {
    const a = analyzeCapacitors([{ kw: 100, kvar: 20 }]);
    expect(a.recommended).toBeNull();
    expect(a.excessNow).toBe(0);
  });
});
