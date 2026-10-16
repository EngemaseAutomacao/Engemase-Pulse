/**
 * Endereço do gateway na VPN de manutenção (WireGuard, faixa 10.88.x.x), como
 * ele informa a cada envio. Só a equipe da Engemase vê, na administração: com
 * o túnel do técnico ligado, é por ele que se entra por SSH e no configurador.
 */

export type AgentVpn = { ip: string; port: number; https: boolean };

const VPN_IP = /^10\.88\.(\d{1,3})\.(\d{1,3})$/;

/** O que veio em `agentInfo.vpn`, conferido (null se ausente ou estranho). */
export function agentVpn(info: unknown): AgentVpn | null {
  const vpn = (info as { vpn?: unknown } | null)?.vpn;
  if (!vpn || typeof vpn !== "object") return null;
  const { ip, porta, https } = vpn as Record<string, unknown>;
  const m = typeof ip === "string" ? VPN_IP.exec(ip) : null;
  if (!m || Number(m[1]) > 255 || Number(m[2]) > 255) return null;
  const port = typeof porta === "number" && Number.isInteger(porta) && porta > 0 && porta <= 65_535 ? porta : 8080;
  return { ip: ip as string, port, https: https === true };
}

/** Endereço do Pulse Configurador pela VPN. */
export function configuratorUrl(vpn: AgentVpn): string {
  return `${vpn.https ? "https" : "http"}://${vpn.ip}:${vpn.port}/`;
}
