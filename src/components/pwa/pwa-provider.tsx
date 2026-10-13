"use client";

import { useEffect, useSyncExternalStore } from "react";
import { WifiOffIcon } from "lucide-react";

/**
 * Peças de PWA montadas uma vez no layout raiz:
 *  - registra o service worker (push + página offline);
 *  - guarda o evento de instalação (beforeinstallprompt) para o menu "Instalar aplicativo";
 *  - mostra um aviso quando o aparelho fica sem internet.
 */
export function PwaProvider() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error) => {
      console.error("[pwa] falha ao registrar o service worker", error);
    });
  }, []);

  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 bg-warning px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-sm font-medium text-[#3d2b06]"
    >
      <WifiOffIcon className="size-4" aria-hidden />
      Sem conexão — os dados na tela podem estar desatualizados.
    </div>
  );
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

// ---------------------------------------------------------------------------
// Instalação (Chrome/Edge/Android). No iOS a instalação é pelo menu Compartilhar.
// ---------------------------------------------------------------------------

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferredPrompt: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    installListeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installListeners.forEach((l) => l());
  });
}

function subscribeInstall(callback: () => void) {
  installListeners.add(callback);
  return () => installListeners.delete(callback);
}

/** Função para abrir o diálogo de instalação, ou null se o navegador não oferece. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const available = useSyncExternalStore(subscribeInstall, () => deferredPrompt !== null, () => false);
  if (!available) return null;
  return async () => {
    const prompt = deferredPrompt;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    deferredPrompt = null;
    installListeners.forEach((l) => l());
  };
}
