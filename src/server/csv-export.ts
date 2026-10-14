import type { Series } from "./telemetry/types";

const decimal = new Intl.NumberFormat("pt-BR", { useGrouping: false, maximumFractionDigits: 6 });

/** Uma linha por instante, uma coluna por campo; células vazias onde não há ponto. */
export function toCsv(headers: string[], series: Series, fields: string[], timeZone: string): string {
  const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "short", timeStyle: "medium" });
  const rows = new Map<number, Map<string, number>>();
  for (const field of fields) {
    for (const [time, value] of series[field] ?? []) {
      let row = rows.get(time);
      if (!row) rows.set(time, (row = new Map()));
      row.set(field, value);
    }
  }

  const lines = [headers.map(escapeCell).join(";")];
  for (const time of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(time)!;
    const cells = fields.map((f) => (row.has(f) ? decimal.format(row.get(f)!) : ""));
    lines.push([escapeCell(timeFormat.format(time)), ...cells].join(";"));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

function escapeCell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Tabela pronta (linhas já montadas) no mesmo padrão: ";" e vírgula decimal. */
export function tableToCsv(headers: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) =>
    v === null ? "" : typeof v === "number" ? decimal.format(v) : escapeCell(v);
  const lines = [headers.map(escapeCell).join(";"), ...rows.map((r) => r.map(cell).join(";"))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
