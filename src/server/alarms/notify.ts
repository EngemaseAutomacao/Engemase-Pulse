import "server-only";
import { PUSH_MIN_SEVERITY, SEVERITY_LABEL, SEVERITY_RANK, type Severity } from "@/lib/alarms";
import { db } from "@/server/db";
import { sendPushToUsers } from "@/server/push";

/** Se o mesmo alarme fechou há menos que isso, reabrir não notifica de novo (evita "pisca-pisca"). */
export const RENOTIFY_AFTER_MS = 15 * 60_000;

export type AlarmNotice = {
  severity: Severity;
  title: string;
  message: string;
  /** Mesma tag = a notificação nova substitui a anterior no aparelho. */
  tag: string;
};

/**
 * Notificação push dos alarmes novos para quem tem acesso ao cliente. Só a
 * partir de PUSH_MIN_SEVERITY; devolve quantas notificações foram entregues.
 */
export async function pushAlarms(
  tenant: { id: string; slug: string; name: string },
  alarms: AlarmNotice[],
): Promise<number> {
  const relevant = alarms.filter((a) => SEVERITY_RANK[a.severity] >= SEVERITY_RANK[PUSH_MIN_SEVERITY]);
  if (relevant.length === 0) return 0;

  const recipients = await db.membership.findMany({
    where: { tenantId: tenant.id, user: { active: true } },
    select: { userId: true },
  });
  const userIds = recipients.map((r) => r.userId);
  const results = await Promise.all(
    relevant.map((alarm) =>
      sendPushToUsers(userIds, {
        title: `${SEVERITY_LABEL[alarm.severity]}: ${alarm.title}`,
        body: `${alarm.message} (${tenant.name})`,
        url: `/app/${tenant.slug}/alarmes`,
        tag: alarm.tag,
        severity: alarm.severity,
      }),
    ),
  );
  return results.reduce((sum, r) => sum + r.sent, 0);
}
