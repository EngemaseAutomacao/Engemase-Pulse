import "server-only";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE } from "@/config/app";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { generateSessionToken, hashSessionToken } from "@/server/crypto";

/** Cria a sessão no banco e grava o cookie. Só pode rodar em Server Action / Route Handler. */
export async function createSession(userId: string): Promise<void> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + env().SESSION_TTL_DAYS * 86_400_000);
  const requestHeaders = await headers();

  await db.session.create({
    data: {
      id: hashSessionToken(token),
      userId,
      expiresAt,
      userAgent: requestHeaders.get("user-agent")?.slice(0, 300) ?? null,
      ip: clientIp(requestHeaders),
    },
  });
  // Limpeza oportunista das sessões vencidas deste usuário.
  await db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Encerra a sessão atual (logout). */
export async function deleteCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashSessionToken(token) } });
  cookieStore.delete(SESSION_COOKIE);
}

/** Encerra todas as sessões de um usuário (troca de senha, desativação). */
export async function deleteUserSessions(userId: string, exceptCurrent = false): Promise<void> {
  let keepId: string | undefined;
  if (exceptCurrent) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    keepId = token ? hashSessionToken(token) : undefined;
  }
  await db.session.deleteMany({ where: { userId, ...(keepId ? { NOT: { id: keepId } } : {}) } });
}

/** Id do usuário da sessão válida, ou null. */
export async function readSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hashSessionToken(token) },
    select: { userId: true, expiresAt: true },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return session.userId;
}

export function clientIp(requestHeaders: Headers): string | null {
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || requestHeaders.get("x-real-ip") || null;
}
