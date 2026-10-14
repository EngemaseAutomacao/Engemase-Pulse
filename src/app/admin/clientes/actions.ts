"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, validationError, type ActionState } from "@/lib/action-state";
import { tenantSchema } from "@/lib/validation";
import { isNotFound, isUniqueViolation, requireAdminForAction } from "@/server/admin/guard";
import {
  LOGIN_BACKGROUND_MAX_BYTES,
  LOGO_MAX_BYTES,
  createTenant,
  deleteTenant,
  detectImageType,
  removeTenantLoginBackground,
  removeTenantLogo,
  setTenantLoginBackground,
  setTenantLogo,
  updateTenant,
} from "@/server/admin/tenants";
import { invalidateTenant } from "@/server/admin/invalidate";
import { brandingTag } from "@/server/branding";
import { db } from "@/server/db";

const SLUG_TAKEN: ActionState["fieldErrors"] = { slug: "Este endereço já é usado por outro cliente" };

export async function saveTenant(tenantId: string | null, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAdminForAction();
  const parsed = tenantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  let createdId: string;
  try {
    if (tenantId) {
      const { tenant, previousSlug } = await updateTenant(actor, tenantId, parsed.data);
      updateTag(brandingTag(previousSlug));
      updateTag(brandingTag(tenant.slug));
      await invalidateTenant(tenant.id);
      revalidatePath("/admin", "layout");
      revalidatePath(`/app/${tenant.slug}`, "layout");
      return { status: "success", message: "Cliente salvo." };
    }
    createdId = (await createTenant(actor, parsed.data)).id;
  } catch (error) {
    if (isUniqueViolation(error, "slug")) {
      return { ...errorState("Revise os campos destacados.", formData), fieldErrors: SLUG_TAKEN };
    }
    if (isNotFound(error)) return errorState("Este cliente não existe mais.");
    throw error;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/clientes/${createdId}`);
}

export async function removeTenant(tenantId: string): Promise<void> {
  const actor = await requireAdminForAction();
  const tenant = await deleteTenant(actor, tenantId);
  await invalidateTenant(tenantId);
  updateTag(brandingTag(tenant.slug));
  revalidatePath("/admin", "layout");
  redirect("/admin/clientes");
}

export async function uploadTenantLogo(tenantId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAdminForAction();
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  if (!tenant) return errorState("Este cliente não existe mais.");

  if (formData.get("remove") === "1") {
    await removeTenantLogo(actor, tenantId);
  } else {
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) return errorState("Escolha uma imagem.");
    if (file.size > LOGO_MAX_BYTES) return errorState("A imagem deve ter no máximo 512 KB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = detectImageType(bytes);
    if (!mimeType) return errorState("Formato não aceito. Use PNG, JPG ou WEBP.");
    await setTenantLogo(actor, tenantId, bytes, mimeType);
  }

  updateTag(brandingTag(tenant.slug));
  revalidatePath("/admin", "layout");
  revalidatePath(`/app/${tenant.slug}`, "layout");
  return { status: "success", message: formData.get("remove") === "1" ? "Logo removido." : "Logo atualizado." };
}

export async function uploadTenantLoginBackground(
  tenantId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdminForAction();
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  if (!tenant) return errorState("Este cliente não existe mais.");

  const remove = formData.get("remove") === "1";
  if (remove) {
    await removeTenantLoginBackground(actor, tenantId);
  } else {
    const file = formData.get("background");
    if (!(file instanceof File) || file.size === 0) return errorState("Escolha uma imagem.");
    if (file.size > LOGIN_BACKGROUND_MAX_BYTES) return errorState("A imagem deve ter no máximo 1,5 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = detectImageType(bytes);
    if (!mimeType) return errorState("Formato não aceito. Use PNG, JPG ou WEBP.");
    await setTenantLoginBackground(actor, tenantId, bytes, mimeType);
  }

  updateTag(brandingTag(tenant.slug));
  revalidatePath(`/admin/clientes/${tenantId}`);
  return { status: "success", message: remove ? "Imagem de fundo removida." : "Imagem de fundo atualizada." };
}
