import { describe, expect, it } from "vitest";
import { zonedTimeToUtc } from "@/lib/tz";
import {
  energyPowerFactor,
  formatSpan,
  reportHref,
  topDemandWindows,
  weekStartsOf,
  weeklyCoverage,
} from "./reports";

const TZ = "America/Sao_Paulo";
const DAY = 86_400_000;

describe("relatórios", () => {
  it("endereço leva o mês e a unidade (o comparativo não tem unidade)", () => {
    expect(reportHref("viza", "gerador", "2026-10", "abc")).toBe("/relatorio/viza/gerador?mes=2026-10&unidade=abc");
    expect(reportHref("viza", "energia", "2026-10", "abc")).toBe("/relatorio/viza?mes=2026-10&unidade=abc");
    expect(reportHref("viza", "unidades", "2026-10", "abc")).toBe("/relatorio/viza/unidades?mes=2026-10");
  });

  it("semanas de segunda a domingo que tocam o mês, no fuso da unidade", () => {
    // outubro de 2026 começa numa quinta: a 1ª semana começa na segunda, 28/09
    const start = zonedTimeToUtc(2026, 10, 1, 0, TZ);
    const stop = zonedTimeToUtc(2026, 11, 1, 0, TZ);
    const weeks = weekStartsOf(start, stop, TZ);
    expect(weeks[0]).toBe(zonedTimeToUtc(2026, 9, 28, 0, TZ).getTime());
    expect(weeks.at(-1)).toBe(zonedTimeToUtc(2026, 10, 26, 0, TZ).getTime());
    expect(weeks).toHaveLength(5);
  });

  it("semana com partida que assumiu; a que falhou não conta; a em andamento não é atraso", () => {
    const w0 = zonedTimeToUtc(2026, 9, 28, 0, TZ).getTime();
    const weeks = [w0, w0 + 7 * DAY, w0 + 14 * DAY];
    const cov = weeklyCoverage(
      weeks,
      [
        { startedAt: w0 + DAY, ok: true },
        { startedAt: w0 + 8 * DAY, ok: false },
      ],
      w0 + 15 * DAY,
    );
    expect(cov.map((c) => [c.ok, c.open])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  it("maiores picos: um por dia, do maior para o menor", () => {
    const top = topDemandWindows(
      [
        { start: 1, kw: 80, day: 0 },
        { start: 2, kw: 95, day: 0 },
        { start: 3, kw: 90, day: 1 },
        { start: 4, kw: 40, day: 2 },
      ],
      2,
    );
    expect(top.map((w) => w.start)).toEqual([2, 3]);
  });

  it("fator de potência pela energia e duração legível", () => {
    expect(energyPowerFactor(920, 1000)).toBeCloseTo(0.92);
    expect(energyPowerFactor(0, 1000)).toBeNull();
    expect(energyPowerFactor(1010, 1000)).toBe(1);
    expect(formatSpan(45 * 60_000)).toBe("45 min");
    expect(formatSpan(190 * 60_000)).toBe("3 h 10 min");
    expect(formatSpan(3 * DAY)).toBe("3 dias");
  });
});
