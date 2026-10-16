import { describe, expect, it } from "vitest";
import { generatorStatusText, transferState } from "./transfer-switch";

const live = { time: "2026-10-10T10:00:00.000Z", online: true, values: {} };
const base = { live, running: false, breakerClosed: false, powerKw: 0, mainsPresent: true };

describe("QTA no unifilar", () => {
  it("rede presente e gerador parado: carga na rede", () => {
    expect(transferState(base, true)).toMatchObject({ source: "mains", label: "Carga na rede" });
  });

  it("gerador rodando com o disjuntor fechado: carga no gerador", () => {
    const t = transferState({ ...base, running: true, breakerClosed: true, powerKw: 82, mainsPresent: false }, false);
    expect(t).toMatchObject({ source: "generator", label: "Carga no gerador", tone: "info" });
    expect(t.detail).toContain("82 kW");
  });

  it("teste em vazio (rodando, disjuntor aberto) não tira a carga da rede", () => {
    expect(transferState({ ...base, running: true, breakerClosed: false, powerKw: 0 }, true).source).toBe("mains");
  });

  it("sem informação do disjuntor, vale a potência entregue", () => {
    expect(transferState({ ...base, running: true, breakerClosed: null, powerKw: 40 }, true).source).toBe("generator");
    expect(transferState({ ...base, running: true, breakerClosed: null, powerKw: 0 }, true).source).toBe("mains");
  });

  it("sem rede: partindo ou sem alimentação", () => {
    expect(transferState({ ...base, mainsPresent: false, running: true, breakerClosed: false }, false)).toMatchObject({
      source: null,
      label: "Gerador partindo",
      tone: "critical",
    });
    expect(transferState({ ...base, mainsPresent: false }, false).label).toBe("Sem alimentação");
  });

  it("controlador sem comunicação: decide pela entrada geral", () => {
    const offline = { ...base, live: { ...live, online: false } };
    expect(transferState(offline, true).source).toBe("mains");
    expect(transferState(offline, null)).toMatchObject({ source: null, label: "Sem leitura" });
  });

  it("legenda curta do grupo", () => {
    const g = { live, faults: [], state: "Parado", running: false, ready: true };
    expect(generatorStatusText(g)).toBe("pronto para partir");
    expect(generatorStatusText({ ...g, running: true, state: "Em carga" })).toBe("em carga");
    expect(generatorStatusText({ ...g, faults: [{ name: "falha_partida", label: "Falha de partida" }] })).toBe("em falha");
    expect(generatorStatusText({ ...g, live: { ...live, online: false } })).toBe("sem comunicação");
  });
});
