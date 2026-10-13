"use client";

import useSWR from "swr";
import { LIVE_REFRESH_MS } from "@/config/app";
import { fetchJson } from "@/lib/fetcher";
import type { LiveSnapshot } from "@/lib/telemetry-types";

/**
 * Leituras ao vivo, atualizadas a cada LIVE_REFRESH_MS (pausa com a aba oculta).
 *  - sem opções: resumo de todos os medidores (painel e tabela dividem o mesmo cache);
 *  - `meterId`: um medidor com todos os campos (página de detalhe).
 */
export function useLive(tenantSlug: string, options: { meterId?: string } = {}) {
  const query = options.meterId ? `?meter=${encodeURIComponent(options.meterId)}` : "?view=summary";
  return useSWR<LiveSnapshot>(`/api/tenants/${tenantSlug}/live${query}`, fetchJson, {
    refreshInterval: LIVE_REFRESH_MS,
    revalidateOnFocus: true,
    dedupingInterval: 2_000,
    keepPreviousData: true,
  });
}
