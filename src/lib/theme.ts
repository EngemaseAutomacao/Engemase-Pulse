/**
 * Tema claro/escuro. A escolha fica no navegador (localStorage) e não em
 * cookie: assim as páginas continuam pré-renderizadas iguais para todos e o
 * script abaixo aplica o tema antes da primeira pintura, sem piscar.
 */

/** system = segue o aparelho; schedule = claro de dia e escuro à noite (relógio local). */
export type ThemePreference = "system" | "schedule" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "tema";

/** Horário do tema "Pelo horário": claro a partir de DAY_START_HOUR, escuro a partir de NIGHT_START_HOUR. */
export const DAY_START_HOUR = 6;
export const NIGHT_START_HOUR = 18;

export const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: "system", label: "Automático", hint: "segue o tema do aparelho" },
  {
    value: "schedule",
    label: "Pelo horário",
    hint: `claro das ${DAY_START_HOUR}h às ${NIGHT_START_HOUR}h, escuro à noite`,
  },
  { value: "light", label: "Claro", hint: "sempre claro" },
  { value: "dark", label: "Escuro", hint: "sempre escuro" },
];

/** Cor da barra do navegador/celular em cada tema (= --background). */
export const THEME_COLOR: Record<ResolvedTheme, string> = { light: "#f3f6f9", dark: "#0a1c33" };

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "schedule" || value === "light" || value === "dark";
}

export function isNightHour(hour: number): boolean {
  return hour < DAY_START_HOUR || hour >= NIGHT_START_HOUR;
}

/**
 * Roda no <head>, antes de pintar. Mantido curto e sem dependências; a mesma
 * regra está em `applyTheme` (src/components/theme/use-theme.ts).
 */
export const THEME_INIT_SCRIPT = `(function(){var p;try{p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}var h=new Date().getHours();var d=p==="dark"||(p==="schedule"?h<${DAY_START_HOUR}||h>=${NIGHT_START_HOUR}:p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"})()`;
