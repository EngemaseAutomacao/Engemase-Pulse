import "server-only";
import { createHash } from "node:crypto";
import { getCache } from "@/server/cache";
import { generateSessionToken, hashSessionToken } from "@/server/crypto";
import { db } from "@/server/db";
import { appUrl } from "@/server/email";
import { env } from "@/server/env";
import { reportCaught } from "@/server/errors";

/**
 * Alarmes pelo Telegram. Um bot só (TELEGRAM_BOT_TOKEN, criado no @BotFather)
 * para o sistema todo; cada pessoa conecta a própria conta em "Minha conta":
 * o sistema gera um link t.me/<bot>?start=<código>, a pessoa toca em Iniciar e
 * o Telegram avisa o webhook, que grava a conversa (chat) no usuário.
 */

const LINK_PURPOSE = "telegram";
const LINK_VALID_MS = 30 * 60_000;
const WEBHOOK_PATH = "/api/telegram/webhook";

export function isTelegramConfigured(): boolean {
  return Boolean(env().TELEGRAM_BOT_TOKEN);
}

/** Segredo que o Telegram repete no cabeçalho de cada chamada ao webhook (derivado do token do bot). */
export function telegramWebhookSecret(): string | null {
  const token = env().TELEGRAM_BOT_TOKEN;
  return token ? createHash("sha256").update(`webhook:${token}`).digest("hex").slice(0, 48) : null;
}

async function telegramApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = env().TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram não configurado (TELEGRAM_BOT_TOKEN)");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await response.json().catch(() => null)) as { ok: boolean; result?: T; description?: string } | null;
  if (!data?.ok) throw new Error(`Telegram ${method}: ${data?.description ?? `HTTP ${response.status}`}`);
  return data.result as T;
}

/** Envia uma mensagem (HTML simples). false = não configurado ou falhou. */
export async function sendTelegram(chatId: string, html: string): Promise<boolean> {
  if (!isTelegramConfigured()) return false;
  try {
    await telegramApi("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    return true;
  } catch (error) {
    reportCaught("servidor", "envio pelo Telegram", error);
    return false;
  }
}

export const escapeTelegram = (text: string) =>
  text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** Nome de usuário do bot (para o link t.me), guardado por um dia. */
async function botUsername(): Promise<string> {
  const cache = getCache();
  const cachedName = await cache.get<string>("telegram:bot-username");
  if (cachedName) return cachedName;
  const me = await telegramApi<{ username: string }>("getMe", {});
  await cache.set("telegram:bot-username", me.username, 86_400_000);
  return me.username;
}

/** Aponta o bot para o webhook deste sistema (só chama o Telegram se o endereço mudou). */
export async function ensureTelegramWebhook(): Promise<void> {
  const base = appUrl();
  const secret = telegramWebhookSecret();
  if (!base || !secret) throw new Error("Endereço público do sistema (APP_URL) não configurado");
  const url = `${base}${WEBHOOK_PATH}`;
  const cache = getCache();
  if ((await cache.get<string>("telegram:webhook")) === url) return;
  const info = await telegramApi<{ url: string }>("getWebhookInfo", {});
  if (info.url !== url) {
    await telegramApi("setWebhook", { url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
  }
  await cache.set("telegram:webhook", url, 86_400_000);
}

/** Link para a pessoa conectar o Telegram à conta (vale 30 min, uso único). */
export async function createTelegramLink(userId: string): Promise<string> {
  await ensureTelegramWebhook();
  const code = generateSessionToken(); // 43 caracteres base64url: cabe no limite de 64 do "start".
  await db.$transaction([
    db.passwordToken.deleteMany({ where: { userId, purpose: LINK_PURPOSE, usedAt: null } }),
    db.passwordToken.create({
      data: { userId, purpose: LINK_PURPOSE, tokenHash: hashSessionToken(code), expiresAt: new Date(Date.now() + LINK_VALID_MS) },
    }),
  ]);
  return `https://t.me/${await botUsername()}?start=${code}`;
}

export async function disconnectTelegram(userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { telegramChatId: null } });
}

type TelegramUpdate = {
  message?: { text?: string; chat?: { id: number; type?: string }; from?: { first_name?: string } };
};

/** Mensagens que chegam ao bot: /start <código> conecta, /sair desconecta. */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim() ?? "";
  if (!chatId) return;
  const chat = String(chatId);

  const start = /^\/start(?:@\w+)?\s+([\w-]{20,64})$/.exec(text);
  if (start) {
    const row = await db.passwordToken.findUnique({
      where: { tokenHash: hashSessionToken(start[1]) },
      select: { id: true, purpose: true, usedAt: true, expiresAt: true, user: { select: { id: true, name: true, active: true } } },
    });
    if (!row || row.purpose !== LINK_PURPOSE || row.usedAt || row.expiresAt < new Date() || !row.user.active) {
      await sendTelegram(chat, "Este link expirou ou já foi usado. Gere outro em <b>Minha conta</b> no sistema.");
      return;
    }
    const { count } = await db.passwordToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (count === 0) return;
    // A mesma conversa só fica ligada a uma conta.
    await db.$transaction([
      db.user.updateMany({ where: { telegramChatId: chat, id: { not: row.user.id } }, data: { telegramChatId: null } }),
      db.user.update({ where: { id: row.user.id }, data: { telegramChatId: chat } }),
    ]);
    await sendTelegram(
      chat,
      `Pronto, ${escapeTelegram(row.user.name.split(" ")[0])}! Os alarmes de <b>Atenção</b> e <b>Crítico</b> vão chegar aqui. Para parar, envie /sair.`,
    );
    return;
  }

  if (/^\/(sair|stop|parar)\b/i.test(text)) {
    const { count } = await db.user.updateMany({ where: { telegramChatId: chat }, data: { telegramChatId: null } });
    await sendTelegram(chat, count > 0 ? "Pronto: você não vai mais receber alarmes aqui." : "Esta conversa não estava conectada.");
    return;
  }

  const linked = await db.user.findUnique({ where: { telegramChatId: chat }, select: { name: true } });
  await sendTelegram(
    chat,
    linked
      ? `Você está conectado como ${escapeTelegram(linked.name)} e recebe os alarmes aqui. Para parar, envie /sair.`
      : "Para receber os alarmes, abra o sistema em <b>Minha conta → Telegram</b> e toque em Conectar.",
  );
}
