import { describe, expect, it } from "vitest";
import { aggregationWindow, energyBucketStarts, resolveEnergyPeriod, resolveHistoryRange } from "./time-range";
import { addZoned, startOfZoned } from "./tz";

const SP = "America/Sao_Paulo";

describe("fuso horário", () => {
  it("início do dia em São Paulo (UTC−3) é 03:00 UTC", () => {
    const start = startOfZoned("day", new Date("2026-10-13T15:30:00Z"), SP);
    expect(start.toISOString()).toBe("2026-10-13T03:00:00.000Z");
  });

  it("logo após a meia-noite UTC ainda é o dia anterior em São Paulo", () => {
    const start = startOfZoned("day", new Date("2026-10-14T01:00:00Z"), SP);
    expect(start.toISOString()).toBe("2026-10-13T03:00:00.000Z");
  });

  it("soma meses atravessando o ano", () => {
    const month = startOfZoned("month", new Date("2026-12-20T12:00:00Z"), SP);
    expect(addZoned("month", month, 1, SP).toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
});

describe("períodos", () => {
  it("histórico de 24 h usa janelas que mantêm o gráfico leve", () => {
    const range = resolveHistoryRange("24h", new Date("2026-10-13T12:00:00Z"));
    expect(range.every).toBe("5m");
    expect((range.stop.getTime() - range.start.getTime()) / range.everyMs).toBeLessThanOrEqual(360);
  });

  it("escolhe a menor janela com até 360 pontos", () => {
    expect(aggregationWindow(3_600_000).every).toBe("5m");
    expect(aggregationWindow(30 * 86_400_000).every).toBe("2h");
    expect(aggregationWindow(31 * 86_400_000).every).toBe("3h");
  });

  it("consumo de hoje tem 24 barras horárias", () => {
    const window = resolveEnergyPeriod("today", new Date("2026-10-13T15:00:00Z"), SP);
    expect(energyBucketStarts(window)).toHaveLength(24);
    expect(window.start.toISOString()).toBe("2026-10-13T03:00:00.000Z");
  });

  it("30 dias e 12 meses têm o número certo de barras", () => {
    const now = new Date("2026-10-13T15:00:00Z");
    expect(energyBucketStarts(resolveEnergyPeriod("30d", now, SP))).toHaveLength(30);
    expect(energyBucketStarts(resolveEnergyPeriod("12m", now, SP))).toHaveLength(12);
  });
});
