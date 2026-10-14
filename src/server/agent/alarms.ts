import "server-only";
import type { Severity } from "@/lib/alarms";
import type { AgentAlarm, AgentClosedAlarm, AgentEquipment } from "@/lib/agent-payload";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";
import { RENOTIFY_AFTER_MS, pushAlarms } from "@/server/alarms/notify";
import type { MeterIndex } from "./meters";
import type { AgentSite } from "./token";

/**
 * Alarmes do Painel local na nuvem. A cada envio ao vivo o Painel manda a
 * lista inteira dos alarmes ativos; aqui ela é comparada com os abertos na
 * nuvem: abre os novos (e notifica), fecha os que sumiram da lista e marca os
 * reconhecidos na loja. Por ser a lista inteira, uma queda de internet se
 * resolve sozinha no próximo envio.
 *
 * Os limites, o atraso de confirmação e a banda morta são os do Painel: a
 * nuvem não reavalia nada, só espelha.
 */

const SEVERITY_BY_PRIORITY: Record<string, Severity> = {
  alta: "CRITICAL",
  media: "WARNING",
  média: "WARNING",
  baixa: "INFO",
};

export const painelAlarmKey = (siteId: string, painelId: number) => `painel:${siteId}:${painelId}`;

/** Assinatura da última lista recebida: lista igual = nada a fazer, nenhuma consulta. */
const signatureKey = (siteId: string) => `agent:alarms:v1:${siteId}`;
/** Mesmo sem mudança, a cada 10 min confere com o banco (corrige qualquer divergência). */
const SIGNATURE_TTL_MS = 10 * 60_000;

export type AlarmSyncResult = {
  ativos: number;
  abertos: number;
  normalizados: number;
  /** Ids (do Painel) reconhecidos na nuvem: o Painel reconhece também. */
  reconhecer: number[];
};

/** Reconhecimento na nuvem: a próxima lista refaz a comparação e devolve o "reconhecer" ao Painel. */
export async function forgetPainelAlarmSignature(...siteIds: string[]): Promise<void> {
  if (siteIds.length > 0) await getCache().del(...siteIds.map(signatureKey));
}

export async function syncPainelAlarms(
  site: AgentSite,
  alarms: AgentAlarm[],
  equipment: AgentEquipment[] | undefined,
  index: MeterIndex,
  /** Diferença entre o relógio do servidor e o da loja (ms). */
  skewMs: number,
): Promise<AlarmSyncResult> {
  const cache = getCache();
  const signature = alarms
    .map((a) => `${a.id}:${a.reconhecido ? 1 : 0}`)
    .sort()
    .join(",");
  if ((await cache.get<string>(signatureKey(site.id))) === signature) {
    return { ativos: alarms.length, abertos: 0, normalizados: 0, reconhecer: [] };
  }

  const now = new Date();
  const wanted = new Map(alarms.map((a) => [painelAlarmKey(site.id, a.id), a]));
  const open = await db.alarm.findMany({
    where: { siteId: site.id, source: "PAINEL", clearedAt: null },
    select: { id: true, openKey: true, acknowledgedAt: true, acknowledgedById: true },
  });

  // Normalizados na loja: não vieram na lista.
  const toClear = open.filter((a) => !a.openKey || !wanted.has(a.openKey)).map((a) => a.id);
  if (toClear.length > 0) {
    await db.alarm.updateMany({
      where: { id: { in: toClear }, clearedAt: null },
      data: { clearedAt: now, openKey: null },
    });
  }

  // Reconhecidos na loja (o reconhecimento na nuvem não volta para o Painel).
  const toAcknowledge = open
    .filter((a) => a.openKey && wanted.get(a.openKey)?.reconhecido && !a.acknowledgedAt)
    .map((a) => a.id);
  if (toAcknowledge.length > 0) {
    await db.alarm.updateMany({ where: { id: { in: toAcknowledge } }, data: { acknowledgedAt: now } });
  }

  // Reconhecidos por alguém na nuvem e ainda não no Painel.
  const reconhecer = open.flatMap((a) => {
    const painel = a.openKey ? wanted.get(a.openKey) : undefined;
    return painel && a.acknowledgedAt && a.acknowledgedById && !painel.reconhecido ? [painel.id] : [];
  });

  const known = new Set(open.map((a) => a.openKey));
  const toOpen = alarms.filter((a) => !known.has(painelAlarmKey(site.id, a.id)));
  let opened = 0;
  if (toOpen.length > 0) {
    const info = await db.site.findUniqueOrThrow({
      where: { id: site.id },
      select: { name: true, tenant: { select: { id: true, slug: true, name: true } } },
    });
    const byId = new Map((equipment ?? []).map((e) => [e.id, e]));
    const created = await db.alarm.createManyAndReturn({
      data: toOpen.map((a) => {
        const equipmentId = a.tag.split(".")[0];
        const eq = byId.get(equipmentId);
        return {
          tenantId: site.tenantId,
          siteId: site.id,
          meterId: index[equipmentId] ?? null,
          source: "PAINEL" as const,
          severity: SEVERITY_BY_PRIORITY[a.prioridade?.toLowerCase() ?? ""] ?? "WARNING",
          title: `${eq?.tag_isa || eq?.nome || equipmentId} — ${a.mensagem}`,
          message: describe(a, eq?.nome ?? equipmentId, info.name),
          value: a.valor ?? null,
          // Início no relógio do servidor; nunca no futuro.
          startedAt: new Date(Math.min(a.inicio + skewMs, now.getTime())),
          acknowledgedAt: a.reconhecido ? now : null,
          openKey: painelAlarmKey(site.id, a.id),
          externalId: String(a.id),
        };
      }),
      // Outro envio já abriu (a chave é única): esse não volta e não notifica de novo.
      skipDuplicates: true,
      select: { severity: true, title: true, message: true, openKey: true, acknowledgedAt: true },
    });
    opened = created.length;
    await notify(site.id, info.tenant, created, now);
  }

  await cache.set(signatureKey(site.id), signature, SIGNATURE_TTL_MS);
  return { ativos: alarms.length, abertos: opened, normalizados: toClear.length, reconhecer };
}

/**
 * Alarmes encerrados no Painel (com o horário do fim). Acerta o fim dos que a
 * nuvem fechou pela lista (ela só sabe "sumiu da lista") e registra, sem
 * notificar, os que abriram e fecharam enquanto a loja estava sem internet.
 */
export async function syncClosedPainelAlarms(
  site: AgentSite,
  closed: AgentClosedAlarm[],
  index: MeterIndex,
  skewMs: number,
): Promise<{ registrados: number; atualizados: number }> {
  const now = Date.now();
  const latest = new Map(closed.map((a) => [String(a.id), a]));
  const existing = await db.alarm.findMany({
    where: { siteId: site.id, externalId: { in: [...latest.keys()] } },
    select: { id: true, externalId: true, startedAt: true, clearedAt: true, acknowledgedAt: true },
  });
  const endOf = (a: AgentClosedAlarm, startedAt: number) =>
    new Date(Math.max(startedAt, Math.min(a.fim + skewMs, now)));

  let updated = 0;
  for (const row of existing) {
    const a = latest.get(row.externalId!)!;
    const clearedAt = endOf(a, row.startedAt.getTime());
    const fixEnd = !row.clearedAt || Math.abs(row.clearedAt.getTime() - clearedAt.getTime()) > 60_000;
    const acknowledge = a.reconhecido && !row.acknowledgedAt;
    if (!fixEnd && !acknowledge) continue;
    await db.alarm.update({
      where: { id: row.id },
      data: {
        ...(fixEnd ? { clearedAt, openKey: null } : {}),
        ...(acknowledge ? { acknowledgedAt: clearedAt } : {}),
      },
    });
    updated += 1;
  }

  const known = new Set(existing.map((r) => r.externalId));
  const missing = closed.filter((a) => !known.has(String(a.id)));
  if (missing.length === 0) return { registrados: 0, atualizados: updated };

  const [info, meters] = await Promise.all([
    db.site.findUniqueOrThrow({ where: { id: site.id }, select: { name: true } }),
    db.meter.findMany({
      where: { siteId: site.id, externalId: { not: null } },
      select: { externalId: true, tag: true, name: true },
    }),
  ]);
  const meterBy = new Map(meters.map((m) => [m.externalId!, m]));
  const { count } = await db.alarm.createMany({
    data: missing.map((a) => {
      const equipmentId = a.tag.split(".")[0];
      const meter = meterBy.get(equipmentId);
      const startedAt = Math.min(a.inicio + skewMs, now);
      const clearedAt = endOf(a, startedAt);
      return {
        tenantId: site.tenantId,
        siteId: site.id,
        meterId: index[equipmentId] ?? null,
        source: "PAINEL" as const,
        severity: SEVERITY_BY_PRIORITY[a.prioridade?.toLowerCase() ?? ""] ?? "WARNING",
        title: `${meter?.tag ?? equipmentId} — ${a.mensagem}`,
        message: describe(a, meter?.name ?? equipmentId, info.name),
        value: a.valor ?? null,
        startedAt: new Date(startedAt),
        clearedAt,
        acknowledgedAt: a.reconhecido ? clearedAt : null,
        externalId: String(a.id),
      };
    }),
    skipDuplicates: true,
  });
  return { registrados: count, atualizados: updated };
}

function describe(alarm: AgentAlarm, equipmentName: string, siteName: string): string {
  const value =
    alarm.valor === null || alarm.valor === undefined
      ? null
      : alarm.valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const reading = value !== null ? `Valor ${value}${alarm.limite ? ` (limite: ${alarm.limite})` : ""}` : alarm.limite;
  return [reading, equipmentName, siteName].filter(Boolean).join(" · ");
}

/**
 * Notifica os alarmes novos, menos os já reconhecidos na loja e os que
 * fecharam há pouco com o mesmo título (alarme "pisca-pisca").
 */
async function notify(
  siteId: string,
  tenant: { id: string; slug: string; name: string },
  created: {
    severity: Severity;
    title: string;
    message: string;
    openKey: string | null;
    acknowledgedAt: Date | null;
  }[],
  now: Date,
): Promise<void> {
  const fresh = created.filter((a) => !a.acknowledgedAt);
  if (fresh.length === 0) return;
  const recent = await db.alarm.findMany({
    where: {
      siteId,
      source: "PAINEL",
      clearedAt: { gte: new Date(now.getTime() - RENOTIFY_AFTER_MS) },
      title: { in: fresh.map((a) => a.title) },
    },
    select: { title: true },
  });
  const quiet = new Set(recent.map((a) => a.title));
  await pushAlarms(
    tenant,
    fresh.filter((a) => !quiet.has(a.title)).map((a) => ({ ...a, tag: a.openKey ?? a.title })),
  );
}
