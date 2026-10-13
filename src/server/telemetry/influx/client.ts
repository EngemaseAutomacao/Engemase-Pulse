import "server-only";
import { TelemetryError } from "../types";
import { FluxQueryError, parseAnnotatedCsv, type FluxRow } from "./csv";

export type InfluxConnection = {
  url: string;
  org: string;
  bucket: string;
  /** Bucket com médias horárias (opcional), alimentado por uma task do próprio InfluxDB. */
  rollupBucket?: string | null;
  token: string;
};

const QUERY_TIMEOUT_MS = 15_000;

/**
 * Executa uma consulta Flux via HTTP (sem SDK — roda em qualquer runtime com fetch).
 * Erros viram TelemetryError com mensagem em português pronta para a tela.
 */
export async function queryFlux(connection: InfluxConnection, flux: string): Promise<FluxRow[]> {
  const endpoint = `${connection.url.replace(/\/+$/, "")}/api/v2/query?org=${encodeURIComponent(connection.org)}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Token ${connection.token}`,
        "Content-Type": "application/json",
        Accept: "application/csv",
      },
      body: JSON.stringify({
        query: flux,
        type: "flux",
        dialect: { header: true, annotations: ["datatype"], delimiter: ",", dateTimeFormat: "RFC3339" },
      }),
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new TelemetryError("O InfluxDB não respondeu a tempo (15 s)", { cause: error });
    }
    const detail = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : "";
    throw new TelemetryError(`Não foi possível conectar ao InfluxDB${detail ? `: ${detail}` : ""}`, {
      cause: error,
    });
  }

  if (response.status === 401 || response.status === 403) {
    throw new TelemetryError("Token do InfluxDB inválido ou sem permissão de leitura neste bucket");
  }
  if (response.status === 404) {
    const message = await errorMessage(response);
    throw new TelemetryError(`InfluxDB: ${message || "organização ou bucket não encontrado"}`);
  }
  if (!response.ok) {
    const message = await errorMessage(response);
    throw new TelemetryError(`InfluxDB respondeu ${response.status}${message ? `: ${message}` : ""}`);
  }

  try {
    return parseAnnotatedCsv(await response.text());
  } catch (error) {
    if (error instanceof FluxQueryError) throw new TelemetryError(`InfluxDB: ${error.message}`, { cause: error });
    throw error;
  }
}

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { message?: string };
    if (body.message) return body.message;
  } catch {
    // Não era JSON.
  }
  return text.slice(0, 300);
}
