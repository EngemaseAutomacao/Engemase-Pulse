/** Manda um erro de tela para a "Saúde do sistema" (melhor esforço, sem esperar). */
export function reportClientError(error: Error & { digest?: string }): void {
  try {
    const body = JSON.stringify({
      message: error.message || String(error),
      digest: error.digest ?? null,
      path: window.location.pathname,
      stack: error.stack?.slice(0, 4000) ?? null,
    });
    void fetch("/api/errors", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    });
  } catch {
    // sem rede ou sem window: ignora
  }
}
