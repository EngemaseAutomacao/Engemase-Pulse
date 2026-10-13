import "server-only";
import { db } from "@/server/db";

/** Depois de 5 senhas erradas em 15 minutos, o e-mail fica bloqueado até a janela passar. */
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

export async function isLoginBlocked(email: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const lastSuccess = await db.loginAttempt.findFirst({
    where: { email, success: true, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const failures = await db.loginAttempt.count({
    where: { email, success: false, createdAt: { gte: lastSuccess?.createdAt ?? since } },
  });
  return failures >= MAX_FAILURES;
}

export async function recordLoginAttempt(email: string, ip: string | null, success: boolean): Promise<void> {
  await db.loginAttempt.create({ data: { email, ip, success } });
  // Limpeza oportunista do histórico antigo.
  if (Math.random() < 0.05) {
    await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
  }
}
