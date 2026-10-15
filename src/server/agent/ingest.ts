import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AgentPayload } from "@/lib/agent-payload";
import { mapPainelSummary, mapPainelValues } from "@/lib/painel-fields";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";
import { reportCaught } from "@/server/errors";
import type { Reading } from "@/server/telemetry/types";
import { syncClosedPainelAlarms, syncPainelAlarms, type AlarmSyncResult } from "./alarms";
import { writeAgentLive } from "./live-store";
import { ensureAgentMeters, isEnergyEquipment, loadAgentMeterIndex, type MeterIndex } from "./meters";
import type { AgentSite } from "./token";
import {
  ensureUtilityEquipment,
  loadUtilityIndex,
  syncDeclaredModules,
  upsertGeneratorRuns,
  upsertUtilityReadings,
  utilityLiveReadings,
} from "./utilities";

export type IngestResult = {
  /** Medidores com leitura atual neste envio. */
  leituras: number;
  /** Reservatórios e geradores com leitura atual neste envio. */
  leituras_modulos: number;
  resumo_5min: number;
  consumo_horario: number;
  gerador_corridas: number;
  /** Linhas de equipamentos desconhecidos (nem medidor, nem água, nem gerador). */
  ignorados: number;
  /** Só quando o envio traz a lista de alarmes. */
  alarmes?: AlarmSyncResult | { erro: string };
  alarmes_encerrados?: { registrados: number; atualizados: number } | { erro: string };
};

/** O "visto por último" vai para o banco no máximo uma vez por minuto. */
const SEEN_THROTTLE_MS = 60_000;

export async function ingestAgentPayload(site: AgentSite, payload: AgentPayload): Promise<IngestResult> {
  const result: IngestResult = {
    leituras: 0,
    leituras_modulos: 0,
    resumo_5min: 0,
    consumo_horario: 0,
    gerador_corridas: 0,
    ignorados: 0,
  };
  const receivedAt = Date.now();

  const [index, utilities] = await Promise.all([
    payload.equipamentos ? ensureAgentMeters(site, payload.equipamentos) : loadAgentMeterIndex(site.id),
    payload.equipamentos ? ensureUtilityEquipment(site, payload.equipamentos) : loadUtilityIndex(site.id),
    syncDeclaredModules(site, payload.agente?.modulos),
  ]);

  if (payload.equipamentos) {
    const readings = liveReadings(payload, index, receivedAt);
    const utilityReadings = utilityLiveReadings(payload, utilities, receivedAt);
    result.leituras = Object.keys(readings).length;
    result.leituras_modulos = Object.keys(utilityReadings).length;
    await writeAgentLive(site.id, {
      receivedAt: new Date(receivedAt).toISOString(),
      readings,
      utilities: utilityReadings,
    });
  }

  if (payload.resumo_5min?.length) {
    const utilityWindows = payload.resumo_5min.filter((r) => utilities[r.medidor]);
    const rows = payload.resumo_5min.flatMap((r) => {
      const meterId = index[r.medidor];
      const values = mapPainelSummary(r.valores);
      return meterId && Object.keys(values).length > 0 ? [{ meterId, ts: new Date(r.ts).toISOString(), values }] : [];
    });
    result.ignorados += payload.resumo_5min.length - rows.length - utilityWindows.length;
    const [meters, utility] = await Promise.all([upsertReadings5m(rows), upsertUtilityReadings(utilityWindows, utilities)]);
    result.resumo_5min = meters + utility;
  }

  if (payload.gerador_corridas?.length) {
    result.gerador_corridas = await upsertGeneratorRuns(payload.gerador_corridas, utilities, receivedAt - payload.ts);
  }

  if (payload.consumo_horario?.length) {
    const rows = payload.consumo_horario.flatMap((r) => {
      const meterId = index[r.medidor];
      return meterId
        ? [
            {
              meterId,
              quantity: r.grandeza === "aparente" ? "APPARENT" : "ACTIVE",
              hour: new Date(r.hora).toISOString(),
              value: r.kwh,
              source: r.fonte === "potencia" ? "POWER" : "COUNTER",
            },
          ]
        : [];
    });
    result.ignorados += payload.consumo_horario.length - rows.length;
    result.consumo_horario = await upsertEnergyHours(rows);
  }

  if (payload.alarmes) {
    // Falha nos alarmes não pode derrubar o envio das leituras (o Painel recuaria e atrasaria tudo).
    try {
      result.alarmes = await syncPainelAlarms(
        site,
        payload.alarmes,
        payload.equipamentos,
        index,
        receivedAt - payload.ts,
      );
    } catch (error) {
      reportCaught("servidor", "alarmes do Painel", error);
      result.alarmes = { erro: "Falha ao registrar os alarmes; tenta de novo no próximo envio" };
    }
  }

  if (payload.alarmes_encerrados?.length) {
    try {
      result.alarmes_encerrados = await syncClosedPainelAlarms(
        site,
        payload.alarmes_encerrados,
        index,
        receivedAt - payload.ts,
      );
    } catch (error) {
      reportCaught("servidor", "alarmes encerrados do Painel", error);
      // Erro de verdade: o Painel repete o lote (a marca dele só avança com 200).
      throw error;
    }
  }

  if (await getCache().acquire(`agent:seen:${site.id}`, SEEN_THROTTLE_MS)) {
    const agentInfo = payload.agente ? (payload.agente as Prisma.InputJsonValue) : undefined;
    await db.site.update({ where: { id: site.id }, data: { agentLastSeenAt: new Date(receivedAt), agentInfo } });
  }
  return result;
}

/**
 * Leitura atual por medidor. O horário de cada leitura é corrigido pela
 * diferença entre o relógio da loja e o do servidor (`ts` do envio x agora):
 * um mini PC com o relógio atrasado não pode fazer o medidor parecer offline.
 */
function liveReadings(payload: AgentPayload, index: MeterIndex, receivedAt: number): Record<string, Reading> {
  const skew = receivedAt - payload.ts;
  const readings: Record<string, Reading> = {};
  for (const e of payload.equipamentos ?? []) {
    const meterId = index[e.id];
    if (!meterId || !isEnergyEquipment(e)) continue;
    const readAt = e.lido_em ?? (e.online ? payload.ts : null);
    readings[meterId] = {
      time: readAt === null ? null : new Date(readAt + skew).toISOString(),
      values: mapPainelValues(e.valores),
    };
  }
  return readings;
}

/** Uma linha por chave (a última vence): o mesmo lote não pode atualizar uma linha duas vezes. */
function lastByKey<T>(rows: T[], key: (row: T) => string): T[] {
  return [...new Map(rows.map((r) => [key(r), r])).values()];
}

type Reading5mRow = { meterId: string; ts: string; values: Record<string, unknown> };

async function upsertReadings5m(input: Reading5mRow[]): Promise<number> {
  const rows = lastByKey(input, (r) => `${r.meterId}|${r.ts}`);
  if (rows.length === 0) return 0;
  // Colunas "timestamp" guardam UTC: a string ISO com "Z" vira o horário UTC ao converter.
  return db.$executeRaw`
    INSERT INTO meter_readings_5m (meter_id, ts, "values")
    SELECT x.m, x.t::timestamp, x.v::jsonb
    FROM unnest(${rows.map((r) => r.meterId)}::uuid[], ${rows.map((r) => r.ts)}::text[], ${rows.map((r) => JSON.stringify(r.values))}::text[]) AS x(m, t, v)
    -- medidor apagado na administração (e ainda no índice em cache): a linha é descartada
    WHERE EXISTS (SELECT 1 FROM meters WHERE meters.id = x.m)
    ON CONFLICT (meter_id, ts) DO UPDATE SET "values" = EXCLUDED."values"`;
}

type EnergyRow = { meterId: string; quantity: string; hour: string; value: number; source: string };

async function upsertEnergyHours(input: EnergyRow[]): Promise<number> {
  const rows = lastByKey(input, (r) => `${r.meterId}|${r.quantity}|${r.hour}`);
  if (rows.length === 0) return 0;
  return db.$executeRaw`
    INSERT INTO meter_energy_hours (meter_id, quantity, hour, value, source)
    SELECT x.m, x.q::"EnergyQuantity", x.h::timestamp, x.v, x.s::"EnergySource"
    FROM unnest(
      ${rows.map((r) => r.meterId)}::uuid[],
      ${rows.map((r) => r.quantity)}::text[],
      ${rows.map((r) => r.hour)}::text[],
      ${rows.map((r) => r.value)}::float8[],
      ${rows.map((r) => r.source)}::text[]
    ) AS x(m, q, h, v, s)
    WHERE EXISTS (SELECT 1 FROM meters WHERE meters.id = x.m)
    ON CONFLICT (meter_id, quantity, hour) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source`;
}
