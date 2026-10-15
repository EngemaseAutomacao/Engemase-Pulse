import "server-only";
import { describeRule, evaluateRule, type Severity } from "@/lib/alarms";
import { getCache } from "@/server/cache";
import { reportCaught } from "@/server/errors";
import { db } from "@/server/db";
import { getSiteLive } from "@/server/telemetry/live";
import { statusOf } from "@/server/telemetry/service";
import { getTenantTopology } from "@/server/telemetry/topology";
import { RENOTIFY_AFTER_MS, notifyAlarms } from "./notify";
import { getAlarmState, listTenantsWithRules, openKeyOf, saveAlarmState } from "./state";
/** Quantos clientes avaliar ao mesmo tempo. */
const CONCURRENCY = 6;
/** Tempo máximo de uma execução; o que sobrar fica para a próxima (em rodízio). */
const DEFAULT_BUDGET_MS = 45_000;

const CURSOR_KEY = "alarm:cursor:v1";
const LAST_RUN_KEY = "alarm:last-run:v1";
const RUN_LOCK_KEY = "lock:alarm-run";
const SESSION_CLEANUP_KEY = "lock:session-cleanup";

export type TenantResult = { opened: number; cleared: number; notified: number };

export type EvaluationSummary = TenantResult & {
  tenants: number;
  evaluated: number;
  /** Clientes que ficaram para a próxima execução por falta de tempo. */
  deferred: number;
  skippedBecauseRunning?: boolean;
};

export type EvaluatorStatus = EvaluationSummary & { at: string; durationMs: number };

/**
 * Avalia as regras de todos os clientes. Feito para ser chamado a cada poucos
 * minutos: em regime normal não consulta o Postgres (estado e leituras vêm do
 * cache) e processa vários clientes em paralelo, dentro de um orçamento de tempo.
 */
export async function evaluateAllTenants(budgetMs = DEFAULT_BUDGET_MS): Promise<EvaluationSummary> {
  const cache = getCache();
  const startedAt = Date.now();
  const empty: EvaluationSummary = { tenants: 0, evaluated: 0, deferred: 0, opened: 0, cleared: 0, notified: 0 };

  // Duas execuções ao mesmo tempo (reenvio do agendador, clique manual) não se atropelam.
  if (!(await cache.acquire(RUN_LOCK_KEY, budgetMs + 15_000))) return { ...empty, skippedBecauseRunning: true };

  try {
    const tenantIds = await listTenantsWithRules();
    const cursor = ((await cache.get<number>(CURSOR_KEY)) ?? 0) % Math.max(tenantIds.length, 1);
    const queue = [...tenantIds.slice(cursor), ...tenantIds.slice(0, cursor)];
    const summary: EvaluationSummary = { ...empty, tenants: tenantIds.length };

    let next = 0;
    const worker = async () => {
      while (next < queue.length && Date.now() - startedAt < budgetMs) {
        const tenantId = queue[next++];
        try {
          const result = await evaluateTenant(tenantId);
          summary.opened += result.opened;
          summary.cleared += result.cleared;
          summary.notified += result.notified;
        } catch (error) {
          reportCaught("tarefa", "avaliação de alarmes", error);
        }
        summary.evaluated++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

    summary.deferred = queue.length - summary.evaluated;
    if (tenantIds.length > 0) await cache.set(CURSOR_KEY, (cursor + summary.evaluated) % tenantIds.length, 86_400_000);
    await cleanupExpiredSessions();

    const status: EvaluatorStatus = { ...summary, at: new Date().toISOString(), durationMs: Date.now() - startedAt };
    await cache.set(LAST_RUN_KEY, status, 7 * 86_400_000);
    return summary;
  } finally {
    await cache.del(RUN_LOCK_KEY);
  }
}

/** Sem rodar há mais que isso, o avaliador é considerado parado. */
const EVALUATOR_STALE_MS = 20 * 60_000;

/** Última execução do avaliador e se ele parece parado (para a administração vigiar). */
export async function getEvaluatorHealth(): Promise<{ status: EvaluatorStatus | null; stale: boolean }> {
  const status = await getCache().get<EvaluatorStatus>(LAST_RUN_KEY);
  return { status, stale: !status || Date.now() - Date.parse(status.at) > EVALUATOR_STALE_MS };
}

/** Avalia um cliente: abre, mantém ou fecha alarmes e notifica os novos. */
export async function evaluateTenant(tenantId: string): Promise<TenantResult> {
  const cache = getCache();
  const lock = `lock:alarm-eval:${tenantId}`;
  if (!(await cache.acquire(lock, 30_000))) return { opened: 0, cleared: 0, notified: 0 };

  try {
    const state = await getAlarmState(tenantId);
    if (!state.tenant.active || state.rules.length === 0) return { opened: 0, cleared: 0, notified: 0 };

    const sites = await getTenantTopology(tenantId);
    const lives = new Map(await Promise.all(sites.map(async (site) => [site.id, await getSiteLive(site)] as const)));
    const meters = sites.flatMap((site) => site.meters.map((meter) => ({ ...meter, siteName: site.name })));
    const now = Date.now();

    const toClear: { key: string; id: string }[] = [];
    const toOpen: { key: string; ruleId: string; meterId: string; severity: Severity; title: string; message: string; value: number | null }[] = [];

    for (const rule of state.rules) {
      const targets = rule.meterId ? meters.filter((m) => m.id === rule.meterId) : meters;
      for (const meter of targets) {
        const live = lives.get(meter.siteId);
        const reading = live?.readings[meter.id];
        const current = reading ? { ...reading, status: statusOf(reading.time, now) } : undefined;
        const evaluation = evaluateRule(rule, current, live?.error ?? undefined, now);
        const key = openKeyOf(rule.id, meter.id);
        const openId = state.open[key];
        if (evaluation.state === "triggered" && !openId) {
          toOpen.push({
            key,
            ruleId: rule.id,
            meterId: meter.id,
            severity: rule.severity,
            title: `${meter.tag} — ${rule.name}`,
            message: `${describeRule(rule)}. ${evaluation.detail}. ${meter.name} · ${meter.siteName}`,
            value: evaluation.value,
          });
        } else if (evaluation.state === "normal" && openId) {
          toClear.push({ key, id: openId });
        }
      }
    }

    // Nada mudou: nenhuma consulta ao banco nesta rodada.
    if (toOpen.length === 0 && toClear.length === 0) return { opened: 0, cleared: 0, notified: 0 };

    if (toClear.length > 0) {
      await db.alarm.updateMany({
        where: { id: { in: toClear.map((c) => c.id) }, clearedAt: null },
        data: { clearedAt: new Date(now), openKey: null },
      });
      for (const { key } of toClear) delete state.open[key];
    }

    let notified = 0;
    let opened = 0;
    if (toOpen.length > 0) {
      // A coluna única open_key garante um único alarme aberto por regra+medidor;
      // só as linhas realmente inseridas voltam (e só elas notificam).
      const created = await db.alarm.createManyAndReturn({
        data: toOpen.map(({ key, ruleId, meterId, severity, title, message, value }) => ({
          tenantId,
          ruleId,
          meterId,
          severity,
          title,
          message,
          value,
          openKey: key,
        })),
        skipDuplicates: true,
      });
      opened = created.length;
      for (const alarm of created) state.open[alarm.openKey!] = alarm.id;

      // Alguma já estava aberta no banco (cache divergente): sincroniza.
      if (created.length < toOpen.length) {
        const existing = await db.alarm.findMany({
          where: { openKey: { in: toOpen.map((o) => o.key) } },
          select: { id: true, openKey: true },
        });
        for (const alarm of existing) state.open[alarm.openKey!] = alarm.id;
      }

      notified = await notifyNewAlarms(state.tenant, created, now);
    }

    await saveAlarmState(state);
    return { opened, cleared: toClear.length, notified };
  } finally {
    await cache.del(lock);
  }
}

async function notifyNewAlarms(
  tenant: { id: string; slug: string; name: string },
  alarms: { ruleId: string | null; meterId: string | null; severity: Severity; title: string; message: string }[],
  now: number,
): Promise<number> {
  const recentlyCleared = await db.alarm.findMany({
    where: { tenantId: tenant.id, ruleId: { not: null }, clearedAt: { gte: new Date(now - RENOTIFY_AFTER_MS) } },
    select: { ruleId: true, meterId: true },
  });
  const quiet = new Set(recentlyCleared.map((a) => `${a.ruleId}:${a.meterId}`));
  return notifyAlarms(
    tenant,
    alarms
      .filter((alarm) => !quiet.has(`${alarm.ruleId}:${alarm.meterId}`))
      .map((alarm) => ({ ...alarm, tag: `alarm-${alarm.ruleId}-${alarm.meterId}` })),
  );
}

/** Faxina de sessões vencidas, no máximo a cada 6 h (não acorda o banco a cada execução). */
async function cleanupExpiredSessions(): Promise<void> {
  if (!(await getCache().acquire(SESSION_CLEANUP_KEY, 6 * 3_600_000))) return;
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
