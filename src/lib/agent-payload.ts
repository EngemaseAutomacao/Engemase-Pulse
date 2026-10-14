import { z } from "zod";

/**
 * Contrato do POST /api/ingest: o que o Painel local (supervisório da loja)
 * envia para a nuvem. Os nomes seguem os do Painel; a tradução para os campos
 * do sistema fica em `painel-fields.ts`. Versão 1.
 *
 * Um envio pode trazer qualquer combinação das três partes:
 *  - `equipamentos`: leitura atual de cada equipamento (a cada ~10 s);
 *  - `resumo_5min`: janelas de 5 min já fechadas (média, mínimo e máximo);
 *  - `consumo_horario`: consumo de cada hora fechada, com a origem do cálculo.
 */

/** 2000-01-01 a 2100-01-01, em ms: barra relógio errado e segundos no lugar de ms. */
const epochMs = z.number().int().min(946_684_800_000).max(4_102_444_800_000);
const equipmentId = z.string().trim().min(1).max(100);
const tagName = z.string().max(100);

export const agentEquipmentSchema = z.object({
  id: equipmentId,
  nome: z.string().trim().min(1).max(120),
  tag_isa: z.string().trim().max(40).nullish(),
  /** energia, agua, gerador, subestacao… Só "energia" vira medidor. */
  grupo: z.string().trim().max(40).nullish(),
  perfil: z.string().trim().max(200).nullish(),
  /** Entrada geral da instalação. */
  principal: z.boolean().nullish(),
  /** Corrente do disjuntor, em A. */
  disjuntor_a: z.number().positive().nullish(),
  /** Endereço Modbus (unit id). */
  endereco: z.number().int().min(0).max(65_535).nullish(),
  online: z.boolean(),
  /** Última leitura bem-sucedida do equipamento. */
  lido_em: epochMs.nullish(),
  valores: z.record(tagName, z.number().nullable()).default({}),
});

export const agentPayloadSchema = z.object({
  versao: z.literal(1),
  /** Quando o Painel montou o envio. */
  ts: epochMs,
  agente: z.object({ versao: z.string().max(40).nullish(), planta: z.string().max(200).nullish() }).nullish(),
  equipamentos: z.array(agentEquipmentSchema).max(200).optional(),
  resumo_5min: z
    .array(
      z.object({
        medidor: equipmentId,
        /** Início da janela. */
        ts: epochMs,
        valores: z.record(tagName, z.tuple([z.number(), z.number(), z.number()])),
      }),
    )
    .max(5_000)
    .optional(),
  consumo_horario: z
    .array(
      z.object({
        medidor: equipmentId,
        grandeza: z.enum(["ativa", "aparente"]),
        /** Início da hora. */
        hora: epochMs,
        kwh: z.number().min(0),
        fonte: z.enum(["contador", "potencia"]),
      }),
    )
    .max(5_000)
    .optional(),
});

export type AgentPayload = z.infer<typeof agentPayloadSchema>;
export type AgentEquipment = z.infer<typeof agentEquipmentSchema>;
