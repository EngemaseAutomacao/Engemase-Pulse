"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, validationError, type ActionState } from "@/lib/action-state";
import { siteSchema } from "@/lib/validation";
import { isNotFound, isUniqueViolation, requireAdminForAction } from "@/server/admin/guard";
import { invalidateSites } from "@/server/admin/invalidate";
import { createSite, deleteSite, rotateSiteAgentToken, updateSite } from "@/server/admin/sites";
import { db } from "@/server/db";
import { influxSourceFor } from "@/server/telemetry/service";
import { TelemetryError } from "@/server/telemetry/types";
import { encryptSecret } from "@/server/crypto";

export async function saveSite(siteId: string | null, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAdminForAction();
  const parsed = siteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  if (parsed.data.telemetrySource === "INFLUXDB" && !parsed.data.influxToken) {
    const hasToken = siteId
      ? Boolean((await db.site.findUnique({ where: { id: siteId }, select: { influxTokenEncrypted: true } }))?.influxTokenEncrypted)
      : false;
    if (!hasToken) {
      return { ...errorState("Revise os campos destacados.", formData), fieldErrors: { influxToken: "Informe o token de leitura" } };
    }
  }

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
      return { ...errorState("Revise os campos destacados.", formData), fieldErrors: { name: "Já existe uma unidade com este nome neste cliente" } };
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

export type ConnectionTestResult = { ok: boolean; message: string; measurements?: string[] };

/**
 * Testa a conexão com os valores que estão no formulário (ainda não salvos).
 * Token em branco na edição = usa o token já gravado da unidade.
 */
export async function testSiteConnection(siteId: string | null, formData: FormData): Promise<ConnectionTestResult> {
  await requireAdminForAction();
  const url = String(formData.get("influxUrl") ?? "").trim().replace(/\/+$/, "");
  const org = String(formData.get("influxOrg") ?? "").trim();
  const bucket = String(formData.get("influxBucket") ?? "").trim();
  const typedToken = String(formData.get("influxToken") ?? "").trim();
  if (!/^https?:\/\//i.test(url) || !org || !bucket) {
    return { ok: false, message: "Preencha URL, organização e bucket antes de testar." };
  }

  let tokenEncrypted = typedToken ? encryptSecret(typedToken) : null;
  if (!tokenEncrypted && siteId) {
    tokenEncrypted = (await db.site.findUnique({ where: { id: siteId }, select: { influxTokenEncrypted: true } }))
      ?.influxTokenEncrypted ?? null;
  }
  if (!tokenEncrypted) return { ok: false, message: "Informe o token para testar." };

  try {
    const source = influxSourceFor({
      telemetrySource: "INFLUXDB",
      influxUrl: url,
      influxOrg: org,
      influxBucket: bucket,
      influxTokenEncrypted: tokenEncrypted,
    });
    const measurements = await source.listMeasurements();
    return {
      ok: true,
      message:
        measurements.length > 0
          ? `Conexão OK. ${measurements.length} measurement(s) com dados nos últimos 30 dias.`
          : "Conexão OK, mas o bucket não tem dados nos últimos 30 dias.",
      measurements,
    };
  } catch (error) {
    return { ok: false, message: error instanceof TelemetryError ? error.message : "Falha inesperada no teste." };
  }
}

export type AgentTokenResult = { ok: true; token: string } | { ok: false; message: string };

/** Gera (ou troca) o token do Painel local. O anterior para de valer na hora. */
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
