import Link from "next/link";
import { breakerLoad } from "@/lib/breaker";
import { formatField, formatNumber } from "@/lib/format";
import type { LiveMeter } from "@/lib/telemetry-types";
import { cn } from "@/lib/utils";
import { BreakerLoadBar } from "./breaker-load";
import { RelativeTime } from "./relative-time";
import { StatusBadge } from "./status-badge";
import { plantTag } from "@/lib/meter-label";

export type MeterSummary = {
  id: string;
  tag: string;
  name: string;
  siteId: string;
  siteName: string;
  location: string | null;
  /** Entrada geral: nos totais, substitui a soma dos alimentadores da unidade. */
  isMain: boolean;
  /** Disjuntor do circuito (A); sem ele o cartão não mostra a carga. */
  breakerAmps: number | null;
};

const SECONDARY_FIELDS = [
  { key: "I_AVG", label: "Corrente média" },
  { key: "VLL_AVG", label: "Tensão L-L" },
  { key: "PF_AVG", label: "Fator de potência" },
  { key: "Frequencia", label: "Frequência" },
] as const;

/** Cartão do medidor no painel: potência em destaque e os principais valores. */
export function MeterCard({
  meter,
  live,
  href,
  loading,
}: {
  meter: MeterSummary;
  live: LiveMeter | undefined;
  href: string;
  loading: boolean;
}) {
  const values = live?.values ?? {};
  const stale = live?.status !== "online";
  const load = live?.status === "online" ? breakerLoad(values, meter.breakerAmps) : null;

  return (
    <Link
      href={href}
      className="surface group flex flex-col gap-4 p-4 transition-colors hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {plantTag(meter.tag) && (
              <span className="mr-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {plantTag(meter.tag)}
              </span>
            )}
            {meter.name}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {meter.siteName}
            {meter.location ? ` · ${meter.location}` : ""}
          </p>
        </div>
        <StatusBadge status={loading && !live ? "loading" : (live?.status ?? "no-data")} />
      </div>

      <div className={cn("flex items-baseline gap-1.5", stale && "opacity-60")}>
        <span className="font-heading text-3xl font-semibold">{formatNumber(values.Total_kW, 1)}</span>
        <span className="text-sm text-muted-foreground">kW</span>
      </div>

      <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-2 text-sm", stale && "opacity-60")}>
        {SECONDARY_FIELDS.map((f) => (
          <div key={f.key} className="min-w-0">
            <dt className="truncate text-xs text-muted-foreground">{f.label}</dt>
            <dd className="tabular truncate font-medium">{formatField(f.key, values[f.key])}</dd>
          </div>
        ))}
      </dl>

      {load && <BreakerLoadBar load={load} />}

      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span className="tabular truncate">{formatField("Total_net_kWh", values.Total_net_kWh)}</span>
        <RelativeTime value={live?.time ?? null} />
      </div>
    </Link>
  );
}
