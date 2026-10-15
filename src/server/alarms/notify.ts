import "server-only";
import { PUSH_MIN_SEVERITY, SEVERITY_LABEL, SEVERITY_RANK, type Severity } from "@/lib/alarms";
import { db } from "@/server/db";
import { appUrl, isEmailConfigured, itemsEmail, sendEmail } from "@/server/email";
import { sendPushToUsers } from "@/server/push";
import { escapeTelegram, isTelegramConfigured, sendTelegram } from "@/server/telegram";

/** Se o mesmo alarme fechou há menos que isso, reabrir não notifica de novo (evita "pisca-pisca"). */
export const RENOTIFY_AFTER_MS = 15 * 60_000;

export type AlarmNotice = {
  severity: Severity;
  title: string;
  message: string;
  /** Mesma tag = a notificação nova substitui a anterior no aparelho. */
  tag: string;
};

type TenantRef = { id: string; slug: string; name: string };

type Recipient = {
  userId: string;
  email: string;
  telegramChatId: string | null;
  byEmail: boolean;
};

const TELEGRAM_MARK: Record<Severity, string> = { INFO: "🔵", WARNING: "🟠", CRITICAL: "🔴" };

/**
 * Alarmes novos para quem tem acesso ao cliente, a partir de
 * PUSH_MIN_SEVERITY: push em todos os aparelhos ativados, e-mail para quem
 * marcou "alarmes por e-mail" e Telegram para quem conectou a conta.
 * Devolve quantas mensagens foram entregues.
 */
export async function notifyAlarms(tenant: TenantRef, alarms: AlarmNotice[]): Promise<number> {
  const relevant = alarms.filter((a) => SEVERITY_RANK[a.severity] >= SEVERITY_RANK[PUSH_MIN_SEVERITY]);
  if (relevant.length === 0) return 0;
  const members = await db.membership.findMany({
    where: { tenantId: tenant.id, user: { active: true } },
    select: { userId: true, alarmEmail: true, user: { select: { email: true, telegramChatId: true } } },
  });
  return deliver(
    tenant,
    relevant,
    members.map((m) => ({ userId: m.userId, email: m.user.email, telegramChatId: m.user.telegramChatId, byEmail: m.alarmEmail })),
    null,
  );
}

/**
 * Escalonamento: alarmes que ninguém reconheceu no prazo vão para as pessoas
 * marcadas como "escalonamento" do cliente, por todos os canais que elas têm.
 */
export async function notifyEscalation(tenant: TenantRef, alarms: AlarmNotice[], minutes: number): Promise<number> {
  if (alarms.length === 0) return 0;
  const members = await db.membership.findMany({
    where: { tenantId: tenant.id, escalation: true, user: { active: true } },
    select: { userId: true, user: { select: { email: true, telegramChatId: true } } },
  });
  if (members.length === 0) return 0;
  return deliver(
    tenant,
    alarms,
    members.map((m) => ({ userId: m.userId, email: m.user.email, telegramChatId: m.user.telegramChatId, byEmail: true })),
    minutes,
  );
}

async function deliver(
  tenant: TenantRef,
  alarms: AlarmNotice[],
  recipients: Recipient[],
  /** Preenchido no escalonamento: minutos sem reconhecimento. */
  escalatedAfter: number | null,
): Promise<number> {
  if (recipients.length === 0) return 0;
  const path = `/app/${tenant.slug}/alarmes`;
  const prefix = escalatedAfter === null ? "" : `Sem reconhecimento há ${escalatedAfter} min — `;

  const pushes = await Promise.all(
    alarms.map((alarm) =>
      sendPushToUsers(
        recipients.map((r) => r.userId),
        {
          title: `${prefix}${SEVERITY_LABEL[alarm.severity]}: ${alarm.title}`,
          body: `${alarm.message} (${tenant.name})`,
          url: path,
          tag: escalatedAfter === null ? alarm.tag : `escalonamento:${alarm.tag}`,
          severity: alarm.severity,
        },
      ),
    ),
  );
  let delivered = pushes.reduce((sum, r) => sum + r.sent, 0);

  const base = appUrl();
  const link = base ? `${base}${path}` : null;

  const emailTo = isEmailConfigured() && link ? recipients.filter((r) => r.byEmail) : [];
  if (emailTo.length > 0) {
    const color = (await db.tenant.findUnique({ where: { id: tenant.id }, select: { primaryColor: true } }))?.primaryColor;
    const count = alarms.length === 1 ? "1 alarme" : `${alarms.length} alarmes`;
    const message = itemsEmail({
      title: escalatedAfter === null ? `${count} — ${tenant.name}` : `Alarme sem reconhecimento — ${tenant.name}`,
      intro:
        escalatedAfter === null
          ? "Alarmes abertos agora:"
          : `Ninguém reconheceu estes alarmes em ${escalatedAfter} minutos. Você recebe porque está no escalonamento de ${tenant.name}.`,
      items: alarms.map((a) => ({ title: `${SEVERITY_LABEL[a.severity]} · ${a.title}`, detail: a.message })),
      button: "Ver alarmes",
      url: link!,
      footer: "Você pode parar de receber por e-mail em Minha conta → Avisos.",
      color,
    });
    const subject =
      escalatedAfter === null
        ? `${SEVERITY_LABEL[alarms[0].severity]}: ${alarms[0].title}${alarms.length > 1 ? ` (+${alarms.length - 1})` : ""}`
        : `Sem reconhecimento: ${alarms[0].title}${alarms.length > 1 ? ` (+${alarms.length - 1})` : ""}`;
    const sent = await Promise.all(emailTo.map((r) => sendEmail({ to: r.email, subject, ...message })));
    delivered += sent.filter(Boolean).length;
  }

  const chats = isTelegramConfigured() ? recipients.filter((r) => r.telegramChatId) : [];
  if (chats.length > 0) {
    const lines = alarms.map(
      (a) =>
        `${TELEGRAM_MARK[a.severity]} <b>${escapeTelegram(SEVERITY_LABEL[a.severity])}</b> — ${escapeTelegram(a.title)}\n${escapeTelegram(a.message)}`,
    );
    const header =
      escalatedAfter === null ? "" : `<b>Sem reconhecimento há ${escalatedAfter} min</b> (escalonamento)\n\n`;
    const footer = `\n\n<i>${escapeTelegram(tenant.name)}</i>${link ? ` · <a href="${link}">ver alarmes</a>` : ""}`;
    const text = `${header}${lines.join("\n\n")}${footer}`;
    const sent = await Promise.all(chats.map((r) => sendTelegram(r.telegramChatId!, text)));
    delivered += sent.filter(Boolean).length;
  }
  return delivered;
}
