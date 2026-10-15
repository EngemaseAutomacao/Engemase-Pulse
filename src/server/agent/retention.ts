import "server-only";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";

/**
 * O resumo de 5 min do gateway (medidores, reservatórios e geradores) fica 400 dias (dá para comparar com o
 * mesmo mês do ano anterior); o consumo por hora fica para sempre.
 */
export const READINGS_5M_RETENTION_DAYS = 400;

const PURGE_EVERY_MS = 6 * 3_600_000;

/** Chamado pelo avaliador periódico; apaga no máximo a cada 6 h. Devolve as linhas apagadas. */
export async function purgeOldAgentReadings(now = Date.now()): Promise<number> {
  if (!(await getCache().acquire("agent:purge", PURGE_EVERY_MS))) return 0;
  const cutoff = new Date(now - READINGS_5M_RETENTION_DAYS * 86_400_000);
  const [meters, utilities] = await Promise.all([
    db.meterReading5m.deleteMany({ where: { ts: { lt: cutoff } } }),
    db.utilityReading5m.deleteMany({ where: { ts: { lt: cutoff } } }),
  ]);
  return meters.count + utilities.count;
}
