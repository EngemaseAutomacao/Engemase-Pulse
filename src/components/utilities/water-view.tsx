"use client";

import { useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { ActivityIcon, DropletsIcon, InfoIcon, OctagonAlertIcon, TimerIcon, TriangleAlertIcon, WavesIcon } from "lucide-react";
import { AXIS_TICK, ChartMessage, GRID_STROKE, TooltipBox } from "@/components/charts/chart-parts";
import { StatTile } from "@/components/dashboard/stat-tile";
import { RelativeTime } from "@/components/meters/relative-time";
import { StatusBadge } from "@/components/meters/status-badge";
import { EmptyState } from "@/components/shell/page";
import { fetchJson } from "@/lib/fetcher";
import { formatNumber } from "@/lib/format";
import { LEAK_FACTOR, type WaterDay } from "@/lib/utilities";
import type { UtilitiesResponse, WaterView as Water } from "@/lib/utility-types";
import { cn } from "@/lib/utils";
import { SitePicker, UtilitiesLoading, liveStatus } from "./shared";
import { TankFigure } from "./tank-figure";
import { TrendRangePicker, UtilityTrend, type TrendRange } from "./utility-trend";

const m3 = (liters: number | null | undefined, digits = 1) =>
  liters === null || liters === undefined ? "—" : formatNumber(liters / 1000, digits);

/** Tela do módulo Água: reservatórios de cada unidade. */
export function WaterModuleView({ tenantSlug }: { tenantSlug: string }) {
  const { data, error, isLoading } = useSWR<UtilitiesResponse>(
    `/api/tenants/${tenantSlug}/utilities?module=agua`,
    fetchJson,
    { refreshInterval: 15_000, keepPreviousData: true },
  );
  const [siteId, setSiteId] = useState<string | null>(null);
  const [range, setRange] = useState<TrendRange>("24h");
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
          icon={<DropletsIcon />}
          title="Aguardando o reservatório"
          description="O configurador desta loja declarou o módulo Água, mas ainda não enviou o reservatório. Confira no configurador se o equipamento do reservatório está cadastrado e lendo (veja a Ajuda, “Configurar água e gerador”)."
        />
      ) : (
        site.equipment.map((e) =>
          e.kind === "WATER" ? <TankSection key={e.id} tenantSlug={tenantSlug} tank={e} range={range} /> : null,
        )
      )}
    </div>
  );
}

function TankSection({ tenantSlug, tank, range }: { tenantSlug: string; tank: Water; range: TrendRange }) {
  const status = liveStatus(tank.live);
  const today = tank.days.at(-1) ?? null;
  const yesterday = tank.days.at(-2) ?? null;
  const noCapacity = tank.capacityL === null;

  return (
    <section aria-labelledby={`tank-${tank.id}`} className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={`tank-${tank.id}`} className="text-lg font-semibold">
          {tank.name}
        </h2>
        {tank.tag && <span className="text-sm text-muted-foreground">{tank.tag}</span>}
        <StatusBadge status={status} />
        {tank.live?.time && (
          <span className="text-xs text-muted-foreground">
            Leitura <RelativeTime value={tank.live.time} />
          </span>
        )}
      </div>

      <LeakNotice tank={tank} />
      {tank.faults.length > 0 && (
        <Notice tone="critical" icon={<OctagonAlertIcon />}>
          {tank.faults.map((f) => f.label).join(" · ")}
        </Notice>
      )}
      {noCapacity && (
        <Notice tone="info" icon={<InfoIcon />}>
          Informe a capacidade do reservatório (litros) no configurador da loja para calcular volume, consumo e autonomia.
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="surface flex items-center justify-center p-4">
          <TankFigure levelPct={tank.levelPct} label={`Nível de ${tank.name}`} low={20} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
          <StatTile
            label="Volume"
            value={tank.volumeL === null ? "—" : formatNumber(tank.volumeL, 0)}
            unit="L"
            icon={<DropletsIcon />}
            detail={tank.capacityL ? `de ${formatNumber(tank.capacityL, 0)} L` : "capacidade não informada"}
          />
          <StatTile
            label="Consumo hoje"
            value={m3(today?.liters)}
            unit="m³"
            icon={<WavesIcon />}
            detail={yesterday ? `ontem, no dia todo: ${m3(yesterday.liters)} m³` : "até agora"}
          />
          <StatTile
            label="Ritmo agora"
            value={tank.usageLh === null ? "—" : formatNumber(tank.usageLh, 0)}
            unit="L/h"
            icon={<ActivityIcon />}
            detail="média das últimas 3 h"
          />
          <StatTile
            label="Autonomia"
            value={tank.autonomyH === null ? "—" : formatNumber(tank.autonomyH, 1)}
            unit="h"
            icon={<TimerIcon />}
            detail="no ritmo atual, se a reposição parar"
          />
          {tank.hasPumpSignal && (
            <StatTile
              label="Bomba de recalque"
              value={tank.pumpOn === null ? "—" : tank.pumpOn ? "Ligada" : "Desligada"}
              detail={[
                today?.pumpHours !== null && today?.pumpHours !== undefined
                  ? `hoje: ${formatNumber(today.pumpHours, 1)} h`
                  : null,
                today?.pumpStarts !== null && today?.pumpStarts !== undefined
                  ? `${today.pumpStarts} ${today.pumpStarts === 1 ? "partida" : "partidas"}`
                  : null,
                tank.pressure !== null ? `${formatNumber(tank.pressure, 1)} mca` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          )}
        </div>
      </div>

      {!noCapacity && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="surface space-y-3 p-4">
            <ChartHeader
              title="Consumo por dia"
              note={
                tank.levelOnly
                  ? "Calculado pelo nível; enquanto a bomba enche, estimado pelo ritmo anterior."
                  : "Vazão de entrada menos o que o reservatório subiu."
              }
            />
            <DailyChart days={tank.days} timeZone={tank.timeZone} />
          </div>
          <div className="surface space-y-3 p-4">
            <ChartHeader
              title="Madrugada (hora mais calma, 0h–5h)"
              note="Vazamento aparece aqui: a loja fechada deveria gastar sempre parecido."
            />
            <NightChart days={tank.days} baseline={tank.leak.baselineLh} timeZone={tank.timeZone} />
          </div>
        </div>
      )}

      <div className={cn("surface grid gap-6 p-4", (!tank.levelOnly || tank.pressure !== null) && "lg:grid-cols-2")}>
        <UtilityTrend
          tenantSlug={tenantSlug}
          equipmentId={tank.id}
          tag="nivel"
          label="Nível"
          unit="%"
          decimals={1}
          range={range}
          timeZone={tank.timeZone}
          domain={[0, 100]}
        />
        {!tank.levelOnly ? (
          <UtilityTrend
            tenantSlug={tenantSlug}
            equipmentId={tank.id}
            tag="vazao_entrada"
            label="Vazão de entrada"
            unit="m³/h"
            decimals={1}
            range={range}
            timeZone={tank.timeZone}
            domain={[0, "auto"]}
            color="var(--chart-3)"
          />
        ) : (
          tank.pressure !== null && (
            <UtilityTrend
              tenantSlug={tenantSlug}
              equipmentId={tank.id}
              tag="pressao_recalque"
              label="Pressão de recalque"
              unit="mca"
              range={range}
              timeZone={tank.timeZone}
              domain={[0, "auto"]}
              color="var(--chart-3)"
            />
          )
        )}
      </div>
    </section>
  );
}

function LeakNotice({ tank }: { tank: Water }) {
  const { leak } = tank;
  if (!leak.suspect || leak.nightMinLh === null || leak.baselineLh === null) return null;
  const today = tank.days.at(-1)?.day === leak.day;
  return (
    <Notice tone="warning" icon={<TriangleAlertIcon />}>
      <strong className="font-semibold">Possível vazamento.</strong> Na madrugada {today ? "de hoje" : "de ontem"}, a hora mais
      calma gastou {formatNumber(leak.nightMinLh, 0)} L/h; o normal desta loja é {formatNumber(leak.baselineLh, 0)} L/h
      (últimas {leak.nights} noites). Confira descargas, boias, torneiras e o próprio reservatório.
    </Notice>
  );
}

function Notice({
  tone,
  icon,
  children,
}: {
  tone: "info" | "warning" | "critical";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "info" ? "note" : "alert"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
        tone === "info" && "border-border bg-muted text-foreground [&>svg]:text-muted-foreground",
        tone === "warning" && "border-warning/40 bg-warning/10 [&>svg]:text-warning",
        tone === "critical" && "border-destructive/40 bg-destructive/10 [&>svg]:text-destructive",
      )}
    >
      {icon}
      <p>{children}</p>
    </div>
  );
}

function ChartHeader({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const weekday = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");

function DailyChart({ days, timeZone }: { days: WaterDay[]; timeZone: string }) {
  const todayKey = new Date().toLocaleDateString("sv-SE", { timeZone });
  const rows = days.map((d) => ({ ...d, m3: d.liters / 1000, today: d.day === todayKey }));
  if (rows.length === 0) return <div className="h-48"><ChartMessage>Sem histórico ainda.</ChartMessage></div>;
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="day" tickFormatter={dayLabel} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={12} />
          <YAxis width={40} tick={AXIS_TICK} tickFormatter={(v: number) => formatNumber(v, 0)} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={(props: TooltipContentProps) => {
              const d = props.payload?.[0]?.payload as (WaterDay & { today: boolean }) | undefined;
              if (!props.active || !d) return null;
              return (
                <TooltipBox
                  title={`${weekday(d.day)} ${dayLabel(d.day)}${d.today ? " (até agora)" : ""}`}
                  subtitle={d.coverage < 0.95 && !d.today ? `leituras em ${formatNumber(d.coverage * 100, 0)} % do dia` : undefined}
                  rows={[
                    { key: "c", label: "Consumo", value: `${m3(d.liters)} m³`, color: "var(--chart-1)" },
                    ...(d.estimatedShare > 0.005
                      ? [{ key: "e", label: "Parte estimada", value: `${formatNumber(d.estimatedShare * 100, 0)} %` }]
                      : []),
                    ...(d.pumpHours !== null ? [{ key: "b", label: "Bomba ligada", value: `${formatNumber(d.pumpHours, 1)} h` }] : []),
                    ...(d.nightMinLh !== null
                      ? [{ key: "n", label: "Madrugada", value: `${formatNumber(d.nightMinLh, 0)} L/h` }]
                      : []),
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="m3" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.day} fill="var(--chart-1)" fillOpacity={r.today ? 0.45 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="sr-only">Barras em m³ por dia; a de hoje, mais clara, é parcial.</p>
    </div>
  );
}

function NightChart({ days, baseline, timeZone }: { days: WaterDay[]; baseline: number | null; timeZone: string }) {
  const rows = days.filter((d) => d.nightMinLh !== null);
  const limit = baseline === null ? null : baseline * LEAK_FACTOR;
  const todayKey = new Date().toLocaleDateString("sv-SE", { timeZone });
  if (rows.length === 0) {
    return <div className="h-48"><ChartMessage>Ainda sem uma madrugada completa.</ChartMessage></div>;
  }
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="day" tickFormatter={dayLabel} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={12} />
          <YAxis width={40} tick={AXIS_TICK} tickFormatter={(v: number) => formatNumber(v, 0)} axisLine={false} tickLine={false} />
          {limit !== null && (
            <ReferenceLine
              y={limit}
              stroke="var(--warning)"
              strokeDasharray="4 4"
              label={{ value: "atenção", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11 }}
            />
          )}
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={(props: TooltipContentProps) => {
              const d = props.payload?.[0]?.payload as WaterDay | undefined;
              if (!props.active || !d) return null;
              const high = limit !== null && d.nightMinLh! >= limit;
              return (
                <TooltipBox
                  title={`Madrugada de ${weekday(d.day)} ${dayLabel(d.day)}${d.day === todayKey ? " (hoje)" : ""}`}
                  subtitle={high ? "acima do normal da loja" : undefined}
                  rows={[
                    { key: "n", label: "Hora mais calma", value: `${formatNumber(d.nightMinLh, 0)} L/h`, color: high ? "var(--warning)" : "var(--chart-1)" },
                    ...(baseline !== null ? [{ key: "b", label: "Normal da loja", value: `${formatNumber(baseline, 0)} L/h` }] : []),
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="nightMinLh" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.day} fill={limit !== null && r.nightMinLh! >= limit ? "var(--warning)" : "var(--chart-1)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
