"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { errorState, validationError, type ActionState } from "@/lib/action-state";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@/lib/validation";
import { loadAuthUser } from "@/server/auth/dal";
import { isLoginBlocked, recordLoginAttempt } from "@/server/auth/login-throttle";
import { consumePasswordToken, createPasswordLink, deliverPasswordLink } from "@/server/auth/password-token";
import { getCache } from "@/server/cache";
import { isEmailConfigured } from "@/server/email";
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

const RESET_SENT =
  "Se o e-mail estiver cadastrado, enviamos um link para criar uma nova senha. Confira também a caixa de spam.";

/**
 * "Esqueci minha senha": manda o link por e-mail. A resposta é sempre a mesma,
 * exista o e-mail ou não (não revela quem tem conta), e o envio acontece
 * depois da resposta (o tempo também não revela).
 */
export async function requestPasswordReset(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return validationError(parsed.error, formData);
  if (!isEmailConfigured()) {
    return errorState(
      "O envio por e-mail ainda não está ativo. Peça ao administrador da sua empresa ou à Engemase um link para criar uma nova senha.",
      formData,
    );
  }

  const { email } = parsed.data;
  const ip = clientIp(await headers()) ?? "sem-ip";
  const cache = getCache();
  // Um pedido por e-mail por minuto e um a cada 10 s por endereço: não vira disparador de e-mails.
  if (!(await cache.acquire(`reset:${email}`, 60_000)) || !(await cache.acquire(`reset-ip:${ip}`, 10_000))) {
    return { status: "success", message: RESET_SENT };
  }
  after(async () => {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, active: true },
    });
    if (!user?.active) return;
    const path = await createPasswordLink(user.id, "reset");
    await deliverPasswordLink(user, path, "reset");
  });
  return { status: "success", message: RESET_SENT };
}

/** Nova senha pelo link (esqueci a senha ou convite). */
export async function resetPassword(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const ok = await consumePasswordToken(parsed.data.token, parsed.data.newPassword);
  if (!ok) return errorState("Este link venceu ou já foi usado. Peça um novo link.");
  redirect("/login?senha=definida");
}
