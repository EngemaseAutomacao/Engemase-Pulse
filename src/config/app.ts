/**
 * Identidade da plataforma: trocando aqui, o nome muda em todas as telas,
 * títulos, e-mails e no app instalado (PWA).
 */
export const APP_NAME = "Engemase Pulse";
/** Nome curto sob o ícone do app instalado (celular). */
export const APP_SHORT_NAME = "Pulse";
/** Linha de apoio do produto (login e rodapé dos e-mails). */
export const APP_TAGLINE = "Supervisório de utilidades";
export const APP_DESCRIPTION = "Supervisório de utilidades em tempo real";

export const BRAND = {
  logo: "/brand/engemase-logo.png",
  watermark: "/brand/engemase-watermark.png",
  primaryColor: "#4a9ee0",
  accentColor: "#38bdf8",
} as const;

/** Nome do cookie de sessão (lido também pelo proxy, que não acessa o banco). */
export const SESSION_COOKIE = "em_session";

/** Intervalo de atualização das leituras ao vivo, em milissegundos. */
export const LIVE_REFRESH_MS = 10_000;

/** Sem leitura nova há mais que isso, o medidor é considerado offline. */
export const OFFLINE_AFTER_MS = 5 * 60_000;
