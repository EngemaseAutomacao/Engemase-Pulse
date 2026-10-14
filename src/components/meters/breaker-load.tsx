import { OctagonAlertIcon, TriangleAlertIcon } from "lucide-react";
import { BREAKER_HIGH_LOAD, BREAKER_LEVEL_LABEL, breakerLoad, type BreakerLoad } from "@/lib/breaker";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const LEVEL_STYLE = {
  normal: { bar: "bg-primary", text: "text-muted-foreground", icon: null },
  high: { bar: "bg-warning", text: "text-warning", icon: TriangleAlertIcon },
  over: { bar: "bg-destructive", text: "text-destructive", icon: OctagonAlertIcon },
} as const;

/**
 * Carga do disjuntor em barra (0–100 %; acima disso a barra fica cheia e o
 * texto diz quanto passou). Carga alta e sobrecarga vêm com ícone e texto,
 * não só com a cor.
 */
export function BreakerLoadBar({
  load,
  compact = false,
  className,
}: {
  load: BreakerLoad;
  compact?: boolean;
  className?: string;
}) {
  const style = LEVEL_STYLE[load.level];
  const Icon = style.icon;
  const percent = Math.round(load.ratio * 100);
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-muted-foreground">
          {compact ? "" : "Disjuntor "}
          {formatNumber(load.ratedAmps, 0)} A
        </span>
        <span className={cn("flex shrink-0 items-center gap-1 font-medium tabular", style.text)}>
          {Icon && <Icon className="size-3.5" aria-hidden />}
          {load.level !== "normal" && !compact && <span>{BREAKER_LEVEL_LABEL[load.level]} ·</span>}
          {percent} %
        </span>
      </div>
      <div
        role="meter"
        aria-label={`Carga do disjuntor${load.level !== "normal" ? ` (${BREAKER_LEVEL_LABEL[load.level].toLowerCase()})` : ""}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent} %`}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", style.bar)}
          style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
        />
      </div>
      {!compact && (
        <p className="text-[11px] text-muted-foreground tabular">
          {load.phase ? `Fase mais carregada: ${load.phase}, ` : "Corrente média: "}
          {formatNumber(load.amps, 1)} A
        </p>
      )}
    </div>
  );
}

const PHASES = [
  ["L1", "I1"],
  ["L2", "I2"],
  ["L3", "I3"],
] as const;

const levelOf = (ratio: number) => (ratio > 1 ? "over" : ratio >= BREAKER_HIGH_LOAD ? "high" : "normal");

/** Carga do disjuntor por fase (página do medidor). */
export function PhaseLoads({ values, ratedAmps }: { values: Record<string, number>; ratedAmps: number }) {
  const load = breakerLoad(values, ratedAmps);
  if (!load) return null;
  const phases = PHASES.filter(([, key]) => Number.isFinite(values[key]));
  const overall = LEVEL_STYLE[load.level];
  const OverallIcon = overall.icon;

  return (
    <div className="space-y-3 surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Carga do disjuntor de {formatNumber(ratedAmps, 0)} A</p>
        <p className={cn("flex items-center gap-1 text-xs font-medium", overall.text)}>
          {OverallIcon && <OverallIcon className="size-3.5" aria-hidden />}
          {BREAKER_LEVEL_LABEL[load.level]}
          {load.phase && load.level !== "normal" && ` na fase ${load.phase}`}
        </p>
      </div>
      {phases.length === 0 ? (
        <BreakerLoadBar load={load} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {phases.map(([label, key]) => {
            const ratio = values[key] / ratedAmps;
            const style = LEVEL_STYLE[levelOf(ratio)];
            const percent = Math.round(ratio * 100);
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium">{label}</span>
                  <span className="text-muted-foreground tabular">
                    {formatNumber(values[key], 1)} A ·{" "}
                    <span
                      className={cn(
                        "font-medium",
                        style.text === "text-muted-foreground" ? "text-foreground" : style.text,
                      )}
                    >
                      {percent} %
                    </span>
                  </span>
                </div>
                <div
                  role="meter"
                  aria-label={`Carga da fase ${label}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  aria-valuetext={`${percent} %`}
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={cn("h-full rounded-full", style.bar)}
                    style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
