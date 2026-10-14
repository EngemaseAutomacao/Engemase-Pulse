import { describe, expect, it } from "vitest";
import { easterSunday, estimateBill, isPeakDay, nationalHolidays, periodAt, withTaxes, type Tariff } from "./tariff";

const TZ = "America/Sao_Paulo";
/** Horário de Brasília (UTC-3) → instante. */
const brt = (iso: string) => new Date(`${iso}-03:00`);

const base: Tariff = {
  modality: "GREEN",
  energyOffPeak: 0.5,
  energyPeak: 2,
  energyIntermediate: null,
  flagAdder: 0.1,
  demandPrice: 30,
  demandPeakPrice: null,
  contractedDemand: 100,
  contractedDemandPeak: null,
  peakStartHour: 18,
  peakEndHour: 21,
  taxRate: 0,
};

describe("calendário da tarifa", () => {
  it("calcula a Páscoa", () => {
    expect(easterSunday(2024)).toEqual({ month: 3, day: 31 });
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 });
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
  });

  it("inclui os feriados móveis (Carnaval, Sexta-feira Santa, Corpus Christi)", () => {
    const h = nationalHolidays(2026);
    expect(h.has("02-17")).toBe(true);
    expect(h.has("04-03")).toBe(true);
    expect(h.has("06-04")).toBe(true);
    expect(h.has("11-20")).toBe(true);
  });

  it("ponta só em dia útil", () => {
    expect(isPeakDay(2026, 10, 14)).toBe(true); // quarta
    expect(isPeakDay(2026, 10, 12)).toBe(false); // Nossa Senhora Aparecida
    expect(isPeakDay(2026, 10, 17)).toBe(false); // sábado
  });
});

describe("posto tarifário", () => {
  it("verde: ponta das 18 às 21 em dia útil", () => {
    expect(periodAt(brt("2026-10-14T18:30"), TZ, base)).toBe("peak");
    expect(periodAt(brt("2026-10-14T21:00"), TZ, base)).toBe("offPeak");
    expect(periodAt(brt("2026-10-12T19:00"), TZ, base)).toBe("offPeak");
    expect(periodAt(brt("2026-10-17T19:00"), TZ, base)).toBe("offPeak");
  });

  it("branca: intermediário uma hora antes e uma depois", () => {
    const white = { ...base, modality: "WHITE" as const };
    expect(periodAt(brt("2026-10-14T17:30"), TZ, white)).toBe("intermediate");
    expect(periodAt(brt("2026-10-14T21:15"), TZ, white)).toBe("intermediate");
    expect(periodAt(brt("2026-10-14T22:00"), TZ, white)).toBe("offPeak");
  });

  it("convencional: sempre o preço único", () => {
    expect(periodAt(brt("2026-10-14T19:00"), TZ, { ...base, modality: "CONVENTIONAL" })).toBe("offPeak");
  });
});

describe("fatura estimada", () => {
  const input = {
    tariff: base,
    timeZone: TZ,
    hours: [
      { hour: brt("2026-10-14T19:00").getTime(), kwh: 10, powerFactor: 0.95 },
      { hour: brt("2026-10-14T10:00").getTime(), kwh: 20, powerFactor: 0.8 },
    ],
    demandWindows: [
      { start: brt("2026-10-14T10:00").getTime(), kw: 110 },
      { start: brt("2026-10-14T19:00").getTime(), kw: 90 },
    ],
    start: brt("2026-10-01T00:00"),
    stop: brt("2026-11-01T00:00"),
    now: brt("2026-11-01T00:00"),
  };

  it("energia por posto, demanda faturada, ultrapassagem e reativo", () => {
    const bill = estimateBill(input);
    expect(bill.energy).toEqual([
      { period: "peak", kwh: 10, price: 2.1, cost: 21 },
      { period: "offPeak", kwh: 20, price: 0.6, cost: 12 },
    ]);
    const [demand] = bill.demand;
    expect(demand.measured).toBe(110);
    expect(demand.billed).toBe(110);
    expect(demand.cost).toBe(3300);
    expect(demand.overrun).toBe(10);
    expect(demand.overrunCost).toBe(600); // 10 kW × R$ 30 × 2
    expect(bill.reactive?.kvarh).toBeCloseTo(3); // 20 × (0,92/0,8 − 1)
    expect(bill.reactive?.cost).toBeCloseTo(1.5);
    expect(bill.total).toBeCloseTo(3934.5);
    expect(bill.projection).toBeNull(); // mês fechado
  });

  it("até 5 % acima da contratada não é ultrapassagem", () => {
    const bill = estimateBill({ ...input, demandWindows: [{ start: input.demandWindows[0].start, kw: 105 }] });
    expect(bill.demand[0].overrun).toBe(0);
    expect(bill.demand[0].billed).toBe(105);
  });

  it("abaixo da contratada paga a contratada", () => {
    const bill = estimateBill({ ...input, demandWindows: [{ start: input.demandWindows[0].start, kw: 60 }] });
    expect(bill.demand[0].billed).toBe(100);
  });

  it("impostos por dentro e projeção do mês em andamento", () => {
    expect(withTaxes(75, 25)).toBe(100);
    const bill = estimateBill({ ...input, tariff: { ...base, taxRate: 25 }, now: brt("2026-10-16T12:00") });
    expect(bill.total).toBeCloseTo(3934.5 / 0.75);
    // Só 2 horas com leitura: projeta por elas, não pelos 15 dias corridos.
    expect(bill.projection?.elapsed).toBeCloseTo(2 / (31 * 24), 5);
    expect(bill.projection!.total).toBeGreaterThan(bill.total);
  });

  it("azul cobra demanda de ponta e fora ponta separadas", () => {
    const blue: Tariff = { ...base, modality: "BLUE", demandPeakPrice: 60, contractedDemandPeak: 80 };
    const bill = estimateBill({ ...input, tariff: blue });
    const peak = bill.demand.find((d) => d.period === "peak")!;
    const off = bill.demand.find((d) => d.period === "offPeak")!;
    expect(peak.measured).toBe(90);
    expect(peak.overrun).toBe(10); // 90 > 84
    expect(off.measured).toBe(110);
  });

  it("grupo B não tem demanda nem reativo", () => {
    const bill = estimateBill({ ...input, tariff: { ...base, modality: "CONVENTIONAL" } });
    expect(bill.demand).toEqual([]);
    expect(bill.reactive).toBeNull();
    expect(bill.energy).toHaveLength(1);
    expect(bill.total).toBeCloseTo(30 * 0.6);
  });
});
