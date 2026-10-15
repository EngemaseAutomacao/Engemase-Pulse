"use client";

import useSWR from "swr";
import { CircleCheckIcon, GaugeIcon, OctagonAlertIcon, TriangleAlertIcon } from "lucide-react";
import { fetchJson } from "@/lib/fetcher";
import { formatNumber } from "@/lib/format";
import { DEMAND_TOLERANCE } from "@/lib/tariff";
import { cn } from "@/lib/utils";
import type { SiteDemandNow } from "@/lib/demand-forecast";

const STATUS = {
  ok: { label: "Dentro da contratada", icon: CircleCheckIcon, text: "text-success", bar: "bg-success" },
  near: { label: "Perto da contratada", icon: TriangleAlertIcon, text: "text-warning", bar: "bg-warning" },
  over: { label: "Vai passar da tolerância", icon: OctagonAlertIcon, text: "text-destructive", bar: "bg-destructive" },
  unknown: { label: "Sem leitura agora", icon: GaugeIcon, text: "text-muted-foreground", bar: "bg-muted-foreground" },
} as const;

const PERIOD_LABEL = { peak: "na ponta", offPeak: "fora ponta", single: "" } as const;

/**
 * "Demanda agora": média projetada da janela de 15 min em andamento contra a
 * contratada, por unidade com tarifa verde ou azul. Não mostra nada se o
 * cliente não tem unidade com demanda contratada.
 */
export function DemandNow({
  tenantSlug,
  siteId,
  size = "default",
  className,
}: {
  tenantSlug: string;
  siteId?: string;
  size?: "default" | "large";
  className?: string;
}) {
  const { data } = useSWR<{ sites: SiteDemandNow[] }>(
    `/api/tenants/${tenantSlug}/demand${siteId ? `?site=${siteId}` : ""}`,
    fetchJson,
    { refreshInterval: 30_000, keepPreviousData: true },
  );
  const all = data?.sites ?? [];
  if (all.length === 0) return null;
  // Muitas unidades: só as perto do limite ganham cartão; as demais viram uma linha de resumo.
  const compact = !siteId && all.length > 2;
  const sites = compact ? all.filter((s) => s.status === "near" || s.status === "over") : all;
  const calm = all.length - sites.length;
  return (
    <section aria-label="Demanda agora" className={cn("grid gap-3", sites.length > 1 && "lg:grid-cols-2", className)}>
      {sites.map((site) => (
        <DemandCard key={site.siteId} demand={site} showSite={!siteId} size={size} />
      ))}
      {compact && calm > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground lg:col-span-2">
          <CircleCheckIcon className="size-4 text-success" aria-hidden />
          Demanda agora: {sites.length === 0 ? `as ${all.length} unidades` : `${calm} unidade(s)`} dentro da contratada.
        </p>
      )}
    </section>
  );
}

export function DemandCard({
  demand,
  showSite,
  size = "default",
}: {
  demand: SiteDemandNow;
  showSite: boolean;
  size?: "default" | "large";
}) {
  const status = STATUS[demand.status];
  const Icon = status.icon;
  const contracted = demand.contracted ?? 0;
  const limit = contracted * (1 + DEMAND_TOLERANCE);
  const scale = Math.max(contracted * 1.25, (demand.projected ?? 0) * 1.05, 1);
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const remaining = Math.max(0, Math.ceil(15 - demand.elapsedMin));
  const time = (t: number) =>
    new Date(t).toLocaleTimeString("pt-BR", { timeZone: demand.timeZone, hour: "2-digit", minute: "2-digit" });
  const large = size === "large";

  return (
    <div className={cn("surface space-y-3 p-4", large && "space-y-5 p-6")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={cn("font-semibold", large && "text-2xl")}>
          Demanda agora{showSite ? ` — ${demand.siteName}` : ""}
        </h2>
        <span className={cn("flex items-center gap-1.5 text-sm font-medium", status.text, large && "text-lg")}>
          <Icon className={cn("size-4", large && "size-6")} aria-hidden />
          {status.label}
        </span>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn("font-heading text-3xl font-semibold tabular", large && "text-6xl")}>
          {demand.projected === null ? "—" : formatNumber(demand.projected, 0)}
        </span>
        <span className={cn("text-sm text-muted-foreground", large && "text-xl")}>
          kW projetados de {formatNumber(contracted, 0)} kW contratados {PERIOD_LABEL[demand.period]}
        </span>
      </p>
      <div className={cn("relative h-3 rounded-full bg-muted", large && "h-5")} role="presentation">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-[width]", status.bar)}
          style={{ width: pct(demand.projected ?? 0) }}
        />
        <div className="absolute -inset-y-1 w-0.5 bg-foreground" style={{ left: pct(contracted) }} title="Contratada" />
        <div
          className="absolute -inset-y-1 w-0 border-l-2 border-dashed border-foreground/60"
          style={{ left: pct(limit) }}
          title="Tolerância (5 %)"
        />
      </div>
      <p className={cn("text-xs text-muted-foreground", large && "text-base")}>
        Janela {time(demand.windowStart)}–{time(demand.windowEnd)} · faltam {remaining} min
        {demand.currentKw !== null && ` · agora ${formatNumber(demand.currentKw, 0)} kW`}
        {demand.averageSoFar !== null && ` · média até aqui ${formatNumber(demand.averageSoFar, 0)} kW`}
        {" · "}linha cheia: contratada; tracejada: tolerância de {formatNumber(limit, 0)} kW
      </p>
    </div>
  );
}
