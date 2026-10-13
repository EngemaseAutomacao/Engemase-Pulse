"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, validationError, type ActionState } from "@/lib/action-state";
import { membershipsFromForm, userSchema } from "@/lib/validation";
import { isNotFound, isUniqueViolation, requireAdminForAction } from "@/server/admin/guard";
import { UserRuleError, createUser, deleteUser, updateUser } from "@/server/admin/users";

export async function saveUser(userId: string | null, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAdminForAction();
  const parsed = userSchema.safeParse({
    ...Object.fromEntries(formData),
    memberships: membershipsFromForm(formData),
  });
  if (!parsed.success) return validationError(parsed.error, formData);

  let createdId: string;
  try {
    if (userId) {
      await updateUser(actor, userId, parsed.data);
      revalidatePath("/admin", "layout");
      return { status: "success", message: parsed.data.password ? "Usuário salvo e senha redefinida." : "Usuário salvo." };
    }
    createdId = (await createUser(actor, parsed.data)).id;
  } catch (error) {
    if (error instanceof UserRuleError) return errorState(error.message, formData);
    if (isUniqueViolation(error, "email")) {
      return { ...errorState("Revise os campos destacados.", formData), fieldErrors: { email: "Já existe um usuário com este e-mail" } };
    }
    if (isNotFound(error)) return errorState("Este usuário não existe mais.");
    throw error;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/usuarios/${createdId}`);
}

export async function removeUser(userId: string): Promise<{ error: string } | void> {
  const actor = await requireAdminForAction();
  try {
    await deleteUser(actor, userId);
  } catch (error) {
    if (error instanceof UserRuleError) return { error: error.message };
    throw error;
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/usuarios");
}
