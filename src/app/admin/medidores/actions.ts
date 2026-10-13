"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, validationError, type ActionState } from "@/lib/action-state";
import { meterSchema } from "@/lib/validation";
import { isNotFound, isUniqueViolation, requireAdminForAction } from "@/server/admin/guard";
import { invalidateSites } from "@/server/admin/invalidate";
import { createMeter, deleteMeter, updateMeter } from "@/server/admin/meters";
import { db } from "@/server/db";
import { influxSourceFor } from "@/server/telemetry/service";
import { TelemetryError } from "@/server/telemetry/types";
import type { ConnectionTestResult } from "@/app/admin/unidades/actions";

export async function saveMeter(meterId: string | null, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAdminForAction();
  const parsed = meterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  let createdId: string;
  try {
    if (meterId) {
      const previous = await db.meter.findUnique({ where: { id: meterId }, select: { siteId: true } });
      await updateMeter(actor, meterId, parsed.data);
      // O medidor pode ter mudado de unidade (e até de cliente): limpa as duas.
      await invalidateSites([parsed.data.siteId, previous?.siteId]);
      revalidatePath("/admin", "layout");
      revalidatePath("/app", "layout");
      return { status: "success", message: "Medidor salvo." };
    }
    createdId = (await createMeter(actor, parsed.data)).id;
    await invalidateSites([parsed.data.siteId]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ...errorState("Revise os campos destacados.", formData), fieldErrors: { tag: "Já existe um medidor com esta TAG nesta unidade" } };
    }
    if (isNotFound(error)) return errorState("Este medidor não existe mais.");
    throw error;
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/app", "layout");
  redirect(`/admin/medidores/${createdId}`);
}

/** Measurements existentes no InfluxDB da unidade, para ajudar a preencher o cadastro. */
export async function listSiteMeasurements(siteId: string): Promise<ConnectionTestResult> {
  await requireAdminForAction();
  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) return { ok: false, message: "Unidade não encontrada." };
  if (site.telemetrySource === "SIMULATED") {
    return { ok: true, message: "Unidade simulada: qualquer nome de measurement funciona.", measurements: [] };
  }
  try {
    const measurements = await influxSourceFor(site).listMeasurements();
    return { ok: true, message: `${measurements.length} measurement(s) encontrados.`, measurements };
  } catch (error) {
    return { ok: false, message: error instanceof TelemetryError ? error.message : "Falha ao consultar o InfluxDB." };
  }
}

export async function removeMeter(meterId: string): Promise<void> {
  const actor = await requireAdminForAction();
  const meter = await deleteMeter(actor, meterId);
  await invalidateSites([meter.siteId]);
  revalidatePath("/admin", "layout");
  revalidatePath("/app", "layout");
  redirect("/admin/medidores");
}
