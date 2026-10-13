"use client";

import { useMemo, useState } from "react";
import { ActivityIcon, GaugeIcon, PlugZapIcon, RadioTowerIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/forms/native-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MeterCard, type MeterSummary } from "@/components/meters/meter-card";
import { RelativeTime } from "@/components/meters/relative-time";
import { useIncrementalList } from "@/hooks/use-incremental-list";
import { useLive } from "@/hooks/use-live";
import { formatNumber } from "@/lib/format";
import type { LiveMeter } from "@/lib/telemetry-types";
import { cn } from "@/lib/utils";
import { SiteErrors } from "./site-errors";
import { StatTile } from "./stat-tile";

const ALL_SITES = "all";
const PAGE_SIZE = 24;

type SortMode = "default" | "problems" | "power";

/** Ordem dos cartões: problemas de comunicação primeiro facilita a operação em clientes grandes. */
const STATUS_RANK = { offline: 0, "no-data": 1, online: 2 } as const;

/** Painel do cliente: indicadores somados e cartões dos medidores, ao vivo. */
export function TenantDashboard({
  tenantSlug,
  sites,
  meters,
}: {
  tenantSlug: string;
  sites: { id: string; name: string }[];
  meters: MeterSummary[];
}) {
  const [siteId, setSiteId] = useState(ALL_SITES);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("default");
  const { data, error, isLoading, isValidating } = useLive(tenantSlug);

  const visible = siteId === ALL_SITES ? meters : meters.filter((m) => m.siteId === siteId);
  const needle = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = needle
    ? visible.filter((m) => [m.tag, m.name, m.siteName, m.location ?? ""].some((v) => v.toLocaleLowerCase("pt-BR").includes(needle)))
    : visible;
  const ordered = sort === "default" ? filtered : [...filtered].sort((a, b) => compare(sort, data?.meters[a.id], data?.meters[b.id]));
  const page = useIncrementalList(ordered, PAGE_SIZE, `${siteId}|${needle}|${sort}`);
  const siteNames = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);
  const visibleErrors = Object.fromEntries(
    Object.entries(data?.errors ?? {}).filter(([id]) => siteId === ALL_SITES || id === siteId),
  );
  const totals = summarize(visible.map((m) => data?.meters[m.id]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {sites.length > 1 ? (
          <Select value={siteId} onValueChange={setSiteId}>
            <SelectTrigger className="w-full sm:w-64" aria-label="Filtrar por unidade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SITES}>Todas as unidades</SelectItem>
              {sites.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span />
        )}
        <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          <RefreshCwIcon className={cn("size-3.5", isValidating && "animate-spin")} aria-hidden />
          {error ? (
            <span className="text-destructive">Falha ao atualizar: {error.message}</span>
          ) : (
            <>
              Atualizado <RelativeTime value={data?.fetchedAt ?? null} />
            </>
          )}
        </p>
      </div>

      <SiteErrors errors={visibleErrors} siteNames={siteNames} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label="Potência ativa"
          value={isLoading ? "…" : formatNumber(totals.kw, 1)}
          unit="kW"
          icon={<ActivityIcon />}
          detail="Soma dos medidores online"
        />
        <StatTile
          label="Potência aparente"
          value={isLoading ? "…" : formatNumber(totals.kva, 1)}
          unit="kVA"
          icon={<PlugZapIcon />}
          detail={`Reativa: ${formatNumber(totals.kvar, 1)} kVAr`}
        />
        <StatTile
          label="Fator de potência"
          value={isLoading ? "…" : formatNumber(totals.kva > 0 ? totals.kw / totals.kva : null, 3)}
          icon={<GaugeIcon />}
          detail="Global (ativa ÷ aparente)"
        />
        <StatTile
          label="Medidores online"
          value={isLoading ? "…" : `${totals.online}`}
          unit={`de ${visible.length}`}
          icon={<RadioTowerIcon />}
          detail={onlineDetail(totals.online, visible.length, totals.offline)}
        />
      </div>

      {meters.length > 6 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar medidor"
              aria-label="Buscar medidor"
              className="pl-8"
            />
          </div>
          <div className="sm:w-56">
            <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as SortMode)} aria-label="Ordenar medidores">
              <option value="default">Ordem do cadastro</option>
              <option value="problems">Problemas primeiro</option>
              <option value="power">Maior potência</option>
            </NativeSelect>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {page.items.map((meter) => (
          <MeterCard
            key={meter.id}
            meter={meter}
            live={data?.meters[meter.id]}
            href={`/app/${tenantSlug}/medidores/${meter.id}`}
            loading={isLoading}
          />
        ))}
      </div>
      {filtered.length === 0 && <p className="text-sm text-muted-foreground">Nenhum medidor encontrado.</p>}
      {page.remaining > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={page.showMore}>
            Mostrar mais ({page.remaining} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}

function compare(mode: SortMode, a: LiveMeter | undefined, b: LiveMeter | undefined): number {
  if (mode === "problems") return STATUS_RANK[a?.status ?? "no-data"] - STATUS_RANK[b?.status ?? "no-data"];
  // Sem leitura vai para o fim (valor muito baixo, sem gerar NaN como -Infinity − -Infinity).
  return (b?.values.Total_kW ?? -1e12) - (a?.values.Total_kW ?? -1e12);
}

/** Resumo da comunicação: só diz "todos" quando todos estão de fato online. */
function onlineDetail(online: number, total: number, offline: number): string {
  if (total > 0 && online === total) return "Todos comunicando";
  const parts = [];
  if (offline > 0) parts.push(`${offline} sem comunicação`);
  const noData = total - online - offline;
  if (noData > 0) parts.push(`${noData} sem leituras`);
  return parts.join(" · ") || "—";
}

function summarize(readings: (LiveMeter | undefined)[]) {
  const totals = { kw: 0, kva: 0, kvar: 0, online: 0, offline: 0 };
  for (const reading of readings) {
    if (reading?.status !== "online") {
      if (reading?.status === "offline") totals.offline++;
      continue;
    }
    totals.online++;
    totals.kw += reading.values.Total_kW ?? 0;
    totals.kva += reading.values.Total_kVA ?? 0;
    totals.kvar += reading.values.Total_kVAr ?? 0;
  }
  return totals;
}
