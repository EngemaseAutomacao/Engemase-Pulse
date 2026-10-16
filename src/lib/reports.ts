import { addZoned, zonedParts } from "@/lib/tz";

/**
 * Relatórios mensais para imprimir ou salvar em PDF: energia, demanda e fator
 * de potência, gerador, água e o comparativo entre unidades. Aqui ficam a lista
 * (para a navegação entre eles) e as contas puras, usadas pelo servidor.
 */

export const REPORTS = [
  { id: "energia", path: "", label: "Energia" },
  { id: "demanda", path: "/demanda", label: "Demanda e fator de potência" },
  { id: "gerador", path: "/gerador", label: "Gerador" },
  { id: "agua", path: "/agua", label: "Água" },
  { id: "unidades", path: "/unidades", label: "Comparativo entre unidades" },
] as const;

export type ReportKind = (typeof REPORTS)[number]["id"];

/** Endereço de um relatório, levando a unidade e o mês escolhidos. */
export function reportHref(slug: string, kind: ReportKind, month?: string, siteId?: string): string {
  const path = REPORTS.find((r) => r.id === kind)!.path;
  const query = new URLSearchParams();
  if (month) query.set("mes", month);
  if (siteId && kind !== "unidades") query.set("unidade", siteId);
  const qs = query.toString();
  return `/relatorio/${slug}${path}${qs ? `?${qs}` : ""}`;
}

/** Duração legível de um intervalo em ms ("45 min", "3 h 10 min", "2 dias"). */
export function formatSpan(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} dias`;
}

// ---------------------------------------------------------------------------
// Gerador: semanas com partida
// ---------------------------------------------------------------------------

export type WeekCoverage = {
  /** Início da semana (segunda, 0h no fuso da unidade), epoch ms. */
  start: number;
  /** Teve partida que assumiu (teste, exercício ou falta de rede). */
  ok: boolean;
  /** Semana ainda em andamento (sem partida ainda não é atraso). */
  open: boolean;
};

/** Segundas-feiras (0h no fuso) das semanas que tocam a janela. */
export function weekStartsOf(start: Date, stop: Date, timeZone: string): number[] {
  const p = zonedParts(start, timeZone);
  // dia da semana do 1º dia (0 = domingo); volta até a segunda
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  let monday = addZoned("day", start, -((weekday + 6) % 7), timeZone);
  const out: number[] = [];
  while (monday < stop) {
    out.push(monday.getTime());
    monday = addZoned("day", monday, 7, timeZone);
  }
  return out;
}

/**
 * Semanas (segunda a domingo) que tocam o mês e se o grupo partiu bem em cada
 * uma. O teste semanal é o que garante que ele parte quando a rede cair; uma
 * falta de rede atendida também prova que funciona.
 */
export function weeklyCoverage(
  weekStarts: number[],
  runs: { startedAt: number; ok: boolean }[],
  now: number,
): WeekCoverage[] {
  return weekStarts.map((start, i) => {
    const end = weekStarts[i + 1] ?? start + 7 * 86_400_000;
    return {
      start,
      ok: runs.some((r) => r.ok && r.startedAt >= start && r.startedAt < end),
      open: end > now,
    };
  });
}

// ---------------------------------------------------------------------------
// Demanda e fator de potência
// ---------------------------------------------------------------------------

/** Fator de potência mínimo sem cobrança de reativo excedente (ANEEL). */
export const PF_MINIMUM = 0.92;

/** As N maiores janelas de demanda, sem repetir o mesmo dia (o pico de cada dia). */
export function topDemandWindows<T extends { start: number; kw: number; day: number }>(windows: T[], n = 10): T[] {
  const bestByDay = new Map<number, T>();
  for (const w of windows) {
    const cur = bestByDay.get(w.day);
    if (!cur || w.kw > cur.kw) bestByDay.set(w.day, w);
  }
  return [...bestByDay.values()].sort((a, b) => b.kw - a.kw).slice(0, n);
}

/** Fator de potência global pela energia: kWh ÷ kVAh (null sem os dois). */
export function energyPowerFactor(kwh: number, kvah: number): number | null {
  if (!(kwh > 0) || !(kvah > 0)) return null;
  return Math.min(1, kwh / kvah);
}
