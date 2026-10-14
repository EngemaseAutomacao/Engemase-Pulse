/**
 * Tema claro/escuro. A escolha fica no navegador (localStorage) e não em
 * cookie: assim as páginas continuam pré-renderizadas iguais para todos e o
 * script abaixo aplica o tema antes da primeira pintura, sem piscar.
 */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "tema";

export const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Automático" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
];

/** Cor da barra do navegador/celular em cada tema (= --background). */
export const THEME_COLOR: Record<ResolvedTheme, string> = { light: "#f3f6f9", dark: "#0a1c33" };

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * Roda no <head>, antes de pintar. Mantido curto e sem dependências; a mesma
 * regra está em `applyTheme` (src/components/theme/use-theme.ts).
 */
export const THEME_INIT_SCRIPT = `(function(){var p;try{p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"})()`;
