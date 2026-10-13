import { describe, expect, it } from "vitest";
import { toReading } from "./source";

describe("toReading", () => {
  it("fica com o ponto mais recente de cada campo, mesmo com precisão variável no horário", () => {
    const reading = toReading([
      { _time: "2026-10-13T12:00:00Z", _field: "Total_kW", _value: 10 },
      { _time: "2026-10-13T12:00:00.5Z", _field: "Total_kW", _value: 11 },
      { _time: "2026-10-13T11:59:00Z", _field: "I1", _value: 5 },
    ]);
    expect(reading.values).toEqual({ Total_kW: 11, I1: 5 });
    expect(reading.time).toBe("2026-10-13T12:00:00.500Z");
  });

  it("sem linhas, não tem horário", () => {
    expect(toReading([])).toEqual({ time: null, values: {} });
  });
});

describe("windowMs", () => {
  it("converte janelas Flux em milissegundos", async () => {
    const { windowMs } = await import("./source");
    expect(windowMs("5m")).toBe(300_000);
    expect(windowMs("2h")).toBe(7_200_000);
    expect(windowMs("1d")).toBe(86_400_000);
    expect(windowMs("1mo")).toBe(0);
  });
});
