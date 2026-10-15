import "server-only";
import type { RuleDefinition, Severity } from "@/lib/alarms";
import { cached, configTtlMs, getCache } from "@/server/cache";
import { db } from "@/server/db";

/**
 * Estado de alarmes de cada cliente guardado no cache: regras ativas e alarmes
 * abertos. Com ele, o avaliador roda sem consultar o Postgres enquanto nada muda
 * — o banco só é usado quando um alarme abre/normaliza ou o cache é reconstruído.
 *
 * O Postgres continua sendo a fonte oficial: se o cache sumir ou divergir, ele é
 * recarregado do banco; e a coluna única `open_key` impede alarmes duplicados.
 */

export type RuleSnapshot = RuleDefinition & { id: string; name: string; meterId: string | null; severity: Severity };

export type AlarmState = {
  tenant: { id: string; slug: string; name: string; active: boolean };
  rules: RuleSnapshot[];
  /** Alarmes abertos: chave "regra:medidor" → id do alarme. */
  open: Record<string, string>;
};

const stateKey = (tenantId: string) => `alarm:state:v1:${tenantId}`;
const TENANTS_KEY = "alarm:tenants:v1";

export const openKeyOf = (ruleId: string, meterId: string) => `${ruleId}:${meterId}`;

export function getAlarmState(tenantId: string): Promise<AlarmState> {
  return cached(stateKey(tenantId), configTtlMs(), () => loadAlarmState(tenantId));
}

export async function saveAlarmState(state: AlarmState): Promise<void> {
  await getCache().set(stateKey(state.tenant.id), state, configTtlMs());
}

/** Chamar sempre que regras, cliente ou alarmes abertos mudarem fora do avaliador. */
export async function invalidateAlarmState(...tenantIds: string[]): Promise<void> {
  await getCache().del(TENANTS_KEY, ...tenantIds.map(stateKey));
}

/** Clientes ativos com ao menos uma regra ativa. */
export function listTenantsWithRules(): Promise<string[]> {
  return cached(TENANTS_KEY, configTtlMs(), async () => {
    const tenants = await db.tenant.findMany({
      where: { active: true, alarmRules: { some: { enabled: true } } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    return tenants.map((t) => t.id);
  });
}

export async function loadAlarmState(tenantId: string): Promise<AlarmState> {
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      id: true,
      slug: true,
      name: true,
      active: true,
      alarmRules: {
        where: { enabled: true },
        select: { id: true, name: true, meterId: true, kind: true, field: true, comparison: true, threshold: true, severity: true },
      },
      alarms: { where: { clearedAt: null }, select: { id: true, ruleId: true, meterId: true } },
    },
  });
  return {
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, active: tenant.active },
    rules: tenant.alarmRules,
    open: Object.fromEntries(
      // Só os das regras da nuvem; os do gateway são sincronizados pelo envio da unidade.
      tenant.alarms.flatMap((a) => (a.ruleId && a.meterId ? [[openKeyOf(a.ruleId, a.meterId), a.id]] : [])),
    ),
  };
}
