import { NextResponse, type NextRequest } from "next/server";
import { agentPayloadSchema } from "@/lib/agent-payload";
import { ingestAgentPayload } from "@/server/agent/ingest";
import { findSiteByAgentToken } from "@/server/agent/token";

/**
 * Recebe as leituras do Painel local (supervisório instalado na loja).
 * Autenticação: "Authorization: Bearer <token da unidade>", gerado em
 * Administração → Unidades. Formato do corpo: `src/lib/agent-payload.ts`.
 *
 * Respostas: 200 aceito · 400 corpo inválido · 401 token inválido · 413 corpo grande demais.
 * O Painel só avança o que já enviou depois de um 200.
 */
export const maxDuration = 30;

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const NO_STORE = { "Cache-Control": "no-store" } as const;

function reply(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  const site = token ? await findSiteByAgentToken(token) : null;
  if (!site) return reply(401, { erro: "Token inválido ou revogado" });

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return reply(413, { erro: "Envio grande demais: mande o histórico em partes menores" });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(400, { erro: "O corpo não é um JSON válido" });
  }

  const parsed = agentPayloadSchema.safeParse(body);
  if (!parsed.success) {
    const problemas = parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`);
    return reply(400, { erro: "Envio fora do formato esperado", problemas });
  }

  const result = await ingestAgentPayload(site, parsed.data);
  return reply(200, { ok: true, ...result });
}
