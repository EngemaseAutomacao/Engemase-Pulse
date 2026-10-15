"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, validationError, type ActionState } from "@/lib/action-state";
import { siteSchema, tariffSchema } from "@/lib/validation";
import { isForeignKeyViolation, isNotFound, isUniqueViolation, requireAdminForAction } from "@/server/admin/guard";
import { invalidateSites } from "@/server/admin/invalidate";
import {
  createSite,
  deleteSite,
  removeSiteTariff,
  rotateSiteAgentToken,
  setSiteTariff,
  updateSite,
} from "@/server/admin/sites";

export async function saveSite(
  siteId: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdminForAction();
  const parsed = siteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  let createdId: string;
  try {
    if (siteId) {
      await updateSite(actor, siteId, parsed.data);
      await invalidateSites([siteId], [parsed.data.tenantId]);
      revalidatePath("/admin", "layout");
      return { status: "success", message: "Unidade salva." };
    }
    createdId = (await createSite(actor, parsed.data)).id;
    await invalidateSites([createdId], [parsed.data.tenantId]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ...errorState("Revise os campos destacados.", formData),
        fieldErrors: { name: "Já existe uma unidade com este nome neste cliente" },
      };
    }
    if (isNotFound(error)) return errorState("Esta unidade não existe mais.");
    throw error;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/unidades/${createdId}`);
}

export async function removeSite(siteId: string): Promise<void> {
  const actor = await requireAdminForAction();
  const site = await deleteSite(actor, siteId);
  await invalidateSites([siteId], [site.tenantId]);
  revalidatePath("/admin", "layout");
  redirect("/admin/unidades");
}

export type AgentTokenResult = { ok: true; token: string } | { ok: false; message: string };

/** Gera (ou troca) o token do gateway. O anterior para de valer na hora. */
export async function rotateAgentToken(siteId: string): Promise<AgentTokenResult> {
  const actor = await requireAdminForAction();
  try {
    const token = await rotateSiteAgentToken(actor, siteId);
    revalidatePath(`/admin/unidades/${siteId}`);
    return { ok: true, token };
  } catch (error) {
    if (isNotFound(error)) return { ok: false, message: "Esta unidade não existe mais." };
    throw error;
  }
}

export async function saveSiteTariff(siteId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAdminForAction();
  if (formData.get("remove") === "1") {
    await removeSiteTariff(actor, siteId);
    revalidatePath(`/admin/unidades/${siteId}`);
    return { status: "success", message: "Tarifa removida." };
  }
  const parsed = tariffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  try {
    await setSiteTariff(actor, siteId, parsed.data);
  } catch (error) {
    if (isNotFound(error) || isForeignKeyViolation(error)) return errorState("Esta unidade não existe mais.");
    throw error;
  }
  revalidatePath(`/admin/unidades/${siteId}`);
  return { status: "success", message: "Tarifa salva." };
}
