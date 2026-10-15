import "server-only";
import { cached, getCache } from "@/server/cache";
import { generateSessionToken, hashSessionToken } from "@/server/crypto";
import { db } from "@/server/db";

/**
 * Token do gateway: identifica a unidade em cada envio para /api/ingest.
 * Como a senha de sessão, só o SHA-256 vai para o banco; o token aparece uma
 * única vez, na tela de administração, ao ser gerado.
 */

const PREFIX = "pnl_";
const SITE_CACHE_TTL_MS = 60_000;

export type AgentSite = {
  id: string;
  tenantId: string;
  timezone: string;
};

export function generateAgentToken(): { token: string; hash: string } {
  const token = `${PREFIX}${generateSessionToken()}`;
  return { token, hash: hashSessionToken(token) };
}

const siteKey = (hash: string) => `agent:site:v1:${hash}`;

/**
 * Unidade dona do token, ou null. Em cache por 1 min: o gateway envia a cada
 * poucos segundos e não precisa de uma consulta ao banco a cada envio.
 */
export async function findSiteByAgentToken(token: string): Promise<AgentSite | null> {
  if (!token.startsWith(PREFIX) || token.length > 200) return null;
  const hash = hashSessionToken(token);
  // Embrulhado em objeto: "não existe" também fica em cache (null seria lido como cache vazio).
  const entry = await cached(siteKey(hash), SITE_CACHE_TTL_MS, async () => ({
    site: await db.site.findUnique({
      where: { agentTokenHash: hash },
      select: { id: true, tenantId: true, timezone: true },
    }),
  }));
  return entry.site;
}

/** Depois de trocar ou revogar o token: o antigo para de valer na hora. */
export async function forgetAgentToken(hash: string | null | undefined): Promise<void> {
  if (hash) await getCache().del(siteKey(hash));
}
