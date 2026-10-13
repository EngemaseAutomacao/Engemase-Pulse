/**
 * Identidade da plataforma. O nome é provisório: troque aqui e ele muda em
 * todas as telas, títulos, notificações e no app instalado (PWA).
 */
export const APP_NAME = "Monitor de Energia";
/** Nome curto sob o ícone do app instalado (celular). */
export const APP_SHORT_NAME = "Energia";
export const APP_DESCRIPTION = "Monitoramento de multimedidores de energia em tempo real";
export const COMPANY_NAME = "Engemase";

export const BRAND = {
  logo: "/brand/engemase-logo.png",
  watermark: "/brand/engemase-watermark.png",
  primaryColor: "#5cbdb9",
  accentColor: "#38bdf8",
} as const;

/** Nome do cookie de sessão (lido também pelo proxy, que não acessa o banco). */
export const SESSION_COOKIE = "em_session";

/** Intervalo de atualização das leituras ao vivo, em milissegundos. */
export const LIVE_REFRESH_MS = 10_000;

/** Sem leitura nova há mais que isso, o medidor é considerado offline. */
export const OFFLINE_AFTER_MS = 5 * 60_000;
