import "server-only";
import { generateSessionToken, hashPassword, hashSessionToken } from "@/server/crypto";
import { db } from "@/server/db";
import { actionEmail, appUrl, isEmailConfigured, sendEmail } from "@/server/email";
import { deleteUserSessions } from "./session";

/**
 * Links de uso único para definir a senha. O token vai só no link; no banco
 * fica o SHA-256. Usar o link troca a senha, derruba todas as sessões da
 * pessoa e invalida os outros links dela.
 */

export type PasswordTokenPurpose = "reset" | "invite";

const VALID_FOR_MS: Record<PasswordTokenPurpose, number> = {
  reset: 60 * 60_000,
  invite: 7 * 86_400_000,
};

export const PASSWORD_LINK_VALIDITY: Record<PasswordTokenPurpose, string> = {
  reset: "1 hora",
  invite: "7 dias",
};

/** Cria o link (e invalida os anteriores da pessoa). Devolve o caminho com o token. */
export async function createPasswordLink(userId: string, purpose: PasswordTokenPurpose): Promise<string> {
  const token = generateSessionToken();
  await db.$transaction([
    db.passwordToken.deleteMany({ where: { userId, usedAt: null } }),
    db.passwordToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + VALID_FOR_MS[purpose]),
      },
    }),
  ]);
  return `/login/redefinir?token=${encodeURIComponent(token)}`;
}

/** Link ainda válido → dados da pessoa (para a tela mostrar de quem é). */
export async function findValidPasswordToken(token: string) {
  if (!token || token.length > 200) return null;
  const row = await db.passwordToken.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      purpose: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { id: true, name: true, email: true, active: true } },
    },
  });
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.active) return null;
  return row;
}

/** Usa o link: grava a senha nova. false = link inválido, vencido ou já usado. */
export async function consumePasswordToken(token: string, newPassword: string): Promise<boolean> {
  const row = await findValidPasswordToken(token);
  if (!row) return false;
  // Marca como usado só se ninguém usou entre a leitura e agora (dois cliques ao mesmo tempo).
  const { count } = await db.passwordToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count === 0) return false;
  await db.user.update({ where: { id: row.user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  await db.passwordToken.deleteMany({ where: { userId: row.user.id, usedAt: null } });
  await deleteUserSessions(row.user.id);
  return true;
}

/**
 * Manda o link por e-mail quando configurado. Devolve o endereço completo
 * para a tela mostrar quando não há e-mail (ou o envio falhar).
 */
export async function deliverPasswordLink(
  user: { name: string; email: string },
  path: string,
  purpose: PasswordTokenPurpose,
  context?: { tenantName?: string },
): Promise<{ emailed: boolean; url: string | null }> {
  const base = appUrl();
  const url = base ? `${base}${path}` : null;
  if (!url || !isEmailConfigured()) return { emailed: false, url };
  const firstName = user.name.split(" ")[0];
  const message =
    purpose === "invite"
      ? actionEmail({
          title: `Seu acesso${context?.tenantName ? ` — ${context.tenantName}` : ""}`,
          intro: `Olá, ${firstName}! Você recebeu acesso ao monitoramento de energia${
            context?.tenantName ? ` de ${context.tenantName}` : ""
          }. Para entrar, defina a sua senha.`,
          button: "Definir minha senha",
          url,
          footer: `O link vale por ${PASSWORD_LINK_VALIDITY.invite} e só pode ser usado uma vez.`,
        })
      : actionEmail({
          title: "Redefinir a senha",
          intro: `Olá, ${firstName}! Recebemos um pedido para redefinir a sua senha. Se não foi você, ignore este e-mail.`,
          button: "Criar nova senha",
          url,
          footer: `O link vale por ${PASSWORD_LINK_VALIDITY.reset} e só pode ser usado uma vez.`,
        });
  const emailed = await sendEmail({
    to: user.email,
    subject: purpose === "invite" ? "Seu acesso ao monitoramento de energia" : "Redefinir a senha",
    ...message,
  });
  return { emailed, url };
}
