"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, validationError, type ActionState } from "@/lib/action-state";
import { meterSchema } from "@/lib/validation";
import { isNotFound, isUniqueViolation, requireAdminForAction } from "@/server/admin/guard";
import { invalidateSites } from "@/server/admin/invalidate";
import { deleteMeter, updateMeter } from "@/server/admin/meters";

export async function saveMeter(meterId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAdminForAction();
  const parsed = meterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  try {
    const meter = await updateMeter(actor, meterId, parsed.data);
    await invalidateSites([meter.siteId]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ...errorState("Revise os campos destacados.", formData), fieldErrors: { tag: "Já existe um medidor com esta TAG nesta unidade" } };
    }
    if (isNotFound(error)) return errorState("Este medidor não existe mais.");
    throw error;
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/app", "layout");
  return { status: "success", message: "Medidor salvo." };
}

export async function removeMeter(meterId: string): Promise<void> {
  const actor = await requireAdminForAction();
  const meter = await deleteMeter(actor, meterId);
  await invalidateSites([meter.siteId]);
  revalidatePath("/admin", "layout");
  revalidatePath("/app", "layout");
  redirect("/admin/medidores");
}
