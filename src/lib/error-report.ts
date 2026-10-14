/**
 * Agrupamento de erros: a mesma falha repetida vira uma linha com contagem.
 * Usado pelo servidor (registro) e testado à parte.
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Rota sem query string e com ids trocados por ":id" (mesma página = mesmo grupo). */
export function normalizeErrorPath(path: string | null | undefined): string | null {
  if (!path) return null;
  return (
    path
      .split("?")[0]
      .replace(UUID, ":id")
      .replace(/\/\d+(?=\/|$)/g, "/:n")
      .slice(0, 300) || null
  );
}

/** Mensagem sem ids, números longos e horários, para agrupar variações da mesma falha. */
export function normalizeErrorMessage(message: string): string {
  return message
    .replace(UUID, ":id")
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, ":data")
    .replace(/\b\d{5,}\b/g, ":n")
    .trim()
    .slice(0, 500);
}

export function truncate(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
