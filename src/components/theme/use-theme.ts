"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  THEME_COLOR,
  THEME_STORAGE_KEY,
  isThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

const CHANGE_EVENT = "tema-alterado";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : "system";
  } catch {
    return "system";
  }
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** Aplica o tema no <html> e na barra do navegador (mesma regra do THEME_INIT_SCRIPT). */
function applyTheme(preference: ThemePreference) {
  const theme = resolve(preference);
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = THEME_COLOR[theme];
  }
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    media.removeEventListener("change", onChange);
  };
}

const getSnapshot = () => `${readPreference()}:${resolve(readPreference())}`;
const getServerSnapshot = () => null;

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Navegação privada sem armazenamento: vale só até recarregar.
  }
  applyTheme(preference);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Preferência e tema efetivo. No servidor (e na primeira renderização) os
 * dois são null: quem usa deve renderizar algo neutro até hidratar.
 */
export function useTheme(): { preference: ThemePreference | null; theme: ResolvedTheme | null } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!snapshot) return { preference: null, theme: null };
  const [preference, theme] = snapshot.split(":") as [ThemePreference, ResolvedTheme];
  return { preference, theme };
}

/**
 * Mantém o <html> em dia quando o sistema troca de tema (Automático) ou a
 * escolha muda em outra aba. Montado uma vez no layout raiz.
 */
export function ThemeSync() {
  const { preference, theme } = useTheme();
  useEffect(() => {
    if (preference) applyTheme(preference);
  }, [preference, theme]);
  return null;
}
