import { describe, expect, it } from "vitest";
import { toCsv } from "./csv-export";

describe("toCsv", () => {
  it("usa padrão do Excel em português: BOM, ponto e vírgula e vírgula decimal", () => {
    const t = Date.parse("2026-10-13T15:00:00Z");
    const csv = toCsv(["Data/hora", "Potência (kW)", "Corrente; L1 (A)"], { Total_kW: [[t, 12.5]], I1: [] }, ["Total_kW", "I1"], "America/Sao_Paulo");
    const [header, row] = csv.replace("﻿", "").trim().split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(header).toBe('Data/hora;Potência (kW);"Corrente; L1 (A)"');
    expect(row).toBe("13/10/2026, 12:00:00;12,5;");
  });
});
