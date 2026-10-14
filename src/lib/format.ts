import { FIELD_BY_KEY } from "./meter-fields";

const numberFormatters = new Map<number, Intl.NumberFormat>();

function numberFormatter(digits: number) {
  let formatter = numberFormatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormatters.set(digits, formatter);
  }
  return formatter;
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return numberFormatter(digits).format(value);
}

/** Valor de um campo do medidor com a unidade, ex.: "220,4 V". */
export function formatField(key: string, value: number | null | undefined): string {
  const field = FIELD_BY_KEY.get(key);
  const text = formatNumber(value, field?.digits ?? 2);
  return text === "—" || !field?.unit ? text : `${text} ${field.unit}`;
}

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" });

export function formatDateTime(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return dateTimeFormatter.format(new Date(value));
}

const relativeFormatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

/** "há 12 segundos", "há 3 horas"… */
export function formatRelative(value: Date | string | number, now = Date.now()): string {
  const diffSeconds = Math.round((new Date(value).getTime() - now) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return relativeFormatter.format(diffSeconds, "second");
  if (abs < 3600) return relativeFormatter.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86_400) return relativeFormatter.format(Math.round(diffSeconds / 3600), "hour");
  return relativeFormatter.format(Math.round(diffSeconds / 86_400), "day");
}

export function formatCnpj(digits: string | null | undefined): string {
  if (!digits) return "—";
  const d = digits.replace(/\D/g, "");
  if (d.length !== 14) return digits;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moneyFormatterRound = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/** Valor em reais: "R$ 1.234,56" (ou sem centavos com `round`). */
export function formatMoney(value: number | null | undefined, round = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return (round ? moneyFormatterRound : moneyFormatter).format(value);
}

/** Variação percentual com sinal: "+12,3 %"; null quando não há base de comparação. */
export function formatChange(current: number, previous: number | null | undefined): string | null {
  if (previous === null || previous === undefined || previous <= 0) return null;
  const change = ((current - previous) / previous) * 100;
  return `${change > 0 ? "+" : change < 0 ? "−" : ""}${numberFormatter(1).format(Math.abs(change))} %`;
}
