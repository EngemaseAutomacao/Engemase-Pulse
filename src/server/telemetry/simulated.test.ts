import { describe, expect, it } from "vitest";
import { resolveEnergyPeriod } from "@/lib/time-range";
import { SimulatedSource } from "./simulated";

const source = new SimulatedSource();
const meter = { id: "meter-1", measurement: "medidor_01", tagKey: null, tagValue: null };

describe("SimulatedSource", () => {
  it("gera todos os campos com valores coerentes", async () => {
    const reading = (await source.latest([meter])).get(meter.id)!;
    const v = reading.values;
    expect(v.Total_kW).toBeGreaterThan(0);
    expect(v.Total_kVA).toBeGreaterThanOrEqual(v.Total_kW);
    expect(v.PF_AVG).toBeGreaterThan(0.8);
    expect(v.PF_AVG).toBeLessThan(1);
    expect(v.Frequencia).toBeCloseTo(60, 0);
    expect(Math.abs(v.Total_kW - (v.kW1 + v.kW2 + v.kW3))).toBeLessThan(1e-6);
  });

  it("é determinístico para o mesmo medidor e instante", async () => {
    const query = { fields: ["Total_kW"], start: new Date("2026-10-01T00:00:00Z"), stop: new Date("2026-10-01T01:00:00Z"), every: "5m" };
    expect(await source.history(meter, query)).toEqual(await source.history(meter, query));
  });

  it("consumo por hora é positivo e bate com o contador de energia", async () => {
    const window = resolveEnergyPeriod("7d", new Date("2026-10-10T12:00:00Z"), "America/Sao_Paulo");
    const buckets = await source.energy(meter, window);
    expect(buckets.length).toBe(7);
    expect(buckets.every((b) => b.kwh > 0)).toBe(true);
  });
});
