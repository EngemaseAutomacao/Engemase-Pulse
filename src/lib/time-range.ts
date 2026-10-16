import { addZoned, startOfZoned, type CalendarUnit } from "./tz";

// ---------------------------------------------------------------------------
// Histórico (gráficos de linha)
// ---------------------------------------------------------------------------

export const HISTORY_RANGES = [
  { id: "1h", label: "1 h", durationMs: 3_600_000 },
  { id: "6h", label: "6 h", durationMs: 6 * 3_600_000 },
  { id: "24h", label: "24 h", durationMs: 24 * 3_600_000 },
  { id: "7d", label: "7 dias", durationMs: 7 * 86_400_000 },
  { id: "30d", label: "30 dias", durationMs: 30 * 86_400_000 },
] as const;

export type HistoryRangeId = (typeof HISTORY_RANGES)[number]["id"];

export const HISTORY_RANGE_IDS = HISTORY_RANGES.map((r) => r.id) as [HistoryRangeId, ...HistoryRangeId[]];

/** Maior intervalo que uma consulta personalizada pode cobrir. */
export const MAX_HISTORY_SPAN_MS = 366 * 86_400_000;

/** Menor intervalo de zoom/período personalizado (6 pontos de 5 min). */
export const MIN_HISTORY_SPAN_MS = 30 * 60_000;

/**
 * Janelas de agregação possíveis, da menor para a maior. A menor é 5 min
 * porque é a resolução guardada (resumo de 5 min do gateway).
 */
const WINDOW_LADDER: { every: string; ms: number }[] = [
  { every: "5m", ms: 300_000 },
  { every: "10m", ms: 600_000 },
  { every: "15m", ms: 900_000 },
  { every: "30m", ms: 1_800_000 },
  { every: "1h", ms: 3_600_000 },
  { every: "2h", ms: 7_200_000 },
  { every: "3h", ms: 10_800_000 },
  { every: "6h", ms: 21_600_000 },
  { every: "12h", ms: 43_200_000 },
  { every: "1d", ms: 86_400_000 },
];

/** Menor janela que mantém o gráfico com no máximo `maxPoints` pontos. */
export function aggregationWindow(spanMs: number, maxPoints = 360): { every: string; ms: number } {
  return WINDOW_LADDER.find((w) => spanMs / w.ms <= maxPoints) ?? WINDOW_LADDER[WINDOW_LADDER.length - 1];
}

export type ResolvedRange = { start: Date; stop: Date; every: string; everyMs: number };

export function resolveHistoryRange(rangeId: HistoryRangeId, now: Date): ResolvedRange {
  const range = HISTORY_RANGES.find((r) => r.id === rangeId) ?? HISTORY_RANGES[2];
  const window = aggregationWindow(range.durationMs);
  return { start: new Date(now.getTime() - range.durationMs), stop: now, every: window.every, everyMs: window.ms };
}

export function resolveCustomRange(start: Date, stop: Date): ResolvedRange {
  const window = aggregationWindow(stop.getTime() - start.getTime());
  return { start, stop, every: window.every, everyMs: window.ms };
}

// ---------------------------------------------------------------------------
// Consumo de energia (gráficos de barras)
// ---------------------------------------------------------------------------

export type EnergyInterval = "1h" | "1d" | "1mo";

export const ENERGY_PERIODS = [
  { id: "today", label: "Hoje", interval: "1h" },
  { id: "7d", label: "7 dias", interval: "1d" },
  { id: "30d", label: "30 dias", interval: "1d" },
  { id: "12m", label: "12 meses", interval: "1mo" },
] as const satisfies readonly { id: string; label: string; interval: EnergyInterval }[];

export type EnergyPeriodId = (typeof ENERGY_PERIODS)[number]["id"];

export const ENERGY_PERIOD_IDS = ENERGY_PERIODS.map((p) => p.id) as [EnergyPeriodId, ...EnergyPeriodId[]];

export const INTERVAL_UNIT: Record<EnergyInterval, CalendarUnit> = { "1h": "hour", "1d": "day", "1mo": "month" };

/** Energia ativa (kWh, a padrão) ou aparente (kVAh). */
export type EnergyQuantity = "ACTIVE" | "APPARENT";

export type EnergyWindow = {
  start: Date;
  stop: Date;
  interval: EnergyInterval;
  timeZone: string;
  /** Sem informar: energia ativa. */
  quantity?: EnergyQuantity;
};

/** Período de consumo alinhado ao calendário local da unidade. */
export function resolveEnergyPeriod(periodId: EnergyPeriodId, now: Date, timeZone: string): EnergyWindow {
  switch (periodId) {
    case "today": {
      const start = startOfZoned("day", now, timeZone);
      return { start, stop: addZoned("day", start, 1, timeZone), interval: "1h", timeZone };
    }
    case "7d":
    case "30d": {
      const days = periodId === "7d" ? 7 : 30;
      const today = startOfZoned("day", now, timeZone);
      return {
        start: addZoned("day", today, -(days - 1), timeZone),
        stop: addZoned("day", today, 1, timeZone),
        interval: "1d",
        timeZone,
      };
    }
    case "12m": {
      const month = startOfZoned("month", now, timeZone);
      return {
        start: addZoned("month", month, -11, timeZone),
        stop: addZoned("month", month, 1, timeZone),
        interval: "1mo",
        timeZone,
      };
    }
  }
}

/** Início de cada janela do período (para desenhar o eixo completo, inclusive vazios). */
export function energyBucketStarts(window: EnergyWindow): Date[] {
  const unit = INTERVAL_UNIT[window.interval];
  const starts: Date[] = [];
  for (let t = window.start; t < window.stop; t = addZoned(unit, t, 1, window.timeZone)) starts.push(t);
  return starts;
}
