import "server-only";
import { cached, getCache } from "@/server/cache";
import type { SiteTopology } from "./topology";
import { TelemetryError, type Reading } from "./types";
import { sourceFor, toMeterRef } from "./sources";

/**
 * Última leitura de todos os medidores de uma unidade, em cache por alguns
 * segundos. Com muitas pessoas olhando o mesmo cliente (e o avaliador de
 * alarmes), a última leitura do Painel é buscada uma vez por unidade por intervalo.
 */
export const LIVE_CACHE_TTL_MS = 5_000;

export type SiteLive = {
  /** Por id do medidor. */
  readings: Record<string, Reading>;
  /** Mensagem pronta para a tela quando a consulta falhou. */
  error: string | null;
  fetchedAt: string;
};

const liveKey = (siteId: string) => `live:v1:${siteId}`;

export function getSiteLive(site: SiteTopology): Promise<SiteLive> {
  return cached(liveKey(site.id), LIVE_CACHE_TTL_MS, async () => {
    const fetchedAt = new Date().toISOString();
    if (site.meters.length === 0) return { readings: {}, error: null, fetchedAt };
    try {
      const readings = await sourceFor(site).latest(site.meters.map(toMeterRef));
      return { readings: Object.fromEntries(readings), error: null, fetchedAt };
    } catch (error) {
      // Erros também ficam em cache: uma falha não é repetida por todas as telas ao mesmo tempo.
      if (!(error instanceof TelemetryError)) console.error("[telemetria]", error);
      const message = error instanceof TelemetryError ? error.message : "Falha inesperada ao consultar as leituras";
      return { readings: {}, error: message, fetchedAt };
    }
  });
}

export async function invalidateSiteLive(...siteIds: string[]): Promise<void> {
  await getCache().del(...siteIds.map(liveKey));
}
