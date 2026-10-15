import "server-only";
import { after } from "next/server";
import { purgeOldAgentReadings } from "@/server/agent/retention";
import { checkAnomalies } from "@/server/alarms/anomaly";
import { checkDemandOverruns } from "@/server/alarms/demand";
import { checkEscalations } from "@/server/alarms/escalation";
import { evaluateAllTenants, type EvaluationSummary } from "@/server/alarms/engine";
import { checkSiteHeartbeats, type HeartbeatResult } from "@/server/alarms/heartbeat";
import { getCache } from "@/server/cache";
import { closeStaleDemandForecasts } from "@/server/demand-now";
import { purgeOldErrors, reportCaught } from "@/server/errors";
import { sendMonthlyReports } from "@/server/monthly-report";
import { checkTargets } from "@/server/targets";

/**
 * Tarefas periódicas: regras de alarme da nuvem, lojas sem comunicação,
 * ultrapassagem de demanda, consumo fora do padrão, metas, escalonamento,
 * resumo mensal por e-mail e limpeza do histórico antigo. Cada uma tem a
 * própria trava de intervalo (umas rodam a cada minuto, outras a cada hora).
 *
 * Rodam pelo agendador (/api/cron/alarms, chamado pelo QStash, Cron da Vercel
 * ou GitHub Actions) e também "de carona" no tráfego normal: cada envio do
 * Painel e cada atualização de tela pede uma rodada, no máximo uma por minuto
 * no sistema todo. Assim os alarmes funcionam mesmo sem agendador; ele só
 * garante a detecção quando nenhuma loja envia e ninguém está olhando.
 */

export type HousekeepingResult = {
  alarms: EvaluationSummary;
  heartbeat: HeartbeatResult;
  purgedReadings: number;
};

const TICK_KEY = "housekeeping:tick";
const SCHEDULER_SEEN_KEY = "housekeeping:scheduler-seen";
const TICK_EVERY_MS = 60_000;
/** Na carona, o orçamento é menor: a rodada não pode segurar a função por muito tempo. */
const PIGGYBACK_BUDGET_MS = 20_000;

export async function runHousekeeping(budgetMs?: number): Promise<HousekeepingResult> {
  const [alarms, heartbeat] = await Promise.all([evaluateAllTenants(budgetMs), checkSiteHeartbeats()]);
  const purgedReadings = await purgeOldAgentReadings().catch((error: unknown) => {
    reportCaught("tarefa", "limpeza do histórico", error);
    return 0;
  });
  await purgeOldErrors().catch((error: unknown) => reportCaught("tarefa", "limpeza dos erros", error));
  await checkDemandOverruns().catch((error: unknown) => reportCaught("tarefa", "verificação de demanda", error));
  await closeStaleDemandForecasts().catch((error: unknown) => reportCaught("tarefa", "previsão de demanda", error));
  await checkEscalations().catch((error: unknown) => reportCaught("tarefa", "escalonamento", error));
  await checkAnomalies().catch((error: unknown) => reportCaught("tarefa", "consumo fora do padrão", error));
  await checkTargets().catch((error: unknown) => reportCaught("tarefa", "metas", error));
  await sendMonthlyReports().catch((error: unknown) => reportCaught("tarefa", "resumo mensal", error));
  return { alarms, heartbeat, purgedReadings };
}

/** Registra que o agendador externo chamou (a tela de saúde mostra se ele está ativo). */
export async function markSchedulerRun(): Promise<void> {
  await getCache().set(SCHEDULER_SEEN_KEY, new Date().toISOString(), 7 * 86_400_000);
}

/** Última chamada do agendador externo, ou null se nunca chamou (nesta semana). */
export function getSchedulerLastRun(): Promise<string | null> {
  return getCache().get<string>(SCHEDULER_SEEN_KEY);
}

/** Pede uma rodada depois de responder; não atrasa a resposta. */
export function scheduleHousekeeping(): void {
  after(async () => {
    if (!(await getCache().acquire(TICK_KEY, TICK_EVERY_MS))) return;
    try {
      await runHousekeeping(PIGGYBACK_BUDGET_MS);
    } catch (error) {
      reportCaught("tarefa", "tarefas periódicas", error);
    }
  });
}
