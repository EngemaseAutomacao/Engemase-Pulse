"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  THEME_COLOR,
  THEME_STORAGE_KEY,
  isNightHour,
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

function deviceTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return deviceTheme();
  if (preference === "schedule") return isNightHour(new Date().getHours()) ? "dark" : "light";
  return preference;
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

/**
 * Avisa quando o tema efetivo pode ter mudado: escolha nesta ou em outra aba,
 * troca do tema do aparelho, volta para a aba (celular congela abas em segundo
 * plano e pode perder o aviso do sistema) e, a cada minuto, o relógio do
 * "Pelo horário". O snapshot é texto: sem mudança real, nada re-renderiza.
 */
function subscribe(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  const onVisible = () => document.visibilityState === "visible" && onChange();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener("focus", onChange);
  window.addEventListener("pageshow", onChange);
  document.addEventListener("visibilitychange", onVisible);
  media.addEventListener("change", onChange);
  const clock = window.setInterval(onChange, 60_000);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener("focus", onChange);
    window.removeEventListener("pageshow", onChange);
    document.removeEventListener("visibilitychange", onVisible);
    media.removeEventListener("change", onChange);
    window.clearInterval(clock);
  };
}

const getSnapshot = () => {
  const preference = readPreference();
  return `${preference}:${resolve(preference)}:${deviceTheme()}`;
};
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

type ThemeState = {
  preference: ThemePreference | null;
  /** Tema aplicado agora. */
  theme: ResolvedTheme | null;
  /** O que o aparelho/navegador informa (prefers-color-scheme), usado pelo Automático. */
  device: ResolvedTheme | null;
};

/**
 * Preferência, tema efetivo e tema do aparelho. No servidor (e na primeira
 * renderização) são null: quem usa deve renderizar algo neutro até hidratar.
 */
export function useTheme(): ThemeState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!snapshot) return { preference: null, theme: null, device: null };
  const [preference, theme, device] = snapshot.split(":") as [ThemePreference, ResolvedTheme, ResolvedTheme];
  return { preference, theme, device };
}

/**
 * Mantém o <html> em dia quando o sistema troca de tema (Automático), o
 * horário vira (Pelo horário) ou a escolha muda em outra aba. Montado uma vez
 * no layout raiz.
 */
export function ThemeSync() {
  const { preference, theme } = useTheme();
  useEffect(() => {
    if (preference) applyTheme(preference);
  }, [preference, theme]);
  return null;
}
