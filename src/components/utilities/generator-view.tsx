"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  BatteryMediumIcon,
  CalendarClockIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  FuelIcon,
  LoaderCircleIcon,
  OctagonAlertIcon,
  PlugZapIcon,
  TimerIcon,
  TriangleAlertIcon,
  ZapIcon,
} from "lucide-react";
import { StatTile } from "@/components/dashboard/stat-tile";
import { RelativeTime } from "@/components/meters/relative-time";
import { StatusBadge } from "@/components/meters/status-badge";
import { EmptyState } from "@/components/shell/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJson } from "@/lib/fetcher";
import { formatNumber } from "@/lib/format";
import { DAYS_WITHOUT_RUN_ALERT, DAYS_WITHOUT_RUN_WARN } from "@/lib/utilities";
import type { GeneratorRunView, GeneratorView, UtilitiesResponse } from "@/lib/utility-types";
import { cn } from "@/lib/utils";
import { SitePicker, UtilitiesLoading, liveStatus } from "./shared";
import { TankFigure } from "./tank-figure";
import { TrendRangePicker, UtilityTrend, type TrendRange } from "./utility-trend";

/** Tela do módulo Gerador: grupos geradores de cada unidade. */
export function GeneratorModuleView({ tenantSlug }: { tenantSlug: string }) {
  const { data, error, isLoading } = useSWR<UtilitiesResponse>(
    `/api/tenants/${tenantSlug}/utilities?module=gerador`,
    fetchJson,
    { refreshInterval: 10_000, keepPreviousData: true },
  );
  const [siteId, setSiteId] = useState<string | null>(null);
  const [range, setRange] = useState<TrendRange>("7d");
  const sites = data?.sites ?? [];
  const site = sites.find((s) => s.id === siteId) ?? sites[0];

  if (error && !data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error.message}
      </p>
    );
  }
  if (isLoading && !data) return <UtilitiesLoading />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SitePicker sites={sites} value={site?.id ?? null} onChange={setSiteId} />
        <TrendRangePicker value={range} onChange={setRange} />
      </div>
      {!site || site.equipment.length === 0 ? (
        <EmptyState
          icon={<FuelIcon />}
          title="Aguardando o grupo gerador"
          description="O configurador desta loja declarou o módulo Gerador, mas ainda não enviou o grupo. Confira no configurador se o controlador do gerador está cadastrado e lendo (veja a Ajuda, “Configurar água e gerador”)."
        />
      ) : (
        site.equipment.map((e) =>
          e.kind === "GENERATOR" ? <GeneratorSection key={e.id} tenantSlug={tenantSlug} gen={e} range={range} /> : null,
        )
      )}
    </div>
  );
}

export type Readiness = { label: string; detail: string; tone: "ok" | "info" | "warn" | "critical" | "muted"; icon: React.ReactNode };

export function readinessOf(gen: GeneratorView): Readiness {
  if (!gen.live?.online) {
    return { label: "Sem comunicação", detail: "Sem leitura recente do controlador.", tone: "muted", icon: <CircleDashedIcon /> };
  }
  if (gen.state === "Em falha" || gen.faults.length > 0) {
    return {
      label: "Em falha",
      detail: gen.faults.length ? gen.faults.map((f) => f.label).join(" · ") : "O controlador indica falha.",
      tone: "critical",
      icon: <OctagonAlertIcon />,
    };
  }
  if (gen.running) {
    const power =
      gen.powerKw !== null
        ? ` · ${formatNumber(gen.powerKw, 0)} kW${gen.nominalKw ? ` de ${formatNumber(gen.nominalKw, 0)} kW` : ""}`
        : "";
    return { label: "Em operação", detail: `${gen.state ?? "Rodando"}${power}`, tone: "info", icon: <LoaderCircleIcon /> };
  }
  if (gen.ready === false) {
    return {
      label: "Não está pronto",
      detail: "Não partiria sozinho agora: confira se está em automático, o diesel e a bateria.",
      tone: "warn",
      icon: <TriangleAlertIcon />,
    };
  }
  return { label: "Pronto para partir", detail: "Em automático, sem falha, com diesel e bateria.", tone: "ok", icon: <CircleCheckIcon /> };
}

export const READINESS_TONE = {
  ok: "border-success/30 bg-success/10 [&_svg]:text-success",
  info: "border-info/30 bg-info/10 [&_svg]:text-info",
  warn: "border-warning/40 bg-warning/10 [&_svg]:text-warning",
  critical: "border-destructive/40 bg-destructive/10 [&_svg]:text-destructive",
  muted: "border-border bg-muted [&_svg]:text-muted-foreground",
} as const;

function GeneratorSection({ tenantSlug, gen, range }: { tenantSlug: string; gen: GeneratorView; range: TrendRange }) {
  const readiness = readinessOf(gen);
  const s = gen.stats30;
  const days = gen.daysSinceRun;
  const daysTone = days === null ? "" : days >= DAYS_WITHOUT_RUN_ALERT ? "text-destructive" : days >= DAYS_WITHOUT_RUN_WARN ? "text-warning" : "";

  return (
    <section aria-labelledby={`gen-${gen.id}`} className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={`gen-${gen.id}`} className="text-lg font-semibold">
          {gen.name}
        </h2>
        {gen.tag && <span className="text-sm text-muted-foreground">{gen.tag}</span>}
        <StatusBadge status={liveStatus(gen.live)} />
        {gen.live?.time && (
          <span className="text-xs text-muted-foreground">
            Leitura <RelativeTime value={gen.live.time} />
          </span>
        )}
      </div>

      <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border p-4", READINESS_TONE[readiness.tone])}>
        <div className="flex items-center gap-3 [&_svg]:size-7">
          {readiness.icon}
          <div>
            <p className="text-xl font-semibold">{readiness.label}</p>
            <p className="text-sm text-muted-foreground">{readiness.detail}</p>
          </div>
        </div>
        {gen.live?.online && gen.mainsPresent !== null && (
          <p className="flex items-center gap-1.5 text-sm [&_svg]:size-4">
            <PlugZapIcon />
            {gen.mainsPresent ? "Rede da concessionária presente" : "Sem rede da concessionária"}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="surface flex items-center justify-center p-4">
          <TankFigure levelPct={gen.dieselPct} label="Diesel no tanque" low={30} fluid="diesel" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
          <StatTile
            label="Diesel"
            value={gen.dieselL !== null ? formatNumber(gen.dieselL, 0) : gen.dieselPct !== null ? formatNumber(gen.dieselPct, 0) : "—"}
            unit={gen.dieselL !== null ? "L" : "%"}
            icon={<FuelIcon />}
            detail={gen.tankL ? `tanque de ${formatNumber(gen.tankL, 0)} L` : "capacidade do tanque não informada"}
          />
          <StatTile
            label="Autonomia"
            value={gen.autonomyH === null ? "—" : formatNumber(gen.autonomyH, 1)}
            unit="h"
            icon={<TimerIcon />}
            detail={s.litersPerHour ? `consumo medido ${formatNumber(s.litersPerHour, 0)} L/h` : "pelo consumo do cadastro"}
          />
          <StatTile
            label="Bateria"
            value={gen.batteryV === null ? "—" : formatNumber(gen.batteryV, 1)}
            unit="V"
            icon={<BatteryMediumIcon />}
            detail={s.lastBatteryDrop !== null ? `caiu ${formatNumber(s.lastBatteryDrop, 1)} V no último arranque` : "em repouso"}
          />
          <StatTile
            label="Última partida"
            value={days === null ? "—" : formatNumber(days, 0)}
            unit={days === 1 ? "dia" : "dias"}
            icon={<CalendarClockIcon />}
            className={daysTone}
            detail={days !== null && days >= DAYS_WITHOUT_RUN_WARN ? "o teste semanal está atrasado" : "teste semanal recomendado"}
          />
          <StatTile
            label="Potência"
            value={gen.powerKw === null ? "—" : formatNumber(gen.powerKw, 0)}
            unit="kW"
            icon={<ZapIcon />}
            detail={gen.nominalKw ? `nominal ${formatNumber(gen.nominalKw, 0)} kW` : "agora"}
          />
          <StatTile
            label="Horímetro"
            value={gen.hourMeter === null ? "—" : formatNumber(gen.hourMeter, 0)}
            unit="h"
            detail="horas de motor"
          />
        </div>
      </div>

      <div className="surface space-y-3 p-4">
        <div>
          <h3 className="font-semibold">Últimos 30 dias</h3>
          <p className="text-xs text-muted-foreground">Das corridas que o configurador registrou: da partida até parar.</p>
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <Indicator
            label="Pronto para partir"
            value={gen.readiness30 === null ? "—" : `${formatNumber(gen.readiness30 * 100, 1)} %`}
            detail="do tempo"
          />
          <Indicator
            label="Partidas"
            value={String(s.starts)}
            detail={s.failedStarts ? `${s.failedStarts} com falha` : "nenhuma falha"}
            alert={s.failedStarts > 0}
          />
          <Indicator label="Horas rodando" value={formatNumber(s.hours, 1)} detail={s.trips ? `${s.trips} desarme(s)` : "sem desarme"} alert={s.trips > 0} />
          <Indicator label="Diesel gasto" value={`${formatNumber(s.liters, 0)} L`} />
          <Indicator label="Energia gerada" value={`${formatNumber(s.kwh, 0)} kWh`} />
          <Indicator
            label="Maior queda da bateria"
            value={s.maxBatteryDrop === null ? "—" : `${formatNumber(s.maxBatteryDrop, 1)} V`}
            detail="no arranque"
          />
        </dl>
      </div>

      <RunsTable runs={gen.runs} timeZone={gen.timeZone} />

      <div className="surface grid gap-6 p-4 lg:grid-cols-2">
        <UtilityTrend
          tenantSlug={tenantSlug}
          equipmentId={gen.id}
          tag="nivel_diesel"
          label="Diesel"
          unit="%"
          decimals={0}
          range={range}
          timeZone={gen.timeZone}
          domain={[0, 100]}
          color="var(--chart-4)"
        />
        <UtilityTrend
          tenantSlug={tenantSlug}
          equipmentId={gen.id}
          tag="tensao_bateria"
          label="Bateria"
          unit="V"
          decimals={1}
          range={range}
          timeZone={gen.timeZone}
          color="var(--chart-5)"
        />
      </div>
    </section>
  );
}

function Indicator({ label, value, detail, alert }: { label: string; value: string; detail?: string; alert?: boolean }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-xl font-semibold tabular">{value}</dd>
      {detail && (
        <dd className={cn("flex items-center gap-1 text-xs text-muted-foreground", alert && "text-warning")}>
          {alert && <TriangleAlertIcon className="size-3" aria-hidden />}
          {detail}
        </dd>
      )}
    </div>
  );
}

function duration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${formatNumber(seconds, 0)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

const RUN_STATUS = {
  running: { label: "Rodando", icon: LoaderCircleIcon, className: "text-info" },
  ok: { label: "Normal", icon: CircleCheckIcon, className: "text-success" },
  failed: { label: "Falhou", icon: CircleXIcon, className: "text-destructive" },
  tripped: { label: "Desarmou", icon: OctagonAlertIcon, className: "text-warning" },
} as const;

function RunsTable({ runs, timeZone }: { runs: GeneratorRunView[]; timeZone: string }) {
  return (
    <div className="surface space-y-3 p-4">
      <h3 className="font-semibold">Partidas</h3>
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma partida registrada nos últimos 90 dias.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Início</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead className="text-right">Duração</TableHead>
                <TableHead className="text-right">Diesel</TableHead>
                <TableHead className="text-right">Energia</TableHead>
                <TableHead className="text-right">Queda da bateria</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => {
                const st = RUN_STATUS[r.status];
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap tabular">
                      {new Date(r.startedAt).toLocaleString("pt-BR", {
                        timeZone,
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="first-letter:uppercase">{r.reason ?? "—"}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <st.icon className={cn("size-4 shrink-0", st.className)} aria-hidden />
                        <span>{r.status === "ok" || r.status === "running" ? st.label : (r.result ?? st.label)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular">{duration(r.durationSeconds)}</TableCell>
                    <TableCell className="text-right tabular">{r.liters ? `${formatNumber(r.liters, 0)} L` : "—"}</TableCell>
                    <TableCell className="text-right tabular">{r.kwh ? `${formatNumber(r.kwh, 0)} kWh` : "—"}</TableCell>
                    <TableCell className="text-right tabular">
                      {r.batteryDrop === null ? "—" : `${formatNumber(r.batteryDrop, 1)} V`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
