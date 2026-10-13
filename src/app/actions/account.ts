"use server";

import { errorState, validationError, type ActionState } from "@/lib/action-state";
import { changePasswordSchema } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth/dal";
import { deleteUserSessions } from "@/server/auth/session";
import { hashPassword, verifyPassword } from "@/server/crypto";
import { db } from "@/server/db";

/** Troca a própria senha e encerra as outras sessões do usuário. */
export async function changePassword(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return errorState("Sessão expirada. Entre novamente.");

  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const stored = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!stored || !(await verifyPassword(parsed.data.currentPassword, stored.passwordHash))) {
    return { status: "error", message: "Revise os campos destacados.", fieldErrors: { currentPassword: "Senha atual incorreta" } };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });
  await deleteUserSessions(user.id, true);
  return { status: "success", message: "Senha alterada. As outras sessões abertas foram encerradas." };
}
