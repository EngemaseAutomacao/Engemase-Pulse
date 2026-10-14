"use server";

import { revalidatePath } from "next/cache";
import { errorState, validationError, type ActionState } from "@/lib/action-state";
import { ROLES, inviteMemberSchema } from "@/lib/validation";
import { getTenantAccess } from "@/server/auth/dal";
import { MemberRuleError, changeMemberRole, inviteMember, newAccessLink, removeMember } from "@/server/tenant-users";

/** Usuários do cliente: tudo exige o papel de Administrador neste cliente. */
async function adminOf(slug: string) {
  const context = await getTenantAccess(slug, "ADMIN");
  if (!context) throw new Error("Sem permissão para esta ação");
  return context;
}

export type InviteState = ActionState & { link?: string | null; emailed?: boolean };

export async function inviteMemberAction(
  slug: string,
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const { tenant, user } = await adminOf(slug);
  const parsed = inviteMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  try {
    const result = await inviteMember(user, tenant, parsed.data);
    revalidatePath(`/app/${slug}/usuarios`);
    if (result.existing) {
      return {
        status: "success",
        message: `${parsed.data.email} já tinha conta e agora também acessa ${tenant.name}.`,
      };
    }
    const { emailed, url } = result.delivery!;
    if (!emailed && !url) {
      return {
        status: "success",
        message:
          "Usuário criado, mas o endereço público do sistema (APP_URL) não está configurado para gerar o link. Peça à Engemase.",
      };
    }
    return {
      status: "success",
      message: emailed
        ? `Convite enviado para ${parsed.data.email}. O link vale por 7 dias.`
        : "Usuário criado. Envie o link abaixo para a pessoa definir a senha (vale por 7 dias, uso único).",
      link: emailed ? null : url,
      emailed,
    };
  } catch (error) {
    if (error instanceof MemberRuleError) return errorState(error.message, formData);
    throw error;
  }
}

export async function setMemberRoleAction(
  slug: string,
  userId: string,
  formData: FormData,
): Promise<{ error: string } | void> {
  const { tenant, user } = await adminOf(slug);
  const role = ROLES.find((r) => r === formData.get("role"));
  if (!role) return { error: "Papel inválido" };
  try {
    await changeMemberRole(user, tenant.id, userId, role);
  } catch (error) {
    if (error instanceof MemberRuleError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/app/${slug}/usuarios`);
}

export async function removeMemberAction(slug: string, userId: string): Promise<{ error: string } | void> {
  const { tenant, user } = await adminOf(slug);
  try {
    await removeMember(user, tenant.id, userId);
  } catch (error) {
    if (error instanceof MemberRuleError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/app/${slug}/usuarios`);
}

export async function accessLinkAction(
  slug: string,
  userId: string,
): Promise<{ error?: string; url?: string | null; emailed?: boolean }> {
  const { tenant, user } = await adminOf(slug);
  try {
    return await newAccessLink(user, tenant, userId);
  } catch (error) {
    if (error instanceof MemberRuleError) return { error: error.message };
    throw error;
  }
}
