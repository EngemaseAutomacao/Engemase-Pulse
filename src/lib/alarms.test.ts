import { describe, expect, it } from "vitest";
import { describeRule, evaluateRule, type RuleDefinition } from "./alarms";
import type { LiveMeter } from "./telemetry-types";

const NOW = Date.parse("2026-10-13T12:00:00Z");
const online = (values: Record<string, number>, secondsAgo = 5): LiveMeter => ({
  time: new Date(NOW - secondsAgo * 1000).toISOString(),
  status: "online",
  values,
});

const highDemand: RuleDefinition = { kind: "THRESHOLD", field: "Total_kW", comparison: "ABOVE", threshold: 300 };
const lowPf: RuleDefinition = { kind: "THRESHOLD", field: "PF_AVG", comparison: "BELOW", threshold: 0.92 };
const offline: RuleDefinition = { kind: "OFFLINE", field: null, comparison: null, threshold: 10 };

describe("evaluateRule — limite", () => {
  it("dispara acima e abaixo do limite conforme a regra", () => {
    expect(evaluateRule(highDemand, online({ Total_kW: 320 }), undefined, NOW)).toMatchObject({ state: "triggered", value: 320 });
    expect(evaluateRule(highDemand, online({ Total_kW: 250 }), undefined, NOW)).toEqual({ state: "normal" });
    expect(evaluateRule(lowPf, online({ PF_AVG: 0.85 }), undefined, NOW)).toMatchObject({ state: "triggered" });
  });

  it("não decide sem leitura recente ou sem o campo", () => {
    expect(evaluateRule(highDemand, undefined, undefined, NOW)).toEqual({ state: "unknown" });
    expect(evaluateRule(highDemand, online({ I1: 10 }), undefined, NOW)).toEqual({ state: "unknown" });
    expect(evaluateRule(highDemand, { ...online({ Total_kW: 999 }), status: "offline" }, undefined, NOW)).toEqual({
      state: "unknown",
    });
  });
});

describe("evaluateRule — sem comunicação", () => {
  it("dispara quando a última leitura passou do tempo", () => {
    expect(evaluateRule(offline, online({}, 11 * 60), undefined, NOW)).toMatchObject({ state: "triggered", value: 11 });
    expect(evaluateRule(offline, online({}, 60), undefined, NOW)).toEqual({ state: "normal" });
  });

  it("dispara sem leitura nenhuma ou com falha ao ler a unidade", () => {
    expect(evaluateRule(offline, undefined, undefined, NOW)).toMatchObject({ state: "triggered" });
    expect(evaluateRule(offline, undefined, "timeout", NOW)).toMatchObject({
      state: "triggered",
      detail: "Falha na leitura: timeout",
    });
  });
});

describe("describeRule", () => {
  it("descreve em português com unidade", () => {
    expect(describeRule(highDemand)).toBe("Potência ativa total acima de 300,0 kW");
    expect(describeRule(offline)).toBe("Sem leituras por mais de 10 min");
  });
});
