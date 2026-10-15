"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { reportCaught } from "@/server/errors";
import { createTelegramLink, disconnectTelegram, isTelegramConfigured } from "@/server/telegram";

/** O que a própria pessoa escolhe receber por e-mail, em cada cliente a que tem acesso. */
export type PersonalPreference = "alarmEmail" | "monthlyReport";

const PREFERENCES: PersonalPreference[] = ["alarmEmail", "monthlyReport"];

export async function setMyPreference(
  tenantId: string,
  preference: PersonalPreference,
  value: boolean,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };
  if (!PREFERENCES.includes(preference)) return { error: "Opção inválida" };
  const { count } = await db.membership.updateMany({
    where: { userId: user.id, tenantId },
    data: { [preference]: value === true },
  });
  return count === 0 ? { error: "Você não tem acesso a este cliente" } : {};
}

/** Link t.me para conectar o Telegram (a pessoa toca em Iniciar no app). */
export async function connectTelegramAction(): Promise<{ url?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };
  if (!isTelegramConfigured()) return { error: "O Telegram ainda não foi configurado no servidor." };
  try {
    return { url: await createTelegramLink(user.id) };
  } catch (error) {
    reportCaught("servidor", "conectar Telegram", error);
    return { error: "Não foi possível falar com o Telegram agora. Tente de novo em instantes." };
  }
}

export async function telegramStatusAction(): Promise<{ connected: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { connected: false };
  const row = await db.user.findUnique({ where: { id: user.id }, select: { telegramChatId: true } });
  return { connected: Boolean(row?.telegramChatId) };
}

export async function disconnectTelegramAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await disconnectTelegram(user.id);
  revalidatePath("/", "layout");
}
