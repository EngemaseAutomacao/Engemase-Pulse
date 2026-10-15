import { describe, expect, it } from "vitest";
import { DEMAND_WINDOW_MS, demandStatus, projectDemand } from "./demand-forecast";

const W = 1_800_000_000_000 - (1_800_000_000_000 % DEMAND_WINDOW_MS); // início de uma janela
const MIN = 60_000;

describe("projectDemand", () => {
  it("blocos fechados pela média e o resto pela potência de agora", () => {
    const p = projectDemand({
      now: W + 11 * MIN,
      blocks: [
        { ts: W, kw: 100 },
        { ts: W + 5 * MIN, kw: 120 },
        { ts: W + 10 * MIN, kw: 999 }, // ainda aberto: não entra
      ],
      currentKw: 150,
    });
    expect(p.averageSoFar).toBe(110);
    expect(p.projected).toBeCloseTo((100 * 5 + 120 * 5 + 150 * 5) / 15);
    expect(p.elapsedMin).toBeCloseTo(11);
  });

  it("início da janela: tudo pela potência de agora; sem leitura usa o último bloco", () => {
    expect(projectDemand({ now: W + MIN, blocks: [], currentKw: 80 }).projected).toBe(80);
    expect(projectDemand({ now: W + 7 * MIN, blocks: [{ ts: W, kw: 90 }], currentKw: null }).projected).toBe(90);
    expect(projectDemand({ now: W + MIN, blocks: [], currentKw: null }).projected).toBeNull();
  });

  it("ignora blocos de outra janela", () => {
    const p = projectDemand({ now: W + 6 * MIN, blocks: [{ ts: W - 5 * MIN, kw: 500 }], currentKw: 100 });
    expect(p.projected).toBe(100);
  });
});

describe("demandStatus", () => {
  it("perto (95 %) e acima da tolerância (105 %)", () => {
    expect(demandStatus(90, 100)).toBe("ok");
    expect(demandStatus(96, 100)).toBe("near");
    expect(demandStatus(104, 100)).toBe("near");
    expect(demandStatus(106, 100)).toBe("over");
    expect(demandStatus(null, 100)).toBe("unknown");
    expect(demandStatus(50, null)).toBe("unknown");
  });
});
