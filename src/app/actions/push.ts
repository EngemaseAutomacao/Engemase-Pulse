"use server";

import { headers } from "next/headers";
import { pushSubscriptionSchema } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { isPushConfigured, sendPushToUsers } from "@/server/push";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Guarda a assinatura push deste navegador para o usuário logado. */
export async function savePushSubscription(subscription: unknown): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };
  const parsed = pushSubscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { ok: false, error: "Assinatura inválida enviada pelo navegador." };

  const { endpoint, keys } = parsed.data;
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  // O mesmo aparelho pode ter sido de outro usuário antes: o endpoint passa para quem está logado agora.
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent, userId: user.id },
    update: { p256dh: keys.p256dh, auth: keys.auth, userAgent, userId: user.id },
  });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada." };
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return { ok: true };
}

/** Envia uma notificação de teste para todos os aparelhos do próprio usuário. */
export async function sendTestNotification(): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada." };
  if (!isPushConfigured()) return { ok: false, error: "Notificações não configuradas no servidor (chaves VAPID)." };

  const { sent } = await sendPushToUsers([user.id], {
    title: "Notificações ativadas",
    body: "Você vai receber aqui os alarmes dos seus medidores.",
    url: "/",
    tag: "test",
  });
  return sent > 0
    ? { ok: true, message: `Notificação de teste enviada para ${sent} aparelho(s).` }
    : { ok: false, error: "Nenhum aparelho com notificações ativas." };
}
