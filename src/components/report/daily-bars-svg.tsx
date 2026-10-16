import { formatNumber } from "@/lib/format";

/**
 * Barras por dia em SVG puro: sai igual na tela e no papel, sem depender de
 * JavaScript (os relatórios são para imprimir). Opcionalmente com uma linha de
 * referência (demanda contratada, nível crítico).
 */
export function DailyBarsSvg({
  days,
  values,
  timeZone,
  unit = "kWh",
  digits = 0,
  label = `Consumo por dia (${unit})`,
  reference,
  max: fixedMax,
}: {
  days: number[];
  values: (number | null)[];
  timeZone: string;
  unit?: string;
  digits?: number;
  /** Texto para leitores de tela. */
  label?: string;
  reference?: { value: number; label: string };
  /** Topo do eixo fixo (ex.: 100 para %); sem ele, arredonda o maior valor. */
  max?: number;
}) {
  const width = 720;
  const height = 190;
  const pad = { top: 10, right: 8, bottom: 22, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = fixedMax ?? niceCeil(Math.max(0, reference?.value ?? 0, ...values.map((v) => v ?? 0)));
  const slot = plotW / Math.max(days.length, 1);
  const barW = Math.max(2, Math.min(16, slot - 4));
  const y = (v: number) => pad.top + plotH - (max > 0 ? (Math.min(v, max) / max) * plotH : 0);
  const ticks = [0, max / 2, max];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--border)" />
          <text
            x={pad.left - 6}
            y={y(t)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="10"
            fill="var(--muted-foreground)"
          >
            {formatNumber(t, 0)}
          </text>
        </g>
      ))}
      {days.map((day, i) => {
        const v = values[i];
        const x = pad.left + i * slot + (slot - barW) / 2;
        const dayLabel = new Date(day).toLocaleDateString("pt-BR", { timeZone, day: "numeric" });
        return (
          <g key={day}>
            {v !== null && v > 0 && (
              <rect x={x} y={y(v)} width={barW} height={pad.top + plotH - y(v)} rx="2" fill="var(--primary)">
                <title>{`${dayLabel}: ${formatNumber(v, digits)} ${unit}`}</title>
              </rect>
            )}
            {(i === 0 || (i + 1) % 5 === 0) && (
              <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
                {dayLabel}
              </text>
            )}
          </g>
        );
      })}
      {reference && reference.value > 0 && (
        <g>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(reference.value)}
            y2={y(reference.value)}
            stroke="var(--destructive)"
            strokeDasharray="5 4"
            strokeWidth="1.5"
          />
          <text
            x={width - pad.right}
            y={y(reference.value) - 4}
            textAnchor="end"
            fontSize="10"
            fill="var(--muted-foreground)"
          >
            {reference.label}
          </text>
        </g>
      )}
    </svg>
  );
}

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
}
