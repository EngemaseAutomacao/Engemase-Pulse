import "server-only";
import { createHash } from "node:crypto";
import { normalizeErrorMessage, normalizeErrorPath, truncate } from "@/lib/error-report";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";

export type ErrorSource = "servidor" | "navegador" | "tarefa";

export type ErrorReport = {
  source: ErrorSource;
  message: string;
  path?: string | null;
  digest?: string | null;
  detail?: string | null;
};

/** Erros guardados por 30 dias (a tela de saúde mostra os recentes). */
export const ERROR_RETENTION_DAYS = 30;
/** A mesma falha em rajada é gravada no máximo a cada 10 s (conta como uma ocorrência). */
const SAME_ERROR_EVERY_MS = 10_000;

/**
 * Registra um erro para a tela "Saúde do sistema". Nunca lança: registrar um
 * erro não pode causar outro.
 */
export async function recordError(report: ErrorReport): Promise<void> {
  try {
    const message = normalizeErrorMessage(report.message || "Erro sem mensagem");
    const path = normalizeErrorPath(report.path);
    const fingerprint = createHash("sha1")
      .update(`${report.source}|${message}|${path ?? ""}`)
      .digest("hex");
    if (!(await getCache().acquire(`error:${fingerprint}`, SAME_ERROR_EVERY_MS))) return;
    const now = new Date();
    await db.errorLog.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        source: report.source,
        message,
        path,
        digest: truncate(report.digest, 100),
        detail: truncate(report.detail, 2000),
      },
      update: {
        count: { increment: 1 },
        lastSeenAt: now,
        digest: truncate(report.digest, 100),
        detail: truncate(report.detail, 2000),
      },
    });
  } catch (error) {
    console.error("[erros] falha ao registrar", error);
  }
}

/** Erro capturado no nosso código (catch que segue em frente): log + registro. */
export function reportCaught(source: ErrorSource, where: string, error: unknown): void {
  console.error(`[${where}]`, error);
  void recordError({
    source,
    message: error instanceof Error ? `${where}: ${error.message}` : `${where}: ${String(error)}`,
    path: where,
    detail: error instanceof Error ? error.stack : null,
  });
}

export async function purgeOldErrors(now = Date.now()): Promise<number> {
  if (!(await getCache().acquire("errors:purge", 6 * 3_600_000))) return 0;
  const { count } = await db.errorLog.deleteMany({
    where: { lastSeenAt: { lt: new Date(now - ERROR_RETENTION_DAYS * 86_400_000) } },
  });
  return count;
}
