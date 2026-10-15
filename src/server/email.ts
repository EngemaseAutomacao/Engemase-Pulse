import "server-only";
import { APP_NAME, APP_TAGLINE } from "@/config/app";
import { primaryForLightTheme, readableTextOn } from "@/lib/color";
import { env } from "@/server/env";
import { reportCaught } from "@/server/errors";

/**
 * E-mail transacional (link de senha, convite) pelo Resend, via HTTP — sem
 * dependência. Sem RESEND_API_KEY e EMAIL_FROM, nada é enviado e as telas
 * mostram o link para ser repassado à pessoa.
 */

export function isEmailConfigured(): boolean {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  return Boolean(RESEND_API_KEY && EMAIL_FROM);
}

/** Endereço público para montar links (ver APP_URL em env.ts). */
export function appUrl(): string | null {
  const { APP_URL, VERCEL_PROJECT_PRODUCTION_URL } = env();
  if (APP_URL) return APP_URL.replace(/\/+$/, "");
  if (VERCEL_PROJECT_PRODUCTION_URL) return `https://${VERCEL_PROJECT_PRODUCTION_URL}`;
  return process.env.NODE_ENV === "production" ? null : "http://localhost:3000";
}

export async function sendEmail(message: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  if (!RESEND_API_KEY || !EMAIL_FROM) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, ...message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Resend HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return true;
  } catch (error) {
    reportCaught("servidor", "envio de e-mail", error);
    return false;
  }
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Cor padrão do botão (principal Engemase, versão para fundo branco). */
const DEFAULT_BUTTON = "#007d7a";

function buttonColors(color: string | undefined) {
  const background = color && /^#[0-9a-f]{6}$/i.test(color) ? primaryForLightTheme(color) : DEFAULT_BUTTON;
  return { background, text: readableTextOn(background) };
}

/** Moldura comum: nome do sistema, título, conteúdo, botão e rodapé. */
function emailLayout(options: {
  title: string;
  content: string;
  button: string;
  url: string;
  footer: string;
  color?: string;
}): string {
  const { title, content, button, url, footer } = options;
  const colors = buttonColors(options.color);
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3f6f9;font-family:Arial,sans-serif;color:#0c2340">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px" cellpadding="0" cellspacing="0">
<tr><td><p style="margin:0 0 4px;font-size:13px;color:#526079">${escapeHtml(APP_NAME)}</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
${content}
<p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:${colors.background};color:${colors.text};text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${escapeHtml(button)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#526079">${escapeHtml(footer)}</p>
<p style="margin:0;font-size:12px;color:#526079;word-break:break-all">Se o botão não abrir, copie este endereço: ${escapeHtml(url)}</p>
</td></tr></table>
<p style="font-size:12px;color:#526079">${escapeHtml(APP_NAME)} · ${escapeHtml(APP_TAGLINE)}</p>
</td></tr></table></body></html>`;
}

/**
 * E-mail simples com um botão: funciona nos leitores de e-mail sem CSS externo.
 * `color` é a cor principal do cliente; vai escurecida como no tema claro,
 * porque o e-mail tem fundo branco.
 */
export function actionEmail(options: {
  title: string;
  intro: string;
  button: string;
  url: string;
  footer: string;
  color?: string;
}) {
  const { title, intro, button, url, footer } = options;
  const html = emailLayout({
    ...options,
    content: `<p style="margin:0 0 24px;font-size:15px;line-height:1.5">${escapeHtml(intro)}</p>`,
  });
  const text = `${title}\n\n${intro}\n\n${button}: ${url}\n\n${footer}`;
  return { html, text };
}

export type EmailItem = {
  title: string;
  /** Linha menor embaixo do título. */
  detail?: string;
  /** Número à direita (ex.: "12.345 kWh"). */
  value?: string;
};

/** E-mail com uma lista (alarmes, resumo do mês) e um botão. */
export function itemsEmail(options: {
  title: string;
  intro: string;
  items: EmailItem[];
  button: string;
  url: string;
  footer: string;
  color?: string;
}) {
  const { title, intro, items, button, url, footer } = options;
  const rows = items
    .map(
      (item) => `<tr><td style="padding:10px 0;border-top:1px solid #e3e8ef;vertical-align:top">
<strong style="font-size:14px">${escapeHtml(item.title)}</strong>${
        item.detail ? `<br><span style="font-size:13px;line-height:1.4;color:#526079">${escapeHtml(item.detail)}</span>` : ""
      }</td>${
        item.value
          ? `<td align="right" style="padding:10px 0 10px 12px;border-top:1px solid #e3e8ef;vertical-align:top;white-space:nowrap;font-weight:bold;font-size:14px">${escapeHtml(item.value)}</td>`
          : "<td></td>"
      }</tr>`,
    )
    .join("");
  const html = emailLayout({
    ...options,
    content: `<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${escapeHtml(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px">${rows}</table>`,
  });
  const lines = items.map((i) => `- ${i.title}${i.value ? `: ${i.value}` : ""}${i.detail ? `\n  ${i.detail}` : ""}`);
  const text = `${title}\n\n${intro}\n\n${lines.join("\n")}\n\n${button}: ${url}\n\n${footer}`;
  return { html, text };
}
