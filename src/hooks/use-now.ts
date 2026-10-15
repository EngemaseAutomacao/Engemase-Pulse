"use client";

import { useSyncExternalStore } from "react";

/**
 * Hora atual, atualizada a cada segundo. No servidor (e na hidratação) é
 * null: assim o HTML pré-renderizado não carrega a hora do servidor (fuso e
 * minuto diferentes do aparelho) e a tela troca para a hora local logo depois.
 */
let current = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!timer) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      for (const listener of listeners) listener();
    }, 1000);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
