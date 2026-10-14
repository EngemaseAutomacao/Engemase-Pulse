import { describe, expect, it } from "vitest";
import { alarmRuleSchema, isValidCnpj, loginSchema, siteSchema, tariffSchema, tenantSchema } from "./validation";

const TENANT = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("CNPJ", () => {
  it("valida dígitos verificadores", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false);
  });
});

describe("tenantSchema", () => {
  const base = { name: "Acme", slug: "acme", primaryColor: "#5CBDB9", accentColor: "#38bdf8" };

  it("normaliza cor, CNPJ e checkbox", () => {
    const parsed = tenantSchema.parse({ ...base, document: "11.222.333/0001-81", active: "on" });
    expect(parsed).toMatchObject({ primaryColor: "#5cbdb9", document: "11222333000181", active: true });
    expect(tenantSchema.parse(base).active).toBe(false);
  });

  it("rejeita slug inválido", () => {
    expect(tenantSchema.safeParse({ ...base, slug: "Acme Ltda" }).success).toBe(false);
    expect(tenantSchema.safeParse({ ...base, slug: "-acme" }).success).toBe(false);
  });
});

describe("siteSchema", () => {
  const base = { tenantId: TENANT, name: "Matriz", timezone: "America/Sao_Paulo" };

  it("normaliza a UF e rejeita fuso inexistente", () => {
    expect(siteSchema.parse({ ...base, state: "sc" }).state).toBe("SC");
    expect(siteSchema.safeParse({ ...base, timezone: "Lua/Base" }).success).toBe(false);
    expect(siteSchema.safeParse({ ...base, state: "Santa Catarina" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("só aceita destino interno no ?next=", () => {
    const parse = (next: string) => loginSchema.parse({ email: "A@B.COM", password: "x", next }).next;
    expect(parse("/app/acme")).toBe("/app/acme");
    expect(parse("//evil.com")).toBeNull();
    expect(parse("https://evil.com")).toBeNull();
    expect(loginSchema.parse({ email: " A@B.COM ", password: "x" }).email).toBe("a@b.com");
  });
});

describe("alarmRuleSchema", () => {
  it("limpa campo e comparação em regras de comunicação", () => {
    const parsed = alarmRuleSchema.parse({
      name: "Sem comunicação",
      kind: "OFFLINE",
      field: "Total_kW",
      comparison: "ABOVE",
      threshold: "10",
      severity: "WARNING",
      meterId: "",
    });
    expect(parsed).toMatchObject({ field: null, comparison: null, threshold: 10, meterId: null });
  });

  it("exige grandeza válida em regras de limite", () => {
    const result = alarmRuleSchema.safeParse({
      name: "X",
      kind: "THRESHOLD",
      field: "Inexistente",
      comparison: "ABOVE",
      threshold: "1",
      severity: "INFO",
    });
    expect(result.success).toBe(false);
  });
});

describe("tariffSchema", () => {
  const green = {
    modality: "GREEN",
    energyOffPeak: "0,52",
    energyPeak: "2,1",
    energyIntermediate: "9",
    flagAdder: "",
    demandPrice: "32.40",
    demandPeakPrice: "",
    contractedDemand: "1.200",
    contractedDemandPeak: "",
    peakStartHour: "18",
    peakEndHour: "21",
    taxRate: "",
  };

  it("aceita vírgula ou ponto e limpa campos de outras modalidades", () => {
    const parsed = tariffSchema.parse(green);
    expect(parsed.energyOffPeak).toBe(0.52);
    expect(parsed.demandPrice).toBe(32.4);
    expect(parsed.contractedDemand).toBe(1200); // em kW, "1.200" é milhar
    expect(parsed.energyIntermediate).toBeNull(); // só na branca
    expect(parsed.flagAdder).toBe(0);
    expect(parsed.taxRate).toBe(0);
  });

  it("milhar com vírgula decimal", () => {
    expect(tariffSchema.parse({ ...green, contractedDemand: "1.200,5" }).contractedDemand).toBe(1200.5);
  });

  it("exige demanda contratada na verde e na azul", () => {
    const result = tariffSchema.safeParse({ ...green, contractedDemand: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["contractedDemand"]);
    expect(tariffSchema.safeParse({ ...green, modality: "BLUE" }).success).toBe(false);
  });

  it("convencional só precisa do preço do kWh", () => {
    const parsed = tariffSchema.parse({ ...green, modality: "CONVENTIONAL", energyPeak: "", demandPrice: "" });
    expect(parsed.energyPeak).toBeNull();
    expect(parsed.contractedDemand).toBeNull();
  });

  it("recusa texto e ponta invertida", () => {
    expect(tariffSchema.safeParse({ ...green, energyOffPeak: "abc" }).success).toBe(false);
    expect(tariffSchema.safeParse({ ...green, peakStartHour: "21", peakEndHour: "18" }).success).toBe(false);
  });
});
