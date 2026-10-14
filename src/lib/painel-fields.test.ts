import { describe, expect, it } from "vitest";
import { agentPayloadSchema } from "./agent-payload";
import { FIELD_BY_KEY } from "./meter-fields";
import { PAINEL_FIELD_MAP, mapPainelSummary, mapPainelValues } from "./painel-fields";

describe("mapPainelValues", () => {
  it("traduz os nomes do Painel e calcula as médias por fase", () => {
    const values = mapPainelValues({
      tensao_an: 220,
      tensao_bn: 218,
      tensao_cn: 222,
      corrente_a: 272,
      corrente_b: 250.7,
      corrente_c: 236,
      potencia_ativa: 156.62,
      fp: 0.939,
      thd_corrente: 13,
      energia_ativa: 199238,
    });
    expect(values).toMatchObject({
      V1N: 220,
      I1: 272,
      Total_kW: 156.62,
      PF_AVG: 0.939,
      THD_I1: 13,
      Total_net_kWh: 199238,
      VN_AVG: 220,
    });
    expect(values.I_AVG).toBeCloseTo(252.9, 1);
    // Sem as três tensões de linha, não inventa a média.
    expect(values).not.toHaveProperty("VLL_AVG");
  });

  it("ignora grandezas desconhecidas e valores nulos ou não numéricos", () => {
    expect(mapPainelValues({ nivel: 50, corrente_a: null, corrente_b: Number.NaN, fp: "0,9" })).toEqual({});
  });

  it("só aponta para campos que existem no sistema", () => {
    for (const key of Object.values(PAINEL_FIELD_MAP)) expect(FIELD_BY_KEY.has(key), key).toBe(true);
  });
});

describe("mapPainelSummary", () => {
  it("mantém média, mínimo e máximo e deriva a média das fases", () => {
    const summary = mapPainelSummary({
      corrente_a: [10, 8, 12],
      corrente_b: [20, 18, 22],
      corrente_c: [30, 28, 32],
      potencia_ativa: [5, 4, 6],
      nivel: [1, 1, 1],
      fp: [0.9, 0.8],
    });
    expect(summary).toEqual({
      I1: [10, 8, 12],
      I2: [20, 18, 22],
      I3: [30, 28, 32],
      I_AVG: [20, 18, 22],
      Total_kW: [5, 4, 6],
    });
  });
});

describe("agentPayloadSchema", () => {
  const now = Date.UTC(2026, 9, 14, 13, 17);

  it("aceita o envio típico do Painel", () => {
    const parsed = agentPayloadSchema.parse({
      versao: 1,
      ts: now,
      agente: { versao: "3.2.0", planta: "Viza CD — E01" },
      equipamentos: [
        {
          id: "geral",
          nome: "Entrada geral",
          tag_isa: "QGBT-01",
          grupo: "energia",
          principal: true,
          disjuntor_a: 630,
          endereco: 8,
          online: true,
          lido_em: now,
          valores: { corrente_a: 272, thd_tensao: null },
        },
      ],
      resumo_5min: [{ medidor: "geral", ts: now - 300_000, valores: { corrente_a: [270, 260, 280] } }],
      consumo_horario: [{ medidor: "geral", grandeza: "ativa", hora: now - 3_600_000, kwh: 147, fonte: "contador" }],
    });
    expect(parsed.equipamentos?.[0].valores.thd_tensao).toBeNull();
  });

  it("recusa horário em segundos, versão desconhecida e consumo negativo", () => {
    expect(agentPayloadSchema.safeParse({ versao: 1, ts: Math.floor(now / 1000) }).success).toBe(false);
    expect(agentPayloadSchema.safeParse({ versao: 2, ts: now }).success).toBe(false);
    const negative = {
      versao: 1,
      ts: now,
      consumo_horario: [{ medidor: "geral", grandeza: "ativa", hora: now, kwh: -1, fonte: "contador" }],
    };
    expect(agentPayloadSchema.safeParse(negative).success).toBe(false);
  });
});
