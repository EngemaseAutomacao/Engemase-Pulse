import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Reservatório (ou tanque de diesel) desenhado em corte, como no desenho
 * técnico: paredes, linha de cota do nível e marcas de 25/50/75 %. O líquido
 * fica na cor da água; abaixo do mínimo, o contorno vira atenção.
 */
export function TankFigure({
  levelPct,
  label,
  low,
  fluid = "water",
  className,
}: {
  levelPct: number | null;
  /** Texto para leitores de tela. */
  label: string;
  /** Nível mínimo (%), desenhado como marca tracejada. */
  low?: number;
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
  const isLow = level !== null && low !== undefined && level < low;
  const fill = fluid === "water" ? "var(--chart-1)" : "var(--chart-4)";

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
        stroke={isLow ? "var(--warning)" : "var(--muted-foreground)"}
        strokeWidth={isLow ? 2.5 : 1.5}
      />
      {[25, 50, 75].map((m) => {
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
      {low !== undefined && (
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
