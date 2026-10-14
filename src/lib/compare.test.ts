import { describe, expect, it } from "vitest";
import { compareHistoryWindow, compareSearch, parseCompareSearch } from "./compare";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";
const allowed = new Set([A, B, C, D]);

describe("parseCompareSearch", () => {
  it("usa os padrões sem parâmetros", () => {
    expect(parseCompareSearch({}, allowed)).toEqual({ meterIds: [], field: "Total_kW", period: "today" });
  });

  it("descarta medidor de outro cliente, repetido ou além do limite de 3", () => {
    const outro = "99999999-9999-4999-8999-999999999999";
    const state = parseCompareSearch({ m: `${A},${outro},${A},${B},${C},${D}` }, allowed);
    expect(state.meterIds).toEqual([A, B, C]);
  });

  it("ignora grandeza e período desconhecidos", () => {
    expect(parseCompareSearch({ g: "Senha", p: "5anos" }, allowed)).toMatchObject({
      field: "Total_kW",
      period: "today",
    });
    expect(parseCompareSearch({ g: "I_AVG", p: "30d" }, allowed)).toMatchObject({ field: "I_AVG", period: "30d" });
  });

  it("monta a URL de volta, omitindo os padrões", () => {
    expect(compareSearch({ meterIds: [A, B], field: "Total_kW", period: "today" })).toBe(`?m=${A}%2C${B}`);
    expect(compareSearch({ meterIds: [], field: "PF_AVG", period: "7d" })).toBe("?g=PF_AVG&p=7d");
  });
});

describe("compareHistoryWindow", () => {
  it("hoje começa à meia-noite no fuso da unidade", () => {
    const now = new Date("2026-10-14T18:30:00Z"); // 15h30 em São Paulo
    const { from, to } = compareHistoryWindow("today", now, "America/Sao_Paulo");
    expect(from.toISOString()).toBe("2026-10-14T03:00:00.000Z");
    expect(to).toEqual(now);
  });

  it("logo depois da meia-noite mostra a última hora", () => {
    const now = new Date("2026-10-14T03:00:20Z");
    const { from } = compareHistoryWindow("today", now, "America/Sao_Paulo");
    expect(now.getTime() - from.getTime()).toBe(3_600_000);
  });

  it("12 meses cabe no limite de um ano do histórico", () => {
    const now = new Date("2026-10-31T23:00:00Z");
    const { from, to } = compareHistoryWindow("12m", now, "America/Sao_Paulo");
    expect(to.getTime() - from.getTime()).toBeLessThanOrEqual(366 * 86_400_000);
  });
});
