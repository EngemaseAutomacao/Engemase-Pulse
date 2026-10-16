import { describe, expect, it } from "vitest";
import { agentVpn, configuratorUrl } from "./agent-vpn";

describe("endereço do gateway na VPN", () => {
  it("lê o que o gateway mandou e monta o endereço do configurador", () => {
    const vpn = agentVpn({ versao: "1.0", vpn: { ip: "10.88.1.7", porta: 8090, https: true } });
    expect(vpn).toEqual({ ip: "10.88.1.7", port: 8090, https: true });
    expect(configuratorUrl(vpn!)).toBe("https://10.88.1.7:8090/");
    expect(configuratorUrl(agentVpn({ vpn: { ip: "10.88.1.2" } })!)).toBe("http://10.88.1.2:8080/");
  });

  it("ignora gateway antigo e endereço fora da faixa da VPN", () => {
    expect(agentVpn(null)).toBeNull();
    expect(agentVpn({ versao: "0.9" })).toBeNull();
    expect(agentVpn({ vpn: { ip: "192.168.0.10" } })).toBeNull();
    expect(agentVpn({ vpn: { ip: "10.88.1.300" } })).toBeNull();
    expect(agentVpn({ vpn: { ip: "10.88.1.2\nhttp://mal" } })).toBeNull();
  });
});
