import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { reportCaught } from "@/server/errors";
import { handleTelegramUpdate, telegramWebhookSecret } from "@/server/telegram";

/**
 * Mensagens enviadas ao bot do Telegram (conectar e desconectar contas).
 * O Telegram manda o segredo combinado no setWebhook em cada chamada.
 */
export async function POST(request: NextRequest) {
  const expected = telegramWebhookSecret();
  const received = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!expected || received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  try {
    await handleTelegramUpdate(await request.json());
  } catch (error) {
    // Responde 200 mesmo assim: senão o Telegram repete a mesma mensagem sem parar.
    reportCaught("servidor", "mensagem do Telegram", error);
  }
  return NextResponse.json({ ok: true });
}
