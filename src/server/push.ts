import "server-only";
import webpush, { WebPushError } from "web-push";
import { db } from "@/server/db";
import { env } from "@/server/env";

export type PushPayload = {
  title: string;
  body: string;
  /** Página aberta ao tocar na notificação. */
  url: string;
  /** Notificações com a mesma tag se substituem no aparelho. */
  tag?: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
};

let configured: boolean | undefined;

/** Configura o VAPID uma vez. Sem chaves, push fica desativado (retorna false). */
export function isPushConfigured(): boolean {
  if (configured !== undefined) return configured;
  const { NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT } = env();
  configured = Boolean(publicKey && privateKey);
  if (configured) webpush.setVapidDetails(VAPID_SUBJECT, publicKey!, privateKey!);
  return configured;
}

/**
 * Envia para todos os aparelhos dos usuários informados. Assinaturas que o
 * navegador já descartou (404/410) são removidas do banco.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!isPushConfigured() || userIds.length === 0) return { sent: 0, failed: 0 };

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: { in: userIds }, user: { active: true } },
  });
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const expired: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60 * 60, urgency: payload.severity === "CRITICAL" ? "high" : "normal" },
        );
        sent++;
      } catch (error) {
        failed++;
        if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
          expired.push(sub.id);
        } else {
          console.error("[push] falha ao enviar", error instanceof Error ? error.message : error);
        }
      }
    }),
  );

  if (expired.length > 0) await db.pushSubscription.deleteMany({ where: { id: { in: expired } } });
  return { sent, failed };
}
