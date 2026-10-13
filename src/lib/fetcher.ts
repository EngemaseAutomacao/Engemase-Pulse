/** Erro de API com status HTTP e mensagem pronta para exibir. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetcher do SWR para as rotas internas. Sessão expirada (401) leva ao login
 * preservando a página atual.
 */
export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (response.status === 401 && typeof window !== "undefined") {
    const next = window.location.pathname + window.location.search;
    // Recarga completa de propósito: descarta todo o estado da sessão expirada.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `Erro ${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}
