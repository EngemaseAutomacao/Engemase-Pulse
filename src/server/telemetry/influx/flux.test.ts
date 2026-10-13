import { describe, expect, it } from "vitest";
import { energyQuery, fluxDuration, fluxString, historyQuery, latestQuery, meterPredicate } from "./flux";

const meter = { id: "m1", measurement: "medidor_01", tagKey: null, tagValue: null };

describe("fluxString", () => {
  it("escapa aspas, barra invertida e interpolação", () => {
    expect(fluxString('a"b')).toBe('"a\\"b"');
    expect(fluxString("a\\b")).toBe('"a\\\\b"');
    expect(fluxString("${x}")).toBe('"\\${x}"');
  });

  it("neutraliza tentativa de injeção no measurement", () => {
    const evil = '") |> drop(columns: ["_value"]) //';
    const predicate = meterPredicate({ ...meter, measurement: evil });
    expect(predicate).toBe(`r._measurement == ${fluxString(evil)}`);
    expect(predicate).not.toContain('== "")');
  });
});

describe("fluxDuration", () => {
  it("aceita durações válidas e rejeita o resto", () => {
    expect(fluxDuration("5m")).toBe("5m");
    expect(fluxDuration("1mo")).toBe("1mo");
    expect(() => fluxDuration("5m) |> drop()")).toThrow();
    expect(() => fluxDuration("")).toThrow();
  });
});

describe("consultas", () => {
  it("inclui o filtro de tag quando configurado", () => {
    const tagged = { ...meter, tagKey: "device", tagValue: "mm01" };
    expect(meterPredicate(tagged)).toBe('r._measurement == "medidor_01" and r["device"] == "mm01"');
    expect(latestQuery("energia", [meter, tagged])).toContain('keep(columns: ["_time", "_measurement", "_field", "_value", "device"])');
  });

  it("monta o histórico com janela e campos", () => {
    const flux = historyQuery("energia", meter, ["Total_kW", "I1"], new Date("2026-10-13T00:00:00Z"), new Date("2026-10-13T06:00:00Z"), "5m");
    expect(flux).toContain('contains(value: r._field, set: ["Total_kW", "I1"])');
    expect(flux).toContain("aggregateWindow(every: 5m, fn: mean");
    expect(flux).toContain('time(v: "2026-10-13T00:00:00.000Z")');
  });

  it("calcula consumo no fuso da unidade", () => {
    const flux = energyQuery("energia", meter, "Total_net_kWh", new Date(0), new Date(1000), "1d", "America/Sao_Paulo");
    expect(flux).toContain('option location = timezone.location(name: "America/Sao_Paulo")');
    expect(flux).toContain("difference(nonNegative: true)");
  });
});
