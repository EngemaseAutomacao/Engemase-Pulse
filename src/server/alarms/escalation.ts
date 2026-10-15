import "server-only";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";
import { notifyEscalation } from "./notify";

/**
 * Escalonamento: alarme de Atenção ou Crítico aberto e sem reconhecimento
 * depois do prazo do cliente (Usuários → Escalonamento) avisa as pessoas
 * marcadas, uma vez por alarme.
 */

const CHECK_EVERY_MS = 60_000;

export async function checkEscalations(now = Date.now()): Promise<number> {
  if (!(await getCache().acquire("escalation-check", CHECK_EVERY_MS))) return 0;
  const tenants = await db.tenant.findMany({
    where: { active: true, escalationMinutes: { gt: 0 } },
    select: { id: true, slug: true, name: true, escalationMinutes: true },
  });

  let escalated = 0;
  for (const tenant of tenants) {
    const minutes = tenant.escalationMinutes!;
    const alarms = await db.alarm.findMany({
      where: {
        tenantId: tenant.id,
        clearedAt: null,
        acknowledgedAt: null,
        escalatedAt: null,
        severity: { in: ["WARNING", "CRITICAL"] },
        startedAt: { lt: new Date(now - minutes * 60_000) },
      },
      orderBy: { startedAt: "asc" },
      take: 20,
      select: { id: true, severity: true, title: true, message: true },
    });
    if (alarms.length === 0) continue;
    // Marca antes de avisar: duas rodadas ao mesmo tempo não mandam em dobro.
    const { count } = await db.alarm.updateMany({
      where: { id: { in: alarms.map((a) => a.id) }, escalatedAt: null },
      data: { escalatedAt: new Date(now) },
    });
    if (count === 0) continue;
    escalated += count;
    await notifyEscalation(
      tenant,
      alarms.map((a) => ({ severity: a.severity, title: a.title, message: a.message, tag: a.id })),
      minutes,
    );
  }
  return escalated;
}
