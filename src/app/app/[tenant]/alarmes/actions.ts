"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, validationError, type ActionState } from "@/lib/action-state";
import { alarmRuleSchema } from "@/lib/validation";
import { evaluateTenant } from "@/server/alarms/engine";
import { forgetPainelAlarmSignature } from "@/server/agent/alarms";
import { invalidateAlarmState } from "@/server/alarms/state";
import { audit } from "@/server/audit";
import { getTenantAccess } from "@/server/auth/dal";
import { db } from "@/server/db";

/**
 * Ações de alarme dentro da área do cliente. Cada uma reconfere o acesso:
 * reconhecer exige Operador; regras e "verificar agora" exigem Administrador.
 */

async function access(slug: string, minimum: "OPERATOR" | "ADMIN") {
  const context = await getTenantAccess(slug, minimum);
  if (!context) throw new Error("Sem permissão para esta ação");
  return context;
}

export async function acknowledgeAlarm(slug: string, alarmId: string): Promise<{ error: string } | void> {
  const { tenant, user } = await access(slug, "OPERATOR");
  const { count } = await db.alarm.updateMany({
    where: { id: alarmId, tenantId: tenant.id, acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), acknowledgedById: user.id },
  });
  if (count === 0) return { error: "Alarme não encontrado ou já reconhecido." };
  // Alarme do gateway: o próximo envio da unidade recebe o "reconhecer".
  const alarm = await db.alarm.findUnique({ where: { id: alarmId }, select: { source: true, siteId: true } });
  if (alarm?.source === "PAINEL" && alarm.siteId) await forgetPainelAlarmSignature(alarm.siteId);
  revalidatePath(`/app/${slug}`, "layout");
}

export async function acknowledgeAll(slug: string): Promise<void> {
  const { tenant, user } = await access(slug, "OPERATOR");
  const painelSites = await db.alarm.findMany({
    where: { tenantId: tenant.id, clearedAt: null, acknowledgedAt: null, source: "PAINEL", siteId: { not: null } },
    select: { siteId: true },
    distinct: ["siteId"],
  });
  await db.alarm.updateMany({
    where: { tenantId: tenant.id, clearedAt: null, acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), acknowledgedById: user.id },
  });
  await forgetPainelAlarmSignature(...painelSites.map((a) => a.siteId!));
  revalidatePath(`/app/${slug}`, "layout");
}

/** Roda o avaliador só para este cliente (útil sem cron ou para testar uma regra). */
export async function evaluateNow(slug: string): Promise<{ message: string }> {
  const { tenant } = await access(slug, "ADMIN");
  const result = await evaluateTenant(tenant.id);
  revalidatePath(`/app/${slug}`, "layout");
  return {
    message: `Verificação concluída: ${result.opened} alarme(s) novo(s), ${result.cleared} normalizado(s), ${result.notified} notificação(ões) enviada(s).`,
  };
}

export async function saveAlarmRule(
  slug: string,
  ruleId: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { tenant, user } = await access(slug, "ADMIN");
  const parsed = alarmRuleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const data = parsed.data;

  if (data.meterId) {
    const meter = await db.meter.findFirst({
      where: { id: data.meterId, site: { tenantId: tenant.id } },
      select: { id: true },
    });
    if (!meter)
      return { ...errorState("Revise os campos destacados.", formData), fieldErrors: { meterId: "Medidor inválido" } };
  }

  if (ruleId) {
    const { count } = await db.alarmRule.updateMany({ where: { id: ruleId, tenantId: tenant.id }, data });
    if (count === 0) return errorState("Esta regra não existe mais.");
    // Mudou a regra: fecha os alarmes abertos por ela; o próximo ciclo reavalia.
    await db.alarm.updateMany({ where: { ruleId, clearedAt: null }, data: { clearedAt: new Date(), openKey: null } });
    await audit({ actorId: user.id, action: "update", entityType: "alarm-rule", entityId: ruleId, details: data });
  } else {
    const rule = await db.alarmRule.create({ data: { ...data, tenantId: tenant.id } });
    await audit({ actorId: user.id, action: "create", entityType: "alarm-rule", entityId: rule.id, details: data });
  }
  await invalidateAlarmState(tenant.id);
  revalidatePath(`/app/${slug}`, "layout");
  redirect(`/app/${slug}/alarmes/regras`);
}

export async function deleteAlarmRule(slug: string, ruleId: string): Promise<void> {
  const { tenant, user } = await access(slug, "ADMIN");
  // Encerra os alarmes abertos pela regra antes de removê-la (senão ficariam abertos para sempre).
  await db.alarm.updateMany({
    where: { ruleId, tenantId: tenant.id, clearedAt: null },
    data: { clearedAt: new Date(), openKey: null },
  });
  await db.alarmRule.deleteMany({ where: { id: ruleId, tenantId: tenant.id } });
  await invalidateAlarmState(tenant.id);
  await audit({
    actorId: user.id,
    action: "delete",
    entityType: "alarm-rule",
    entityId: ruleId,
    details: { tenantId: tenant.id },
  });
  revalidatePath(`/app/${slug}`, "layout");
  redirect(`/app/${slug}/alarmes/regras`);
}
