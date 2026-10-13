/**
 * Datas em fuso horário arbitrário sem bibliotecas: usa a base de fusos do
 * próprio runtime (Intl). Necessário para agrupar consumo pelo dia local da
 * unidade, não pelo dia UTC do servidor.
 */

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let formatter = partFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Componentes de relógio local (mês 1–12) de um instante no fuso informado. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Diferença (ms) entre o relógio local e o UTC naquele instante. */
export function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instante UTC correspondente a um horário de relógio local (aceita mês/dia fora da faixa). */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour);
  // Duas iterações resolvem a troca de offset em transições de horário de verão.
  let guess = wall - timeZoneOffsetMs(new Date(wall), timeZone);
  guess = wall - timeZoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

export type CalendarUnit = "hour" | "day" | "month";

export function startOfZoned(unit: CalendarUnit, date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  if (unit === "month") return zonedTimeToUtc(p.year, p.month, 1, 0, timeZone);
  if (unit === "day") return zonedTimeToUtc(p.year, p.month, p.day, 0, timeZone);
  return zonedTimeToUtc(p.year, p.month, p.day, p.hour, timeZone);
}

/** Soma `amount` unidades de calendário (pode ser negativo), no relógio local. */
export function addZoned(unit: CalendarUnit, date: Date, amount: number, timeZone: string): Date {
  if (unit === "hour") return new Date(date.getTime() + amount * 3_600_000);
  const p = zonedParts(date, timeZone);
  if (unit === "day") return zonedTimeToUtc(p.year, p.month, p.day + amount, p.hour, timeZone);
  return zonedTimeToUtc(p.year, p.month + amount, p.day, p.hour, timeZone);
}
