import { describe, expect, it } from "vitest";
import { alarmRuleSchema, isValidCnpj, loginSchema, siteSchema, tenantSchema } from "./validation";

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
