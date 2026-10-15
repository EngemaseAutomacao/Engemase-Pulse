import { describe, expect, it } from "vitest";
import { anomalyState, baselineOf, classifyHour } from "./anomaly";

describe("faixa normal", () => {
  it("mediana das semanas, sem se levar por uma semana atípica", () => {
    const b = baselineOf([10, 11, 9, 40], 10)!;
    expect(b.median).toBe(10.5);
    expect(classifyHour(12, b)).toBe("normal");
    expect(classifyHour(25, b)).toBe("high");
    expect(classifyHour(2, b)).toBe("low");
  });

  it("circuito quase parado não alarma por pouco e não tem 'abaixo do normal'", () => {
    const b = baselineOf([0.1, 0.2, 0.1], 5)!;
    expect(b.low).toBeNull();
    expect(classifyHour(0.6, b)).toBe("normal"); // piso: 10 % do típico
    expect(classifyHour(2, b)).toBe("high");
  });

  it("precisa de pelo menos 3 semanas", () => {
    expect(baselineOf([1, 2], 1)).toBeNull();
  });
});

describe("decisão com duas horas", () => {
  it("alarma só com duas horas seguidas fora, para o mesmo lado", () => {
    expect(anomalyState("high", "high")).toBe("high");
    expect(anomalyState("high", "normal")).toBeNull();
    expect(anomalyState("low", "high")).toBeNull();
    expect(anomalyState("normal", "high")).toBe("normal");
    expect(anomalyState(null, "high")).toBeNull();
  });
});
