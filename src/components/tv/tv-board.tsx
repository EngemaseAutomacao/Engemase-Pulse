"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  InfoIcon,
  LogOutIcon,
  MaximizeIcon,
  OctagonAlertIcon,
  PauseIcon,
  PlayIcon,
  TriangleAlertIcon,
  WifiOffIcon,
} from "lucide-react";
import { DemandCard } from "@/components/demand/demand-now";
import type { MeterSummary } from "@/components/meters/meter-card";
import { useLive } from "@/hooks/use-live";
import { useNow } from "@/hooks/use-now";
import type { SiteDemandNow } from "@/lib/demand-forecast";
import { fetchJson } from "@/lib/fetcher";
import { formatNumber } from "@/lib/format";
import type { LiveMeter, TvResponse } from "@/lib/telemetry-types";
import type { UtilityModule } from "@/lib/utilities";
import type { UtilitiesResponse } from "@/lib/utility-types";
import { cn } from "@/lib/utils";
import { UtilitiesTvScreen } from "@/components/utilities/utilities-tv";

type ScreenId = "now" | "demand" | "alarms" | "today" | "utilities";

const SCREEN_TITLE: Record<ScreenId, string> = {
  now: "Agora",
  demand: "Demanda",
  alarms: "Alarmes",
  today: "Consumo de hoje",
  utilities: "Água e gerador",
};

const SEVERITY = {
  CRITICAL: { label: "Crítico", icon: OctagonAlertIcon, className: "text-destructive" },
  WARNING: { label: "Atenção", icon: TriangleAlertIcon, className: "text-warning" },
  INFO: { label: "Informativo", icon: InfoIcon, className: "text-info" },
} as const;

/**
 * Tela de TV: números grandes, telas que alternam sozinhas (Agora, Demanda,
 * Alarmes, Consumo de hoje) e a tela do aparelho sempre acesa. Setas do
 * teclado trocam de tela, espaço pausa e F põe em tela cheia.
 */
export function TvBoard({
  tenant,
  sites,
  meters,
  seconds,
  modules = [],
}: {
  tenant: { slug: string; name: string; logoUrl: string };
  sites: { id: string; name: string }[];
  meters: MeterSummary[];
  seconds: number;
  /** Módulos de água e gerador do cliente (ganham uma tela). */
  modules?: UtilityModule[];
}) {
  const { data: live } = useLive(tenant.slug);
  const { data: demand } = useSWR<{ sites: SiteDemandNow[] }>(`/api/tenants/${tenant.slug}/demand`, fetchJson, {
    refreshInterval: 30_000,
    keepPreviousData: true,
  });
  const { data: tv } = useSWR<TvResponse>(`/api/tenants/${tenant.slug}/tv`, fetchJson, {
    refreshInterval: 60_000,
    keepPreviousData: true,
  });
  const utilityKey = (m: UtilityModule) =>
    modules.includes(m) ? `/api/tenants/${tenant.slug}/utilities?module=${m}` : null;
  const swrUtilities = { refreshInterval: 60_000, keepPreviousData: true };
  const { data: water } = useSWR<UtilitiesResponse>(utilityKey("agua"), fetchJson, swrUtilities);
  const { data: generators } = useSWR<UtilitiesResponse>(utilityKey("gerador"), fetchJson, swrUtilities);
  const utilities = [...(water?.sites ?? []), ...(generators?.sites ?? [])].flatMap((s) => s.equipment);
  const screens: ScreenId[] = [
    "now",
    ...(demand?.sites.length ? (["demand"] as const) : []),
    ...(utilities.length ? (["utilities"] as const) : []),
    "alarms",
    "today",
  ];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [controls, setControls] = useState(true);
  const now = useNow();
  const screen = screens[index % screens.length];

  const go = useCallback((delta: number) => setIndex((i) => (i + delta + screens.length) % screens.length), [screens.length]);

  // Troca de tela, relógio e controles que somem quando o mouse para.
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => go(1), seconds * 1000);
    return () => window.clearInterval(timer);
  }, [paused, seconds, go, index]);
  useEffect(() => {
    let hide = window.setTimeout(() => setControls(false), 4000);
    const show = () => {
      setControls(true);
      window.clearTimeout(hide);
      hide = window.setTimeout(() => setControls(false), 4000);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key.toLowerCase() === "f") void document.documentElement.requestFullscreen?.();
      show();
    };
    window.addEventListener("mousemove", show);
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", show);
    return () => {
      window.clearTimeout(hide);
      window.removeEventListener("mousemove", show);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", show);
    };
  }, [go]);

  // Mantém a tela do aparelho acesa (TV, tablet, notebook).
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if (document.visibilityState === "visible" && "wakeLock" in navigator) lock = await navigator.wakeLock.request("screen");
      } catch {
        // Sem permissão ou sem suporte: segue sem.
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, []);

  return (
    <div className={cn("flex min-h-dvh flex-col gap-6 bg-background p-6 lg:p-10", !controls && "cursor-none")}>
      <header className="flex items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tenant.logoUrl} alt="" className="size-12 shrink-0 rounded-full object-contain lg:size-14" />
          <div className="min-w-0">
            <p className="truncate font-heading text-2xl font-bold text-primary lg:text-3xl">{tenant.name}</p>
            <p className="text-lg text-muted-foreground lg:text-xl">{SCREEN_TITLE[screen]}</p>
          </div>
        </div>
        <p className="font-heading text-4xl font-semibold tabular lg:text-5xl">
          {now === null ? "" : new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </header>
      <div aria-hidden className="h-1 rounded-full bg-linear-to-r from-primary to-brand-accent" />

      <main className="min-h-0 flex-1">
        {screen === "now" && <NowScreen sites={sites} meters={meters} live={live?.meters} alarmCount={tv?.alarmCount ?? null} />}
        {screen === "demand" && (
          <div className={cn("grid gap-6", (demand?.sites.length ?? 0) > 1 && "xl:grid-cols-2")}>
            {demand?.sites.map((d) => <DemandCard key={d.siteId} demand={d} showSite size="large" />)}
          </div>
        )}
        {screen === "alarms" && <AlarmsScreen data={tv} now={now} />}
        {screen === "today" && <TodayScreen data={tv} />}
        {screen === "utilities" && <UtilitiesTvScreen equipment={utilities} />}
      </main>

      <footer className="flex items-center gap-4">
        <div className="flex gap-2" aria-label="Telas">
          {screens.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={SCREEN_TITLE[s]}
              aria-current={i === index % screens.length}
              className={cn("h-2.5 rounded-full transition-all", i === index % screens.length ? "w-8 bg-primary" : "w-2.5 bg-muted-foreground/40")}
            />
          ))}
        </div>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            key={`${index}-${paused}`}
            className="tv-progress h-full origin-left bg-primary/60"
            style={{ animationDuration: `${seconds}s`, animationPlayState: paused ? "paused" : "running" }}
          />
        </div>
        <div className={cn("flex items-center gap-1 transition-opacity", controls ? "opacity-100" : "pointer-events-none opacity-0")}>
          <TvButton label="Tela anterior" onClick={() => go(-1)}>
            <ChevronLeftIcon />
          </TvButton>
          <TvButton label={paused ? "Continuar" : "Pausar"} onClick={() => setPaused((p) => !p)}>
            {paused ? <PlayIcon /> : <PauseIcon />}
          </TvButton>
          <TvButton label="Próxima tela" onClick={() => go(1)}>
            <ChevronRightIcon />
          </TvButton>
          <TvButton label="Tela cheia" onClick={() => void document.documentElement.requestFullscreen?.()}>
            <MaximizeIcon />
          </TvButton>
          <Link
            href={`/app/${tenant.slug}`}
            className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Sair da tela de TV"
            title="Sair"
          >
            <LogOutIcon className="size-5" />
          </Link>
        </div>
      </footer>
    </div>
  );
}

function TvButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-5"
    >
      {children}
    </button>
  );
}

function NowScreen({
  sites,
  meters,
  live,
  alarmCount,
}: {
  sites: { id: string; name: string }[];
  meters: MeterSummary[];
  live: Record<string, LiveMeter> | undefined;
  alarmCount: number | null;
}) {
  const perSite = sites.map((site) => {
    const siteMeters = meters.filter((m) => m.siteId === site.id);
    const online = siteMeters.filter((m) => live?.[m.id]?.status === "online");
    const mains = online.filter((m) => m.isMain);
    const source = mains.length > 0 ? mains : online;
    const kw = source.reduce((s, m) => s + (live?.[m.id]?.values.Total_kW ?? 0), 0);
    const kva = source.reduce((s, m) => s + (live?.[m.id]?.values.Total_kVA ?? 0), 0);
    return { site, total: siteMeters.length, online: online.length, kw, pf: kva > 0 ? kw / kva : null };
  });
  const totalKw = perSite.reduce((s, x) => s + x.kw, 0);
  const totalKva = perSite.reduce((s, x) => s + (x.pf ? x.kw / x.pf : 0), 0);
  const online = perSite.reduce((s, x) => s + x.online, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6 xl:grid-cols-4">
        <BigTile label="Potência total" value={formatNumber(totalKw, 0)} unit="kW" />
        <BigTile label="Fator de potência" value={totalKva > 0 ? formatNumber(totalKw / totalKva, 2) : "—"} />
        <BigTile label="Medidores online" value={String(online)} unit={`de ${meters.length}`} />
        <BigTile
          label="Alarmes ativos"
          value={alarmCount === null ? "—" : String(alarmCount)}
          tone={alarmCount ? "warn" : "ok"}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {perSite.map(({ site, total, online: on, kw, pf }) => {
          const offline = total > 0 && on === 0;
          return (
            <div key={site.id} className="surface space-y-2 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-xl font-semibold">{site.name}</p>
                {offline ? (
                  <span className="flex items-center gap-1.5 text-base font-medium text-destructive">
                    <WifiOffIcon className="size-5" aria-hidden />
                    Sem comunicação
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-base text-success">
                    <CircleCheckIcon className="size-5" aria-hidden />
                    {on} de {total} online
                  </span>
                )}
              </div>
              <p className="flex items-baseline gap-2">
                <span className="font-heading text-5xl font-semibold tabular">{offline ? "—" : formatNumber(kw, 0)}</span>
                <span className="text-xl text-muted-foreground">kW</span>
                {pf !== null && !offline && <span className="ml-auto text-lg text-muted-foreground">FP {formatNumber(pf, 2)}</span>}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BigTile({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: "ok" | "warn" }) {
  return (
    <div className="surface space-y-2 p-6">
      <p className="text-lg text-muted-foreground">{label}</p>
      <p className="flex items-baseline gap-2">
        <span className={cn("font-heading text-6xl font-semibold tabular", tone === "warn" && "text-warning")}>{value}</span>
        {unit && <span className="text-2xl text-muted-foreground">{unit}</span>}
      </p>
    </div>
  );
}

function AlarmsScreen({ data, now }: { data: TvResponse | undefined; now: number | null }) {
  if (!data) return <p className="text-2xl text-muted-foreground">Carregando…</p>;
  if (data.alarms.length === 0) {
    return (
      <div className="grid h-full place-items-center">
        <p className="flex items-center gap-4 text-4xl font-semibold text-success">
          <CircleCheckIcon className="size-12" aria-hidden />
          Nenhum alarme ativo
        </p>
      </div>
    );
  }
  const ago = (iso: string) => {
    const minutes = Math.max(0, Math.round(((now ?? Date.parse(data.fetchedAt)) - Date.parse(iso)) / 60_000));
    return minutes < 60 ? `há ${minutes} min` : minutes < 1440 ? `há ${Math.floor(minutes / 60)} h` : `há ${Math.floor(minutes / 1440)} d`;
  };
  return (
    <div className="space-y-3">
      {data.alarmCount > data.alarms.length && (
        <p className="text-lg text-muted-foreground">
          Mostrando {data.alarms.length} de {data.alarmCount} alarmes ativos (os mais graves primeiro).
        </p>
      )}
      <ul className="grid gap-3 xl:grid-cols-2">
        {data.alarms.map((a) => {
          const s = SEVERITY[a.severity];
          const Icon = s.icon;
          return (
            <li key={a.id} className="surface flex gap-4 p-5">
              <Icon className={cn("mt-1 size-8 shrink-0", s.className)} aria-hidden />
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className={cn("text-lg font-semibold", s.className)}>{s.label}</span>
                  <span className="text-base text-muted-foreground">
                    {ago(a.startedAt)}
                    {a.acknowledged ? " · reconhecido" : ""}
                  </span>
                </p>
                <p className="text-2xl font-semibold">{a.title}</p>
                <p className="line-clamp-2 text-lg text-muted-foreground">{a.message}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TodayScreen({ data }: { data: TvResponse | undefined }) {
  if (!data) return <p className="text-2xl text-muted-foreground">Carregando…</p>;
  return (
    <div className={cn("grid gap-6", data.today.length > 1 && "xl:grid-cols-2")}>
      {data.today.map((site) => {
        const max = Math.max(1, ...site.sectors.map((s) => s.kwh));
        return (
          <section key={site.siteId} className="surface space-y-4 p-6">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="truncate text-2xl font-semibold">{site.siteName}</h2>
              <p className="flex items-baseline gap-2">
                <span className="font-heading text-5xl font-semibold tabular">{formatNumber(site.total, 0)}</span>
                <span className="text-xl text-muted-foreground">kWh hoje</span>
              </p>
            </div>
            {site.sectors.length === 0 ? (
              <p className="text-lg text-muted-foreground">Sem consumo por setor ainda hoje.</p>
            ) : (
              <ul className="space-y-3">
                {site.sectors.map((s) => (
                  <li key={s.id} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-4 text-lg">
                    <span className="truncate">{s.label}</span>
                    <span className="h-4 rounded-r-full bg-chart-1" style={{ width: `${(s.kwh / max) * 100}%` }} />
                    <span className="tabular font-medium">{formatNumber(s.kwh, 0)} kWh</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
