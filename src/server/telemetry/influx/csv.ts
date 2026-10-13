/**
 * Parser do CSV anotado devolvido por POST /api/v2/query do InfluxDB 2.x.
 *
 * Particularidades do formato:
 *  - a resposta pode ter várias tabelas, separadas por linha vazia;
 *  - cada tabela começa com anotações (#datatype, #group, #default) e um cabeçalho;
 *  - a primeira coluna é vazia e as colunas `result`/`table` são internas;
 *  - erros durante a execução vêm como uma tabela com colunas `error` e `reference`.
 */

export type FluxValue = string | number | boolean | null;
export type FluxRow = Record<string, FluxValue>;

export class FluxQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FluxQueryError";
  }
}

const NUMERIC_TYPES = new Set(["double", "long", "unsignedLong"]);

export function parseAnnotatedCsv(csv: string): FluxRow[] {
  const rows: FluxRow[] = [];
  let types: string[] = [];
  let header: string[] | null = null;

  for (const line of csv.split(/\r?\n/)) {
    if (line.trim() === "") {
      header = null;
      types = [];
      continue;
    }
    if (line.startsWith("#datatype")) {
      types = splitCsvLine(line);
      header = null;
      continue;
    }
    if (line.startsWith("#")) continue;

    const cells = splitCsvLine(line);
    if (!header) {
      header = cells;
      continue;
    }

    const errorIndex = header.indexOf("error");
    if (errorIndex >= 0 && header.includes("reference")) {
      throw new FluxQueryError(cells[errorIndex] || "Erro na execução da consulta Flux");
    }

    const row: FluxRow = {};
    for (let i = 0; i < header.length; i++) {
      const key = header[i];
      if (!key || key === "result" || key === "table") continue;
      row[key] = coerce(cells[i] ?? "", types[i]);
    }
    rows.push(row);
  }
  return rows;
}

/** Divide uma linha CSV respeitando aspas (RFC 4180). */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function coerce(raw: string, type: string | undefined): FluxValue {
  if (raw === "") return null;
  if (type === undefined) {
    // Sem anotação de tipo: tenta número, senão mantém texto.
    const n = Number(raw);
    return Number.isFinite(n) && /^-?[\d.]+(e[-+]?\d+)?$/i.test(raw) ? n : raw;
  }
  if (NUMERIC_TYPES.has(type)) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (type === "boolean") return raw === "true";
  return raw;
}
