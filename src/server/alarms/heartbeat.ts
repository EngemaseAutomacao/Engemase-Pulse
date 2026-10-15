import "server-only";
import { db } from "@/server/db";
import { RENOTIFY_AFTER_MS, notifyAlarms } from "./notify";

/**
 * Loja sem comunicação: o Painel da unidade parou de enviar. Não precisa de
 * regra — vale para toda unidade que já enviou alguma vez. Os alarmes de
 * comunicação do próprio Painel não servem aqui: sem internet, eles não chegam.
 */

/** Sem envio há mais que isso, a loja é dada como sem comunicação. */
export const SITE_OFFLINE_AFTER_MS = 10 * 60_000;

export const siteOfflineKey = (siteId: string) => `site-offline:${siteId}`;

export type HeartbeatResult = { offline: number; opened: number; cleared: number };

export async function checkSiteHeartbeats(now = Date.now()): Promise<HeartbeatResult> {
  const [sites, open] = await Promise.all([
    db.site.findMany({
      where: { agentTokenHash: { not: null }, agentLastSeenAt: { not: null }, tenant: { active: true } },
      select: {
        id: true,
        name: true,
        tenantId: true,
        timezone: true,
        agentLastSeenAt: true,
        tenant: { select: { id: true, slug: true, name: true } },
      },
    }),
    db.alarm.findMany({
      where: { openKey: { startsWith: "site-offline:" } },
      select: { id: true, openKey: true },
    }),
  ]);
  const openByKey = new Map(open.map((a) => [a.openKey!, a.id]));
  const offline = sites.filter((s) => now - s.agentLastSeenAt!.getTime() > SITE_OFFLINE_AFTER_MS);
  const offlineKeys = new Set(offline.map((s) => siteOfflineKey(s.id)));

  // Voltou a enviar (ou deixou de ter Painel ligado): fecha.
  const toClear = open.filter((a) => !offlineKeys.has(a.openKey!)).map((a) => a.id);
  if (toClear.length > 0) {
    await db.alarm.updateMany({
      where: { id: { in: toClear }, clearedAt: null },
      data: { clearedAt: new Date(now), openKey: null },
    });
  }

  const toOpen = offline.filter((s) => !openByKey.has(siteOfflineKey(s.id)));
  if (toOpen.length === 0) return { offline: offline.length, opened: 0, cleared: toClear.length };

  const created = await db.alarm.createManyAndReturn({
    data: toOpen.map((s) => ({
      tenantId: s.tenantId,
      siteId: s.id,
      severity: "CRITICAL" as const,
      title: `Loja sem comunicação — ${s.name}`,
      message: `O Painel da loja não envia leituras desde ${s.agentLastSeenAt!.toLocaleString("pt-BR", {
        timeZone: s.timezone,
        dateStyle: "short",
        timeStyle: "short",
      })}. Verifique a internet e o mini PC da loja.`,
      startedAt: s.agentLastSeenAt!,
      openKey: siteOfflineKey(s.id),
    })),
    skipDuplicates: true,
    select: { siteId: true, severity: true, title: true, message: true, openKey: true },
  });

  // Loja que cai e volta várias vezes seguidas notifica só a primeira.
  const recent = await db.alarm.findMany({
    where: {
      siteId: { in: created.map((a) => a.siteId!) },
      title: { startsWith: "Loja sem comunicação" },
      clearedAt: { gte: new Date(now - RENOTIFY_AFTER_MS) },
    },
    select: { siteId: true },
  });
  const quiet = new Set(recent.map((a) => a.siteId));
  const bySite = new Map(toOpen.map((s) => [s.id, s]));
  await Promise.all(
    created
      .filter((a) => !quiet.has(a.siteId))
      .map((a) => notifyAlarms(bySite.get(a.siteId!)!.tenant, [{ ...a, tag: a.openKey! }])),
  );
  return { offline: offline.length, opened: created.length, cleared: toClear.length };
}
