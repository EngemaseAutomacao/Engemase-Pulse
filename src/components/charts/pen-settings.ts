"use client";

import { useSyncExternalStore } from "react";

/**
 * Ajustes das penas do histórico, guardados neste navegador: a cor de cada
 * grandeza (vale em todos os medidores e conjuntos onde ela aparece — a cor
 * segue a grandeza) e as penas ocultas de cada conjunto.
 */
export type PenSettings = {
  /** Campo → cor escolhida (ex.: "Total_kW" → "#d6457f"). */
  colors: Record<string, string>;
  /** Conjunto (preset) → campos ocultos. */
  hidden: Record<string, string[]>;
};

const STORAGE_KEY = "penas";
const EMPTY: PenSettings = { colors: {}, hidden: {} };

/** Paleta oferecida. As cinco primeiras são as do sistema (mudam com o tema). */
export const PEN_PALETTE: { value: string; label: string }[] = [
  { value: "var(--chart-1)", label: "Azul" },
  { value: "var(--chart-2)", label: "Laranja" },
  { value: "var(--chart-3)", label: "Verde" },
  { value: "var(--chart-4)", label: "Âmbar" },
  { value: "var(--chart-5)", label: "Roxo" },
  { value: "#d6457f", label: "Rosa" },
  { value: "#1495b0", label: "Ciano" },
  { value: "#6f9a1f", label: "Oliva" },
  { value: "#7b8794", label: "Cinza" },
];

const COLOR_PATTERN = /^(#[0-9a-f]{6}|var\(--chart-[1-5]\))$/i;

export function isPenColor(value: unknown): value is string {
  return typeof value === "string" && COLOR_PATTERN.test(value);
}

function parse(raw: string | null): PenSettings {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<PenSettings>;
    const colors = Object.fromEntries(
      Object.entries(value.colors ?? {}).filter(([, color]) => isPenColor(color)),
    );
    const hidden = Object.fromEntries(
      Object.entries(value.hidden ?? {})
        .filter(([, fields]) => Array.isArray(fields))
        .map(([scope, fields]) => [scope, (fields as unknown[]).filter((f): f is string => typeof f === "string")]),
    );
    return { colors, hidden };
  } catch {
    return EMPTY;
  }
}

function load(): PenSettings {
  try {
    return parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY;
  }
}

let current: PenSettings | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): PenSettings {
  return (current ??= load());
}

const getServerSnapshot = () => EMPTY;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Outra aba mudou: relê do armazenamento.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    current = load();
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function update(change: (settings: PenSettings) => PenSettings) {
  current = change(getSnapshot());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Sem armazenamento (navegação privada): vale até recarregar a página.
  }
  for (const listener of listeners) listener();
}

export function usePenSettings(): PenSettings {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setPenColor(field: string, color: string | null) {
  update((s) => {
    const colors = { ...s.colors };
    if (color && isPenColor(color)) colors[field] = color;
    else delete colors[field];
    return { ...s, colors };
  });
}

export function setPenHidden(scope: string, field: string, hidden: boolean) {
  update((s) => {
    const rest = (s.hidden[scope] ?? []).filter((f) => f !== field);
    return { ...s, hidden: { ...s.hidden, [scope]: hidden ? [...rest, field] : rest } };
  });
}

export function showAllPens(scope: string) {
  update((s) => ({ ...s, hidden: { ...s.hidden, [scope]: [] } }));
}

/** Volta as cores padrão das grandezas informadas. */
export function resetPenColors(fields: readonly string[]) {
  update((s) => ({
    ...s,
    colors: Object.fromEntries(Object.entries(s.colors).filter(([field]) => !fields.includes(field))),
  }));
}
