import { formatNumber } from "@/lib/format";
import { belowCritical, type LevelMark } from "@/lib/utilities";
import { cn } from "@/lib/utils";

const MARK_STROKE: Record<LevelMark["tone"], string> = {
  critical: "var(--destructive)",
  warning: "var(--warning)",
  info: "var(--muted-foreground)",
};

/**
 * Reservatório (ou tanque de diesel) desenhado em corte, como no desenho
 * técnico: paredes, linha de cota do nível e marcas de 25/50/75 %. Com as
 * linhas de nível do gateway (alto, partida da bomba, baixo, crítico), elas
 * substituem as marcas fixas. O líquido fica na cor da água; abaixo do mínimo,
 * o contorno vira atenção (ou crítico, abaixo de uma linha crítica).
 */
export function TankFigure({
  levelPct,
  label,
  low,
  marks = [],
  fluid = "water",
  className,
}: {
  levelPct: number | null;
  /** Texto para leitores de tela. */
  label: string;
  /** Nível mínimo (%), desenhado como marca tracejada (só sem as linhas do gateway). */
  low?: number;
  /** Linhas de nível do gateway. */
  marks?: LevelMark[];
  fluid?: "water" | "diesel";
  className?: string;
}) {
  const level = levelPct === null ? null : Math.max(0, Math.min(100, levelPct));
  const W = 120;
  const H = 160;
  const top = 12;
  const bottom = H - 8;
  const inner = bottom - top;
  const y = level === null ? bottom : bottom - (inner * level) / 100;
  const hasMarks = marks.length > 0;
  const critical = hasMarks && belowCritical(level, marks);
  const isLow = !hasMarks && level !== null && low !== undefined && level < low;
  const fill = fluid === "water" ? "var(--chart-1)" : "var(--chart-4)";
  const yOf = (pct: number) => bottom - (inner * pct) / 100;
  // Rótulos da direita: de cima para baixo, empurrando o que ficaria colado.
  const markLabels = marks.reduce<(LevelMark & { yLine: number; yText: number })[]>((out, m) => {
    const yLine = yOf(m.value);
    const yText = Math.max(yLine + 4, (out.at(-1)?.yText ?? -Infinity) + 11);
    return [...out, { ...m, yLine, yText }];
  }, []);

  return (
    <svg
      viewBox={`0 0 ${W + 44} ${H}`}
      role="img"
      aria-label={`${label}: ${level === null ? "sem leitura" : `${formatNumber(level, 0)} %`}`}
      className={cn("h-40 w-auto shrink-0", className)}
    >
      <defs>
        <clipPath id={`tank-${fluid}`}>
          <rect x={10} y={top} width={W - 20} height={inner} rx={6} />
        </clipPath>
      </defs>
      {level !== null && (
        <g clipPath={`url(#tank-${fluid})`}>
          <rect x={10} y={y} width={W - 20} height={bottom - y} fill={fill} opacity={0.35} />
          <line x1={10} x2={W - 10} y1={y} y2={y} stroke={fill} strokeWidth={2} />
        </g>
      )}
      <rect
        x={10}
        y={top}
        width={W - 20}
        height={inner}
        rx={6}
        fill="none"
        stroke={critical ? "var(--destructive)" : isLow ? "var(--warning)" : "var(--muted-foreground)"}
        strokeWidth={critical || isLow ? 2.5 : 1.5}
      />
      {markLabels.map((m) => (
        <g key={`${m.value}-${m.label}`}>
          <line x1={10} x2={W - 2} y1={m.yLine} y2={m.yLine} stroke={MARK_STROKE[m.tone]} strokeDasharray="4 3" strokeWidth={1.25} />
          <text x={W + 2} y={m.yText} fontSize={10} fill="var(--muted-foreground)">
            {formatNumber(m.value, 0)}%
          </text>
        </g>
      ))}
      {!hasMarks && [25, 50, 75].map((m) => {
        const my = bottom - (inner * m) / 100;
        return (
          <g key={m}>
            <line x1={W - 10} x2={W - 2} y1={my} y2={my} stroke="var(--muted-foreground)" strokeWidth={1} />
            <text x={W + 2} y={my + 4} fontSize={10} fill="var(--muted-foreground)">
              {m}%
            </text>
          </g>
        );
      })}
      {!hasMarks && low !== undefined && (
        <line
          x1={10}
          x2={W - 10}
          y1={bottom - (inner * low) / 100}
          y2={bottom - (inner * low) / 100}
          stroke="var(--warning)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
      {level !== null && (
        <text x={W / 2} y={Math.min(bottom - 6, Math.max(top + 14, y - 6))} textAnchor="middle" fontSize={14} fontWeight={600} fill="var(--foreground)">
          {formatNumber(level, 0)}%
        </text>
      )}
    </svg>
  );
}

/** Legenda das linhas de nível: traço na cor da linha, nome e valor. */
export function LevelMarksLegend({ marks, className }: { marks: LevelMark[]; className?: string }) {
  if (marks.length === 0) return null;
  return (
    <ul className={cn("space-y-1 text-xs text-muted-foreground", className)} aria-label="Linhas de nível">
      {marks.map((m) => (
        <li key={`${m.value}-${m.label}`} className="flex items-center gap-2">
          <svg width="16" height="6" aria-hidden className="shrink-0">
            <line x1="0" x2="16" y1="3" y2="3" stroke={MARK_STROKE[m.tone]} strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          <span className="first-letter:uppercase">{m.label}</span>
          <span className="ml-auto tabular">{formatNumber(m.value, 0)} %</span>
        </li>
      ))}
    </ul>
  );
}
