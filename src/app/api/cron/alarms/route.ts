import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { Receiver } from "@upstash/qstash";
import { evaluateAllTenants } from "@/server/alarms/engine";
import { env } from "@/server/env";

/**
 * Avaliador periódico de alarmes. Aceita dois tipos de chamada autenticada:
 *  - "Authorization: Bearer <CRON_SECRET>" — Cron da Vercel ou GitHub Actions;
 *  - assinatura do Upstash QStash (cabeçalho upstash-signature) — agendador com
 *    reenvio automático, funciona em qualquer plano da Vercel.
 */
export const maxDuration = 60;

export const GET = handle;
export const POST = handle;

async function handle(request: NextRequest) {
  const body = request.method === "POST" ? await request.text() : "";
  if (!(await isAuthorized(request, body))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const startedAt = Date.now();
  const summary = await evaluateAllTenants();
  return NextResponse.json({ ...summary, durationMs: Date.now() - startedAt }, { headers: { "Cache-Control": "no-store" } });
}

async function isAuthorized(request: NextRequest, body: string): Promise<boolean> {
  const secret = env().CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (secret && authorization) {
    const provided = Buffer.from(authorization);
    const expected = Buffer.from(`Bearer ${secret}`);
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) return true;
  }

  const signature = request.headers.get("upstash-signature");
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (signature && currentSigningKey && nextSigningKey) {
    try {
      const receiver = new Receiver({ currentSigningKey, nextSigningKey });
      return await receiver.verify({ signature, body, clockTolerance: 30 });
    } catch {
      return false;
    }
  }
  return false;
}
