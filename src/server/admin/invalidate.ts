import "server-only";
import { invalidateAgentMeterIndex } from "@/server/agent/meters";
import { invalidateAlarmState } from "@/server/alarms/state";
import { db } from "@/server/db";
import { invalidateSiteLive } from "@/server/telemetry/live";
import { invalidateTenantTopology } from "@/server/telemetry/topology";

/**
 * Depois de alterar unidades ou medidores: limpa os caches que dependem deles
 * (cadastro em cache, leituras da unidade e estado dos alarmes do cliente).
 */
export async function invalidateSites(siteIds: (string | null | undefined)[], knownTenantIds: string[] = []) {
  const ids = [...new Set(siteIds.filter((id): id is string => Boolean(id)))];
  const sites = ids.length > 0 ? await db.site.findMany({ where: { id: { in: ids } }, select: { tenantId: true } }) : [];
  const tenantIds = [...new Set([...knownTenantIds, ...sites.map((s) => s.tenantId)])];
  await Promise.all([
    invalidateSiteLive(...ids),
    invalidateAgentMeterIndex(...ids),
    invalidateTenantTopology(...tenantIds),
    invalidateAlarmState(...tenantIds),
  ]);
}

/** Depois de alterar ou excluir um cliente. */
export async function invalidateTenant(tenantId: string) {
  await Promise.all([invalidateTenantTopology(tenantId), invalidateAlarmState(tenantId)]);
}
