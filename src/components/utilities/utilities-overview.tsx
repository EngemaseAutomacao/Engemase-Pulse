"use client";

import Link from "next/link";
import useSWR from "swr";
import { ChevronRightIcon, DropletsIcon, FuelIcon, TriangleAlertIcon } from "lucide-react";
import { fetchJson } from "@/lib/fetcher";
import { formatNumber } from "@/lib/format";
import { DAYS_WITHOUT_RUN_WARN, MODULE_INFO, type UtilityModule } from "@/lib/utilities";
import type { GeneratorView, UtilitiesResponse, WaterView } from "@/lib/utility-types";
import { cn } from "@/lib/utils";
import { readinessOf } from "./generator-view";
import { TankFigure } from "./tank-figure";

/** Cartões de água e gerador na Visão geral: um por equipamento, com o essencial. */
export function UtilitiesOverview({ tenantSlug, modules }: { tenantSlug: string; modules: UtilityModule[] }) {
  if (modules.length === 0) return null;
  return (
    <section aria-label="Água e gerador" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {modules.map((m) => (
        <ModuleCards key={m} tenantSlug={tenantSlug} module={m} />
      ))}
    </section>
  );
}

function ModuleCards({ tenantSlug, module }: { tenantSlug: string; module: UtilityModule }) {
  const { data } = useSWR<UtilitiesResponse>(`/api/tenants/${tenantSlug}/utilities?module=${module}`, fetchJson, {
    refreshInterval: 30_000,
    keepPreviousData: true,
  });
  const href = `/app/${tenantSlug}/${module}`;
  const equipment = data?.sites.flatMap((s) => s.equipment) ?? [];
  if (!data) return <div className="surface h-36 animate-pulse" />;
  if (equipment.length === 0) {
    return (
      <Link href={href} className="surface flex items-center gap-3 p-4 text-sm text-muted-foreground hover:bg-muted/40">
        {module === "agua" ? <DropletsIcon className="size-5" /> : <FuelIcon className="size-5" />}
        {MODULE_INFO[module].label}: aguardando o configurador enviar o equipamento.
      </Link>
    );
  }
  const multiSite = data.sites.length > 1;
  return equipment.map((e) =>
    e.kind === "WATER" ? (
      <WaterCard key={e.id} tank={e} href={href} multiSite={multiSite} />
    ) : (
      <GeneratorCard key={e.id} gen={e} href={href} multiSite={multiSite} />
    ),
  );
}

function CardShell({
  href,
  icon,
  title,
  subtitle,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string | null;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="surface group flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-primary [&_svg]:size-4">{icon}</span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{title}</p>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      {children}
    </Link>
  );
}

function WaterCard({ tank, href, multiSite }: { tank: WaterView; href: string; multiSite: boolean }) {
  const offline = !tank.live?.online;
  return (
    <CardShell href={href} icon={<DropletsIcon />} title={tank.name} subtitle={multiSite ? tank.siteName : tank.tag}>
      <div className="flex items-center gap-4">
        <TankFigure levelPct={tank.levelPct} label={`Nível de ${tank.name}`} low={20} className="h-24" />
        <dl className="grid gap-1 text-sm">
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">Volume</dt>
            <dd className="font-heading text-2xl font-semibold tabular">
              {tank.volumeL === null ? "—" : formatNumber(tank.volumeL, 0)}
            </dd>
            <span className="text-xs text-muted-foreground">L</span>
          </div>
          <div className="text-xs text-muted-foreground">
            <dt className="inline">Autonomia: </dt>
            <dd className="inline">{tank.autonomyH === null ? "—" : `${formatNumber(tank.autonomyH, 1)} h`}</dd>
          </div>
          <div className="text-xs text-muted-foreground">
            <dt className="inline">Hoje: </dt>
            <dd className="inline">
              {tank.days.at(-1) ? `${formatNumber(tank.days.at(-1)!.liters / 1000, 1)} m³` : "—"}
            </dd>
          </div>
        </dl>
      </div>
      {(tank.leak.suspect || offline || tank.faults.length > 0) && (
        <p className={cn("flex items-center gap-1.5 text-xs font-medium", offline && !tank.leak.suspect ? "text-muted-foreground" : "text-warning")}>
          <TriangleAlertIcon className="size-3.5" aria-hidden />
          {tank.leak.suspect
            ? "Possível vazamento na madrugada"
            : tank.faults.length > 0
              ? tank.faults[0].label
              : "Sem leitura recente"}
        </p>
      )}
    </CardShell>
  );
}

function GeneratorCard({ gen, href, multiSite }: { gen: GeneratorView; href: string; multiSite: boolean }) {
  const readiness = readinessOf(gen);
  const late = gen.daysSinceRun !== null && gen.daysSinceRun >= DAYS_WITHOUT_RUN_WARN;
  const tone = {
    ok: "text-success",
    info: "text-info",
    warn: "text-warning",
    critical: "text-destructive",
    muted: "text-muted-foreground",
  }[readiness.tone];
  return (
    <CardShell href={href} icon={<FuelIcon />} title={gen.name} subtitle={multiSite ? gen.siteName : gen.tag}>
      <p className={cn("flex items-center gap-2 text-lg font-semibold [&_svg]:size-5", tone)}>
        {readiness.icon}
        <span className="text-foreground">{readiness.label}</span>
      </p>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Diesel</dt>
          <dd className="font-medium tabular">{gen.dieselPct === null ? "—" : `${formatNumber(gen.dieselPct, 0)} %`}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Autonomia</dt>
          <dd className="font-medium tabular">{gen.autonomyH === null ? "—" : `${formatNumber(gen.autonomyH, 1)} h`}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Última partida</dt>
          <dd className={cn("font-medium tabular", late && "text-warning")}>
            {gen.daysSinceRun === null ? "—" : `há ${formatNumber(gen.daysSinceRun, 0)} d`}
          </dd>
        </div>
      </dl>
    </CardShell>
  );
}
