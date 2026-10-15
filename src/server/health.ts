import "server-only";
import { getEvaluatorHealth } from "@/server/alarms/engine";
import { SITE_OFFLINE_AFTER_MS } from "@/server/alarms/heartbeat";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";
import { getSchedulerLastRun } from "@/server/housekeeping";
import { appUrl, isEmailConfigured } from "@/server/email";
import { isPushConfigured } from "@/server/push";
import { isTelegramConfigured } from "@/server/telegram";

/** Situação do sistema para a tela "Saúde do sistema" e o resumo da administração. */

/** off: recurso opcional não configurado (não conta como problema). */
export type CheckStatus = "ok" | "warn" | "off";

export type HealthCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** O que fazer para resolver (quando não está ok). */
  fix?: string;
};

export type StoreState = "sending" | "late" | "offline" | "waiting";

export type StoreHealth = {
  siteId: string;
  siteName: string;
  tenantName: string;
  lastSeenAt: string | null;
  state: StoreState;
  version: string | null;
};

/** Agendador externo chamando há menos que isso = ativo (ele roda a cada 5 min). */
const SCHEDULER_OK_MS = 15 * 60_000;
/** Tarefas periódicas (carona ou agendador) há menos que isso = em dia. */
const TASKS_OK_MS = 10 * 60_000;
/** Envio do Painel há mais que isso = atrasado (ele envia a cada 10 s). */
const STORE_LATE_MS = 2 * 60_000;

export async function getSystemHealth() {
  const now = Date.now();
  const [schedulerLastRun, evaluator, sites, subscriptions, errors24h, telegramUsers] = await Promise.all([
    getSchedulerLastRun(),
    getEvaluatorHealth(),
    db.site.findMany({
      where: { agentTokenHash: { not: null } },
      orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, agentLastSeenAt: true, agentInfo: true, tenant: { select: { name: true } } },
    }),
    db.pushSubscription.count(),
    db.errorLog.count({ where: { lastSeenAt: { gte: new Date(now - 86_400_000) } } }),
    db.user.count({ where: { telegramChatId: { not: null } } }),
  ]);

  const stores: StoreHealth[] = sites.map((s) => {
    const seen = s.agentLastSeenAt?.getTime() ?? null;
    const age = seen === null ? null : now - seen;
    const info = (s.agentInfo ?? {}) as { versao?: unknown };
    return {
      siteId: s.id,
      siteName: s.name,
      tenantName: s.tenant.name,
      lastSeenAt: s.agentLastSeenAt?.toISOString() ?? null,
      state:
        age === null ? "waiting" : age > SITE_OFFLINE_AFTER_MS ? "offline" : age > STORE_LATE_MS ? "late" : "sending",
      version: typeof info.versao === "string" ? info.versao : null,
    };
  });

  const push = isPushConfigured();
  const shared = getCache().shared;
  const schedulerAge = schedulerLastRun ? now - Date.parse(schedulerLastRun) : null;
  const tasksAt = evaluator.status?.at ?? null;
  const tasksAge = tasksAt ? now - Date.parse(tasksAt) : null;

  const checks: HealthCheck[] = [
    push
      ? {
          key: "push",
          label: "Notificações no celular",
          status: "ok",
          detail: `Ativas · ${subscriptions} aparelho(s) cadastrado(s)`,
        }
      : {
          key: "push",
          label: "Notificações no celular",
          status: "warn",
          detail: "Desativadas: faltam as chaves VAPID. Ninguém recebe aviso de alarme no celular.",
          fix: "Gere as chaves com `npx web-push generate-vapid-keys` e cadastre NEXT_PUBLIC_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nas variáveis de ambiente da Vercel; depois faça um novo deploy.",
        },
    shared
      ? { key: "cache", label: "Cache compartilhado (Redis)", status: "ok", detail: "Upstash Redis conectado" }
      : {
          key: "cache",
          label: "Cache compartilhado (Redis)",
          status: "warn",
          detail:
            "Sem Redis: a leitura ao vivo de cada loja é gravada no banco a cada 10 s e cada servidor tem o próprio cache.",
          fix: "Na Vercel: Storage → Upstash (Redis) → criar e conectar ao projeto; as variáveis (KV_REST_API_URL e KV_REST_API_TOKEN) entram sozinhas. Depois, um novo deploy.",
        },
    schedulerAge !== null && schedulerAge < SCHEDULER_OK_MS
      ? { key: "scheduler", label: "Agendador externo", status: "ok", detail: `Chamou às ${time(schedulerLastRun!)}` }
      : {
          key: "scheduler",
          label: "Agendador externo",
          status: "warn",
          detail: schedulerLastRun
            ? `Não chama desde ${time(schedulerLastRun)}.`
            : "Nunca chamou. Os alarmes rodam junto com os envios das lojas e com quem está usando o sistema; sem agendador, uma loja parada só é percebida quando outra loja envia ou alguém abre uma tela.",
          fix: "Crie no Upstash QStash um agendamento a cada 5 min para /api/cron/alarms (passo a passo no README, seção “Agendador”).",
        },
    tasksAge !== null && tasksAge < TASKS_OK_MS
      ? {
          key: "tasks",
          label: "Alarmes e verificação das lojas",
          status: "ok",
          detail: `Última rodada às ${time(tasksAt!)} · ${evaluator.status!.opened} aberto(s), ${evaluator.status!.cleared} normalizado(s)`,
        }
      : {
          key: "tasks",
          label: "Alarmes e verificação das lojas",
          status: "warn",
          detail: tasksAt ? `Última rodada às ${time(tasksAt)}.` : `Ainda não rodou${shared ? "" : " neste servidor"}.`,
          fix: "Rodam a cada envio de loja e pelo agendador. Se nenhuma loja está enviando, configure o agendador.",
        },
    isEmailConfigured()
      ? {
          key: "email",
          label: "E-mail (senha e convites)",
          status: "ok",
          detail: `Ativo · links apontam para ${appUrl() ?? "?"}`,
        }
      : {
          key: "email",
          label: "E-mail (senha e convites)",
          status: "warn",
          detail: appUrl()
            ? "Desativado: “Esqueci minha senha” não funciona e os convites mostram um link para repassar à pessoa."
            : "Desativado, e sem o endereço público do sistema os links de senha e convite não podem ser gerados.",
          fix: "Crie uma conta no Resend, verifique o domínio de envio e cadastre RESEND_API_KEY e EMAIL_FROM (ex.: Engemase Pulse <nao-responda@seudominio.com.br>) na Vercel. Se usar domínio próprio, cadastre também APP_URL.",
        },
    isTelegramConfigured()
      ? {
          key: "telegram",
          label: "Telegram (opcional)",
          status: "ok",
          detail: `Ativo · ${telegramUsers} pessoa(s) conectada(s)`,
        }
      : {
          key: "telegram",
          label: "Telegram (opcional)",
          status: "off",
          detail: "Não configurado: os alarmes chegam por push e e-mail.",
          fix: "No Telegram, fale com o @BotFather, crie um bot (/newbot) e cadastre o token em TELEGRAM_BOT_TOKEN na Vercel; depois, um novo deploy. Cada pessoa conecta a conta em Minha conta → Avisos.",
        },
    errors24h === 0
      ? { key: "errors", label: "Erros nas últimas 24 h", status: "ok", detail: "Nenhum" }
      : {
          key: "errors",
          label: "Erros nas últimas 24 h",
          status: "warn",
          detail: `${errors24h} tipo(s) de erro — veja a lista abaixo.`,
        },
  ];

  const problems = checks.filter((c) => c.status === "warn").length + stores.filter((s) => s.state === "offline").length;
  return { checks, stores, problems };
}

function time(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}
