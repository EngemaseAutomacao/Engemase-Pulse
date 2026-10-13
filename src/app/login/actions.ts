"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { errorState, validationError, type ActionState } from "@/lib/action-state";
import { loginSchema } from "@/lib/validation";
import { loadAuthUser } from "@/server/auth/dal";
import { isLoginBlocked, recordLoginAttempt } from "@/server/auth/login-throttle";
import { homePathFor, type AuthUser } from "@/server/auth/permissions";
import { clientIp, createSession, deleteCurrentSession } from "@/server/auth/session";
import { getDummyPasswordHash, verifyPassword } from "@/server/crypto";
import { db } from "@/server/db";

const INVALID_CREDENTIALS = "E-mail ou senha incorretos.";

export async function login(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });
  if (!parsed.success) return validationError(parsed.error, formData);
  const { email, password, next } = parsed.data;

  if (await isLoginBlocked(email)) {
    return errorState("Muitas tentativas sem sucesso. Aguarde 15 minutos e tente de novo.", formData);
  }

  const ip = clientIp(await headers());
  const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true, active: true } });
  // Sempre calcula um hash, exista o e-mail ou não, para não vazar quem tem conta pelo tempo de resposta.
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await getDummyPasswordHash()));

  if (!user || !passwordOk || !user.active) {
    await recordLoginAttempt(email, ip, false);
    return errorState(INVALID_CREDENTIALS, formData);
  }

  await recordLoginAttempt(email, ip, true);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);

  const authUser = await loadAuthUser(user.id);
  if (!authUser) return errorState(INVALID_CREDENTIALS, formData);
  redirect(destination(authUser, next));
}

export async function logout(): Promise<void> {
  await deleteCurrentSession();
  redirect("/login");
}

/** Respeita o `next` só se o usuário tiver acesso ao cliente dele. */
function destination(user: AuthUser, next: string | null): string {
  if (!next) return homePathFor(user);
  if (next.startsWith("/admin")) return user.isPlatformAdmin ? next : homePathFor(user);
  const tenantSlug = /^\/app\/([^/?#]+)/.exec(next)?.[1];
  if (tenantSlug && !user.isPlatformAdmin && !user.memberships.some((m) => m.tenantSlug === tenantSlug)) {
    return homePathFor(user);
  }
  return next;
}
