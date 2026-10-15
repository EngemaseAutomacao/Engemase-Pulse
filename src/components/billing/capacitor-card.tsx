"use client";

import useSWR from "swr";
import { CircleCheckIcon, InfoIcon, ZapIcon } from "lucide-react";
import { fetchJson } from "@/lib/fetcher";
import { formatMoney, formatNumber } from "@/lib/format";
import type { PowerFactorResponse } from "@/lib/power-factor";
import { POWER_FACTOR_REF } from "@/lib/tariff";

/** Fator de potência da entrada (30 dias), capacitores recomendados e a economia estimada. */
export function CapacitorCard({ tenantSlug, siteId }: { tenantSlug: string; siteId: string }) {
  const { data } = useSWR<PowerFactorResponse>(`/api/tenants/${tenantSlug}/power-factor?site=${siteId}`, fetchJson, {
    revalidateOnFocus: false,
  });
  if (!data || data.noMainMeter || !data.analysis) return null;
  const a = data.analysis;
  const saving =
    data.monthlyCostNow !== null && data.monthlyCostAfter !== null ? data.monthlyCostNow - data.monthlyCostAfter : null;

  return (
    <section aria-labelledby="pf-title" className="surface space-y-4 p-4">
      <div>
        <h2 id="pf-title" className="font-semibold">
          Fator de potência e capacitores
        </h2>
        <p className="text-xs text-muted-foreground">
          Entrada geral, últimos {data.days} dias ({formatNumber(data.coveredDays, 0)} com leitura)
        </p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">FP médio</dt>
          <dd className="font-heading text-2xl font-semibold tabular">
            {a.averagePf === null ? "—" : formatNumber(a.averagePf, 3)}
          </dd>
          <dd className="text-xs text-muted-foreground">
            {formatNumber(a.shareBelow * 100, 0)} % do tempo abaixo de {formatNumber(POWER_FACTOR_REF, 2)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Capacitores recomendados</dt>
          <dd className="font-heading text-2xl font-semibold tabular">
            {a.recommended === null ? "Nenhum" : `${formatNumber(a.recommended, a.recommended % 1 ? 1 : 0)} kVAr`}
          </dd>
          <dd className="text-xs text-muted-foreground">
            {a.recommended === null
              ? "O fator de potência já fica acima de 0,92 quase o tempo todo."
              : `Banco automático em estágios · cobre 95 % do tempo (pico: ${formatNumber(a.max, 0)} kVAr)`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Economia estimada</dt>
          <dd className="font-heading text-2xl font-semibold tabular">
            {saving === null ? "—" : `${formatMoney(saving, true)}/mês`}
          </dd>
          <dd className="text-xs text-muted-foreground">
            {saving === null
              ? data.hasTariff
                ? "Grupo B não paga reativo; corrigir ainda reduz perdas e aquecimento dos cabos."
                : "Cadastre a tarifa para estimar em R$."
              : `Excedente de reativo hoje: ${formatMoney(data.monthlyCostNow, true)}/mês`}
          </dd>
        </div>
      </dl>
      {a.recommended === null && a.shareBelow < 0.05 && (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <CircleCheckIcon className="size-4" aria-hidden />
          Sem necessidade de correção agora.
        </p>
      )}
      {a.capacitiveShare > 0.02 && (
        <p className="flex gap-1.5 text-sm text-warning">
          <ZapIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          Em {formatNumber(a.capacitiveShare * 100, 0)} % do tempo o reativo já é capacitivo (sobra capacitor). Revise
          os capacitores fixos: no Grupo A, reativo capacitivo de madrugada também é cobrado.
        </p>
      )}
      <p className="flex gap-1.5 text-xs text-muted-foreground">
        <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Dimensionamento preliminar pelas médias de 5 min. Antes de instalar, confirme com um técnico e meça as
        harmônicas (THD): com THD alto, o banco precisa de reatores de dessintonia.
        {data.estimatedReactive && " O reativo foi estimado pelo fator de potência (o medidor não envia kVAr)."}
      </p>
    </section>
  );
}
