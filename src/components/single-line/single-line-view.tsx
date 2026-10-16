"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { OctagonAlertIcon, RefreshCwIcon, TriangleAlertIcon, UtilityPoleIcon } from "lucide-react";
import { StaleSitesNotice, staleSites } from "@/components/dashboard/stale-sites";
import { BreakerLoadBar } from "@/components/meters/breaker-load";
import { RelativeTime } from "@/components/meters/relative-time";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLive } from "@/hooks/use-live";
import { breakerLoad, type BreakerLevel } from "@/lib/breaker";
import { fetchJson } from "@/lib/fetcher";
import { formatField, formatNumber } from "@/lib/format";
import type { LiveMeter } from "@/lib/telemetry-types";
import { generatorStatusText, transferState, type TransferState } from "@/lib/transfer-switch";
import type { GeneratorView, UtilitiesResponse } from "@/lib/utility-types";
import { cn } from "@/lib/utils";
import { plantTag } from "@/lib/meter-label";

export type SingleLineSite = {
  id: string;
  name: string;
  /** Tem grupo gerador (módulo Gerador): a entrada mostra rede, gerador e o QTA. */
  hasGenerator?: boolean;
  meters: { id: string; tag: string; name: string; isMain: boolean; breakerAmps: number | null }[];
};

type Meter = SingleLineSite["meters"][number];

/** Circuito energizado: medidor comunicando e com corrente/potência. */
function isEnergized(live: LiveMeter | undefined): boolean {
  if (live?.status !== "online") return false;
  const v = live.values;
  return (v.I_AVG ?? 0) > 0.5 || Math.abs(v.Total_kW ?? 0) > 0.05;
}

const LINE_COLOR = { on: "var(--primary)", off: "var(--muted-foreground)" } as const;

const LEVEL_COLOR: Record<BreakerLevel, string | null> = {
  normal: null,
  high: "var(--warning)",
  over: "var(--destructive)",
};

/** Diagrama unifilar ao vivo de uma unidade: entrada, barramento e alimentadores. */
export function SingleLineView({ tenantSlug, sites }: { tenantSlug: string; sites: SingleLineSite[] }) {
  const [siteId, setSiteId] = useState(sites[0].id);
  const site = sites.find((s) => s.id === siteId) ?? sites[0];
  const { data, error, isValidating } = useLive(tenantSlug);
  const isMobile = useIsMobile();

  const main = site.meters.find((m) => m.isMain) ?? null;
  const feeders = site.meters.filter((m) => m !== main);
  const live = data?.meters ?? {};
  const mainLive = main ? live[main.id] : undefined;

  // "Não medido": entrada menos a soma dos alimentadores, só com todos comunicando.
  const allOnline = mainLive?.status === "online" && feeders.every((f) => live[f.id]?.status === "online");
  const unmeasuredKw =
    main && feeders.length > 0 && allOnline
      ? Math.max(
          0,
          (mainLive.values.Total_kW ?? 0) - feeders.reduce((sum, f) => sum + (live[f.id].values.Total_kW ?? 0), 0),
        )
      : null;
  const { data: utilities } = useSWR<UtilitiesResponse>(
    site.hasGenerator ? `/api/tenants/${tenantSlug}/utilities?module=gerador&site=${site.id}` : null,
    fetchJson,
    { refreshInterval: 10_000, keepPreviousData: true },
  );
  const generator =
    (site.hasGenerator &&
      utilities?.sites
        .find((s) => s.id === site.id)
        ?.equipment.find((e): e is GeneratorView => e.kind === "GENERATOR")) ||
    null;
  const transfer = generator
    ? transferState(generator, mainLive?.status === "online" ? isEnergized(mainLive) : null)
    : null;
  const busOn =
    (main ? isEnergized(mainLive) : feeders.some((f) => isEnergized(live[f.id]))) || transfer?.source === "generator";

  const columns: Column[] = [
    ...feeders.map((meter) => ({ kind: "meter" as const, meter })),
    ...(unmeasuredKw !== null ? [{ kind: "unmeasured" as const, kw: unmeasuredKw }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {sites.length > 1 ? (
          <Select value={site.id} onValueChange={setSiteId}>
            <SelectTrigger className="w-full sm:w-64" aria-label="Unidade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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

      <StaleSitesNotice
        sites={staleSites(
          site.meters.map((m) => ({ id: m.id, siteId: site.id })),
          data?.meters,
        )}
        siteNames={new Map([[site.id, site.name]])}
      />

      <section aria-label={`Diagrama unifilar — ${site.name}`} className="overflow-hidden surface p-4 sm:p-6">
        {/* Entrada: concessionária → disjuntor geral → medidor da entrada */}
        <div className="flex flex-col items-center">
          {generator && transfer ? (
            <SourcesWithTransfer tenantSlug={tenantSlug} gen={generator} transfer={transfer} mainLive={mainLive} />
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <UtilityPoleIcon className="size-4" aria-hidden />
              Rede da concessionária
              {mainLive?.values.VLL_AVG !== undefined && (
                <span className="text-foreground tabular">· {formatField("VLL_AVG", mainLive.values.VLL_AVG)}</span>
              )}
            </p>
          )}
          {main ? (
            <>
              <Breaker
                on={isEnergized(mainLive)}
                level={
                  mainLive?.status === "online" ? breakerLoad(mainLive.values, main.breakerAmps)?.level : undefined
                }
                label={main.breakerAmps ? `${formatNumber(main.breakerAmps, 0)} A` : undefined}
              />
              <MainCard tenantSlug={tenantSlug} meter={main} live={mainLive} />
              <Stem on={busOn} />
            </>
          ) : (
            <>
              <Stem on={busOn} />
              <p className="max-w-md py-2 text-center text-xs text-muted-foreground">
                Sem entrada geral marcada no gateway desta unidade. Marque o equipamento da entrada como principal para
                ver o total e o consumo não medido.
              </p>
              <Stem on={busOn} />
            </>
          )}
        </div>

        {columns.length === 0 ? (
          <p className="pt-2 text-center text-sm text-muted-foreground">Nenhum alimentador nesta unidade.</p>
        ) : isMobile ? (
          <VerticalBus
            columns={columns}
            busOn={busOn}
            live={live}
            tenantSlug={tenantSlug}
            mainKw={mainLive?.values.Total_kW}
          />
        ) : (
          <HorizontalBus
            columns={columns}
            busOn={busOn}
            live={live}
            tenantSlug={tenantSlug}
            mainKw={mainLive?.values.Total_kW}
          />
        )}
      </section>

      <Legend />
    </div>
  );
}

type Column = { kind: "meter"; meter: Meter } | { kind: "unmeasured"; kw: number };

// ---------------------------------------------------------------------------
// Entrada com grupo gerador: rede e gerador chegam ao QTA (chave de transferência)
// ---------------------------------------------------------------------------

const TRANSFER_TONE = {
  ok: "border-success/40",
  info: "border-info/50 bg-info/10",
  warn: "border-warning/50 bg-warning/10",
  critical: "border-destructive/50 bg-destructive/10",
  muted: "border-border bg-muted/40",
} as const;

function SourcesWithTransfer({
  tenantSlug,
  gen,
  transfer,
  mainLive,
}: {
  tenantSlug: string;
  gen: GeneratorView;
  transfer: TransferState;
  mainLive: LiveMeter | undefined;
}) {
  const fromMains = transfer.source === "mains";
  const fromGenerator = transfer.source === "generator";
  const line = (on: boolean) => ({ background: on ? LINE_COLOR.on : LINE_COLOR.off, opacity: on ? 1 : 0.5 });

  return (
    <div className="flex w-full max-w-xl flex-col items-center">
      <div className="grid w-full grid-cols-2 gap-x-6">
        {/* Rede da concessionária */}
        <div className="flex flex-col items-center text-center">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <UtilityPoleIcon className="size-4 text-muted-foreground" aria-hidden />
            Rede da concessionária
          </p>
          <p className="text-xs text-muted-foreground tabular">
            {transfer.mainsPresent === null ? "sem leitura" : transfer.mainsPresent ? "presente" : "ausente"}
            {mainLive?.status === "online" && mainLive.values.VLL_AVG !== undefined && (
              <> · {formatField("VLL_AVG", mainLive.values.VLL_AVG)}</>
            )}
          </p>
          <Breaker on={fromMains} />
        </div>
        {/* Grupo gerador */}
        <Link
          href={`/app/${tenantSlug}/gerador`}
          className="flex flex-col items-center rounded-lg text-center transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <span
              aria-hidden
              className="inline-flex size-4 items-center justify-center rounded-full border border-current text-[10px] font-semibold text-muted-foreground"
            >
              G
            </span>
            {gen.name}
          </p>
          <p className="text-xs text-muted-foreground tabular">
            {generatorStatusText(gen)}
            {gen.running && gen.powerKw !== null && <> · {formatNumber(gen.powerKw, 0)} kW</>}
          </p>
          <Breaker
            on={fromGenerator}
            open={gen.live?.online ? gen.breakerClosed === false : undefined}
            label={
              gen.live?.online && gen.breakerClosed !== null ? (gen.breakerClosed ? "fechado" : "aberto") : undefined
            }
          />
        </Link>
      </div>
      {/* Coletor das duas fontes até o QTA */}
      <div aria-hidden className="relative h-1 w-full">
        <span
          className="absolute top-0 h-1 rounded-l-full"
          style={{ left: "calc((100% - 1.5rem) / 4)", right: "50%", ...line(fromMains) }}
        />
        <span
          className="absolute top-0 h-1 rounded-r-full"
          style={{ left: "50%", right: "calc((100% - 1.5rem) / 4)", ...line(fromGenerator) }}
        />
      </div>
      <Stem on={fromMains || fromGenerator} />
      <div
        role="status"
        className={cn("w-full max-w-sm rounded-xl border-2 px-4 py-2 text-center", TRANSFER_TONE[transfer.tone])}
      >
        <p className="text-[11px] text-muted-foreground">QTA · chave de transferência</p>
        <p className="font-semibold">{transfer.label}</p>
        <p className="text-xs text-muted-foreground">{transfer.detail}</p>
      </div>
    </div>
  );
}

type BusProps = {
  columns: Column[];
  busOn: boolean;
  live: Record<string, LiveMeter>;
  tenantSlug: string;
  mainKw: number | undefined;
};

/** Barramento horizontal com os alimentadores em colunas (rola de lado se forem muitos). */
function HorizontalBus({ columns, busOn, live, tenantSlug, mainKw }: BusProps) {
  const n = columns.length;
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
      <div
        className="relative grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${n}, minmax(8.5rem, 1fr))`,
          // A caixa cresce com as colunas, para o barramento ir até a última.
          minWidth: `calc(${n} * 8.5rem + ${(n - 1) * 0.75}rem)`,
        }}
      >
        {/* Barramento: do centro da primeira coluna ao centro da última */}
        <div
          aria-hidden
          className="absolute top-0 h-1 rounded-full"
          style={{
            left: `calc((100% - ${(n - 1) * 0.75}rem) / ${2 * n})`,
            right: `calc((100% - ${(n - 1) * 0.75}rem) / ${2 * n})`,
            background: busOn ? LINE_COLOR.on : LINE_COLOR.off,
            opacity: busOn ? 1 : 0.5,
          }}
        />
        {columns.map((column) => (
          <div key={column.kind === "meter" ? column.meter.id : "unmeasured"} className="flex flex-col items-center">
            <FeederTop column={column} live={live} />
            <FeederCard column={column} live={live} tenantSlug={tenantSlug} mainKw={mainKw} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** No celular: barramento vertical à esquerda e um alimentador por linha. */
function VerticalBus({ columns, busOn, live, tenantSlug, mainKw }: BusProps) {
  return (
    <ol className="relative space-y-3 pl-10">
      <div
        aria-hidden
        className="absolute top-0 bottom-8 left-3 w-1 rounded-full"
        style={{ background: busOn ? LINE_COLOR.on : LINE_COLOR.off, opacity: busOn ? 1 : 0.5 }}
      />
      {columns.map((column) => {
        const on = column.kind === "meter" ? isEnergized(live[column.meter.id]) : column.kw > 0;
        return (
          <li key={column.kind === "meter" ? column.meter.id : "unmeasured"} className="relative">
            <span
              aria-hidden
              className="absolute top-8 -left-7 h-0.5 w-7"
              style={{
                background: on ? LINE_COLOR.on : LINE_COLOR.off,
                opacity: on ? 1 : 0.5,
              }}
            />
            <FeederCard column={column} live={live} tenantSlug={tenantSlug} mainKw={mainKw} />
          </li>
        );
      })}
    </ol>
  );
}

/** Ligação do barramento até o alimentador, com o disjuntor dele. */
function FeederTop({ column, live }: { column: Column; live: Record<string, LiveMeter> }) {
  if (column.kind === "unmeasured") return <Stem on={column.kw > 0} dashed tall />;
  const meterLive = live[column.meter.id];
  const load = meterLive?.status === "online" ? breakerLoad(meterLive.values, column.meter.breakerAmps) : null;
  return (
    <Breaker
      on={isEnergized(meterLive)}
      level={load?.level}
      label={column.meter.breakerAmps ? `${formatNumber(column.meter.breakerAmps, 0)} A` : undefined}
    />
  );
}

function Stem({ on, dashed = false, tall = false }: { on: boolean; dashed?: boolean; tall?: boolean }) {
  return (
    <svg aria-hidden width="12" height={tall ? 64 : 20} className="shrink-0 overflow-visible">
      <line
        x1="6"
        x2="6"
        y1="0"
        y2={tall ? 64 : 20}
        stroke={on ? LINE_COLOR.on : LINE_COLOR.off}
        strokeOpacity={on ? 1 : 0.5}
        strokeWidth="2"
        strokeDasharray={dashed || !on ? "4 3" : undefined}
      />
    </svg>
  );
}

/**
 * Disjuntor no padrão de diagrama unifilar: chave com um "×" no contato fixo.
 * A cor de destaque aparece com carga alta ou acima do disjuntor.
 */
function Breaker({
  on,
  level,
  label,
  open = false,
}: {
  on: boolean;
  level?: BreakerLevel;
  label?: string;
  open?: boolean;
}) {
  const stroke = on ? LINE_COLOR.on : LINE_COLOR.off;
  const accent = level ? LEVEL_COLOR[level] : null;
  return (
    <div className="relative flex h-16 w-full justify-center">
      <svg aria-hidden width="24" height="64" viewBox="0 0 24 64" className="overflow-visible">
        <line
          x1="12"
          x2="12"
          y1="0"
          y2="20"
          stroke={stroke}
          strokeOpacity={on ? 1 : 0.5}
          strokeWidth="2"
          strokeDasharray={on ? undefined : "4 3"}
        />
        <line
          x1="12"
          x2="12"
          y1="44"
          y2="64"
          stroke={stroke}
          strokeOpacity={on ? 1 : 0.5}
          strokeWidth="2"
          strokeDasharray={on ? undefined : "4 3"}
        />
        {/* lâmina (fechada, ou inclinada quando aberta) e o × do contato fixo */}
        <line
          x1="12"
          y1="44"
          x2={open ? "24" : "12"}
          y2={open ? "24" : "20"}
          stroke={accent ?? stroke}
          strokeOpacity={on || accent ? 1 : 0.5}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M8 16 L16 24 M16 16 L8 24"
          stroke={accent ?? "var(--foreground)"}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      {label && (
        <span className="absolute top-1/2 left-1/2 ml-5 -translate-y-1/2 text-[11px] whitespace-nowrap text-muted-foreground tabular">
          {label}
          {level && level !== "normal" && (
            <span
              className={cn("ml-1 inline-flex align-middle", level === "over" ? "text-destructive" : "text-warning")}
            >
              {level === "over" ? (
                <OctagonAlertIcon className="size-3.5" />
              ) : (
                <TriangleAlertIcon className="size-3.5" />
              )}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function MainCard({ tenantSlug, meter, live }: { tenantSlug: string; meter: Meter; live: LiveMeter | undefined }) {
  const online = live?.status === "online";
  const v = live?.values ?? {};
  const load = online ? breakerLoad(v, meter.breakerAmps) : null;
  return (
    <Link
      href={`/app/${tenantSlug}/medidores/${meter.id}`}
      className="block w-full max-w-sm rounded-xl border-2 border-primary/40 bg-card p-4 transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate font-medium">
          {plantTag(meter.tag) && (
            <span className="mr-2 font-mono text-xs text-muted-foreground">{plantTag(meter.tag)}</span>
          )}
          {meter.name}
        </p>
        <span className="shrink-0 text-[11px] text-muted-foreground">Entrada geral</span>
      </div>
      {online ? (
        <>
          <p className="mt-2 flex items-baseline gap-1.5">
            <span className="font-heading text-3xl font-semibold">{formatNumber(v.Total_kW, 1)}</span>
            <span className="text-sm text-muted-foreground">kW</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular">
            {formatField("Total_kVA", v.Total_kVA)} · FP {formatField("PF_AVG", v.PF_AVG)} ·{" "}
            {formatField("I_AVG", v.I_AVG)}
          </p>
          {load && <BreakerLoadBar load={load} className="mt-3" />}
        </>
      ) : (
        <OfflineNote live={live} />
      )}
    </Link>
  );
}

function FeederCard({
  column,
  live,
  tenantSlug,
  mainKw,
}: {
  column: Column;
  live: Record<string, LiveMeter>;
  tenantSlug: string;
  mainKw: number | undefined;
}) {
  if (column.kind === "unmeasured") {
    const share = mainKw ? (column.kw / mainKw) * 100 : null;
    return (
      <div
        className="w-full rounded-xl border border-dashed bg-muted/40 p-3"
        title="Entrada geral menos a soma dos setores: cargas sem medidor e perdas."
      >
        <p className="text-sm font-medium text-muted-foreground">Não medido</p>
        <p className="mt-2 flex items-baseline gap-1">
          <span className="font-heading text-xl font-semibold text-muted-foreground">{formatNumber(column.kw, 1)}</span>
          <span className="text-xs text-muted-foreground">kW</span>
        </p>
        {share !== null && (
          <p className="mt-1 text-xs text-muted-foreground tabular">{formatNumber(share, 1)} % da entrada</p>
        )}
      </div>
    );
  }

  const { meter } = column;
  const meterLive = live[meter.id];
  const online = meterLive?.status === "online";
  const v = meterLive?.values ?? {};
  const load = online ? breakerLoad(v, meter.breakerAmps) : null;
  return (
    <Link
      href={`/app/${tenantSlug}/medidores/${meter.id}`}
      className="block w-full rounded-xl border bg-card p-3 transition-colors hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none"
    >
      {plantTag(meter.tag) && <p className="font-mono text-[11px] text-muted-foreground">{plantTag(meter.tag)}</p>}
      <p className="line-clamp-2 min-h-10 text-sm leading-5 font-medium">{meter.name}</p>
      {online ? (
        <>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="font-heading text-xl font-semibold">{formatNumber(v.Total_kW, 1)}</span>
            <span className="text-xs text-muted-foreground">kW</span>
          </p>
          {load ? (
            <BreakerLoadBar load={load} compact className="mt-2" />
          ) : (
            <p className="mt-1 text-xs text-muted-foreground tabular">{formatField("I_AVG", v.I_AVG)}</p>
          )}
        </>
      ) : (
        <OfflineNote live={meterLive} />
      )}
    </Link>
  );
}

function OfflineNote({ live }: { live: LiveMeter | undefined }) {
  return (
    <p className="mt-2 text-xs text-warning">
      {live?.status === "offline" ? (
        <>
          Sem comunicação · <RelativeTime value={live.time} />
        </>
      ) : (
        "Sem leituras"
      )}
    </p>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
      <li className="flex items-center gap-2">
        <span aria-hidden className="h-0.5 w-5 rounded-full" style={{ background: LINE_COLOR.on }} />
        Com corrente
      </li>
      <li className="flex items-center gap-2">
        <span
          aria-hidden
          className="w-5 border-t-2 border-dashed"
          style={{ borderColor: LINE_COLOR.off, opacity: 0.6 }}
        />
        Sem corrente ou sem comunicação
      </li>
      <li className="flex items-center gap-1.5">
        <TriangleAlertIcon className="size-3.5 text-warning" aria-hidden />
        Carga alta (80 % do disjuntor ou mais)
      </li>
      <li className="flex items-center gap-1.5">
        <OctagonAlertIcon className="size-3.5 text-destructive" aria-hidden />
        Acima do disjuntor
      </li>
    </ul>
  );
}
