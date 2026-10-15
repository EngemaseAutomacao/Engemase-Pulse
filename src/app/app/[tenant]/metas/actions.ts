"use server";

import { revalidatePath } from "next/cache";
import { parseDecimal } from "@/lib/validation";
import { audit } from "@/server/audit";
import { getTenantAccess } from "@/server/auth/dal";
import { saveTarget } from "@/server/targets";

/** Meta mensal (kWh e/ou R$) de uma unidade ou setor. Campos vazios apagam. Exige Administrador. */
export async function setTargetAction(slug: string, scope: string, formData: FormData): Promise<{ error?: string }> {
  const context = await getTenantAccess(slug, "ADMIN");
  if (!context) return { error: "Só o administrador do cliente altera as metas." };
  const kwh = parseDecimal(formData.get("kwh"), true);
  const cost = parseDecimal(formData.get("cost"), true);
  if (Number.isNaN(kwh) || Number.isNaN(cost) || (kwh !== null && kwh <= 0) || (cost !== null && cost <= 0)) {
    return { error: "Use números positivos (ex.: 12.000 ou 8.500,00), ou deixe vazio." };
  }
  if (!(await saveTarget(context.tenant.id, scope, kwh, cost))) return { error: "Unidade ou setor não encontrado." };
  await audit({
    actorId: context.user.id,
    action: "update",
    entityType: "site",
    entityId: scope,
    details: { metaKwh: kwh, metaCusto: cost },
  });
  revalidatePath(`/app/${slug}/metas`);
  return {};
}
