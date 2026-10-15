import { cn } from "@/lib/utils";

/** Cores das séries por posição (validadas para daltonismo no fundo escuro). */
export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"] as const;

export const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 } as const;
export const GRID_STROKE = "var(--border)";

export type LegendItem = { key: string; label: string; color: string };

/** Legenda: traço colorido + texto em cor de texto (nunca o texto colorido). */
export function SeriesLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  if (items.length < 2) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Caixa do tooltip compartilhada pelos gráficos. */
export function TooltipBox({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle?: string;
  /** dashed: traço tracejado (ex.: período anterior). */
  rows: { key: string; label: string; value: string; color?: string; dashed?: boolean }[];
}) {
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{title}</p>
      {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {row.color && (
                <span
                  aria-hidden
                  className="w-3 shrink-0"
                  style={
                    row.dashed
                      ? { borderTop: `2px dashed ${row.color}` }
                      : { height: 2, borderRadius: 999, backgroundColor: row.color }
                  }
                />
              )}
              {row.label}
            </span>
            <span className="tabular font-medium text-foreground">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mensagem dentro da área do gráfico (carregando, erro, vazio). */
export function ChartMessage({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "error" }) {
  return (
    <div
      className={cn(
        "flex h-full items-center justify-center px-6 text-center text-sm",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}
