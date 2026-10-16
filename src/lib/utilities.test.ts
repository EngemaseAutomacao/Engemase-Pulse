import { describe, expect, it } from "vitest";
import {
  activeFaults,
  annunciator,
  belowCritical,
  generatorStats,
  kindForGroup,
  leakCheck,
  levelMarks,
  resolveModules,
  normalizeModules,
  recentUsageRate,
  reservoirAutonomyHours,
  trackFaultOnsets,
  waterDays,
  waterSignals,
  waterUsage,
  type WaterDay,
  type WaterSample,
} from "./utilities";

const W = 300_000;
const T0 = Date.UTC(2026, 9, 10, 3, 0); // 00:00 em São Paulo

describe("módulos", () => {
  it("aceita só os módulos conhecidos, na ordem padrão", () => {
    expect(normalizeModules(["gerador", "x", "agua", "agua"])).toEqual(["agua", "gerador"]);
    expect(normalizeModules(null)).toEqual([]);
    expect(kindForGroup("agua")).toBe("WATER");
    expect(kindForGroup("gerador")).toBe("GENERATOR");
    expect(kindForGroup("energia")).toBeNull();
    expect(kindForGroup("subestacao")).toBeNull();
  });
});

describe("resolveModules", () => {
  it("o configurador declara; sem declaração vale o equipamento; a administração desliga", () => {
    const declared = { declared: ["energia", "agua"], kinds: [] as ("WATER" | "GENERATOR")[] };
    const legacy = { declared: [], kinds: ["GENERATOR" as const] };
    expect(resolveModules([declared], [])).toEqual(["agua"]);
    expect(resolveModules([legacy], [])).toEqual(["gerador"]);
    expect(resolveModules([declared, legacy], [])).toEqual(["agua", "gerador"]);
    expect(resolveModules([declared, legacy], ["gerador"])).toEqual(["agua"]);
    // declarou só energia: equipamento de água enviado não liga o módulo
    expect(resolveModules([{ declared: ["energia"], kinds: ["WATER"] }], [])).toEqual([]);
  });
});

describe("waterUsage", () => {
  it("só com o nível: conta a descida e estima a reposição pelo ritmo anterior", () => {
    // 10 000 L; desce 1 % (100 L) por janela, depois a bomba enche 5 % por janela
    const levels = [80, 79, 78, 77, 82, 87, 86];
    const samples: WaterSample[] = levels.map((level, i) => ({ ts: T0 + i * W, level }));
    const usage = waterUsage(samples, 10_000);
    expect(usage.map((u) => Math.round(u.liters))).toEqual([100, 100, 100, 100, 100, 100]);
    expect(usage.map((u) => u.estimated)).toEqual([false, false, false, true, true, false]);
  });

  it("com vazão de entrada: entrou menos o que o volume subiu", () => {
    // 12 m³/h por 5 min = 1000 L entrando; o volume subiu 6 % = 600 L → 400 L consumidos
    const usage = waterUsage(
      [
        { ts: T0, level: 50, inflow: 0 },
        { ts: T0 + W, level: 56, inflow: 12 },
      ],
      10_000,
    );
    expect(usage).toEqual([{ ts: T0 + W, liters: 400, estimated: false }]);
  });

  it("ignora a janela depois de um buraco no envio", () => {
    expect(waterUsage([{ ts: T0, level: 50 }, { ts: T0 + 3 * W, level: 40 }], 10_000)).toEqual([]);
  });
});

describe("taxa recente e autonomia", () => {
  it("litros por hora nas últimas horas e horas até esvaziar", () => {
    const usage = Array.from({ length: 36 }, (_, i) => ({ ts: T0 + i * W, liters: 50, estimated: false }));
    const rate = recentUsageRate(usage, T0 + 35 * W, 3);
    expect(rate).toBeCloseTo(600);
    expect(reservoirAutonomyHours(60, 10_000, 600)).toBeCloseTo(10);
    expect(reservoirAutonomyHours(60, 10_000, 0)).toBeNull();
  });
});

describe("waterDays", () => {
  it("soma o dia, a bomba e a hora mais calma da madrugada", () => {
    // um dia inteiro: desce 0,2 %/janela (20 L) de madrugada e 1 %/janela depois das 6h,
    // a bomba liga às 12h por 30 min enchendo
    const samples: WaterSample[] = [];
    let level = 90;
    for (let i = 0; i < 288; i++) {
      const hour = Math.floor(i / 12);
      const pumping = hour === 12 && i % 12 < 6;
      if (i > 0) level += pumping ? 3 : hour < 6 ? -0.2 : -1;
      samples.push({ ts: T0 + i * W, level, pump: pumping ? 1 : 0 });
    }
    const [day] = waterDays(samples, 10_000, "America/Sao_Paulo");
    expect(day.day).toBe("2026-10-10");
    expect(day.nightMinLh).toBeCloseTo(240); // 12 janelas × 20 L
    expect(day.pumpHours).toBeCloseTo(0.5);
    expect(day.pumpStarts).toBe(1);
    expect(day.coverage).toBe(1);
    expect(day.estimatedShare).toBeGreaterThan(0);
  });
});

describe("leakCheck", () => {
  const night = (day: string, nightMinLh: number | null): WaterDay => ({
    day,
    liters: 0,
    estimatedShare: 0,
    pumpHours: null,
    pumpStarts: null,
    nightMinLh,
    coverage: 1,
  });
  const history = Array.from({ length: 10 }, (_, i) => night(`2026-10-${String(i + 1).padStart(2, "0")}`, 20));

  it("acusa o salto na madrugada contra as noites anteriores", () => {
    expect(leakCheck([...history, night("2026-10-11", 90)], "2026-10-11")).toMatchObject({ suspect: true, baselineLh: 20 });
    expect(leakCheck([...history, night("2026-10-11", 35)], "2026-10-11").suspect).toBe(false);
  });

  it("não julga sem noites suficientes", () => {
    expect(leakCheck([...history.slice(0, 3), night("2026-10-11", 500)], "2026-10-11")).toMatchObject({
      suspect: false,
      nights: 3,
    });
  });
});

describe("gerador", () => {
  const base = { reason: "teste", kwh: 10, batteryRest: 25.4, batteryMin: 20.1, endedAt: null };
  it("indicadores das corridas", () => {
    const stats = generatorStats(
      [
        { ...base, startedAt: 1000, durationSeconds: 1800, liters: 15, result: "normal" },
        { ...base, startedAt: 2000, durationSeconds: 20, liters: 0, result: "falha de partida (bateria)", batteryMin: 18 },
        { ...base, startedAt: 3000, durationSeconds: 3600, liters: 30, result: "desarme por temperatura" },
      ],
      0,
    );
    expect(stats).toMatchObject({ starts: 3, failedStarts: 1, trips: 1, lastRunAt: 3000 });
    expect(stats.litersPerHour).toBeCloseTo(30); // 45 L em 1,5 h
    expect(stats.maxBatteryDrop).toBeCloseTo(7.4);
    expect(stats.lastBatteryDrop).toBeCloseTo(5.3);
  });

  it("falhas ligadas com o rótulo do gateway ou o padrão", () => {
    expect(
      activeFaults({ falha_bateria: 1, falha_partida: 0, potencia: 50 }, "GENERATOR", { falha_bateria: { label: "Bateria fraca" } }),
    ).toEqual([{ name: "falha_bateria", label: "Bateria fraca" }]);
    expect(activeFaults({ bomba_falha: 1, sensor_falha: 0 }, "WATER")).toEqual([
      { name: "bomba_falha", label: "Falha da bomba de recalque" },
    ]);
  });
});

describe("anunciador do gerador", () => {
  const tags = {
    falha_partida: { label: "Falha de partida" },
    falha_pressao_oleo: { label: "Baixa pressão do óleo" },
    falha_bateria: { label: "Bateria fraca" },
    potencia: { label: "Potência", unit: "kW" },
  };

  it("uma janela por falha do cadastro, ligada ou não, e a bateria como atenção", () => {
    const w = annunciator({ falha_partida: 0, falha_bateria: 1 }, "GENERATOR", tags, { falha_bateria: "2026-10-10T10:00:00.000Z" });
    expect(w.map((x) => x.name)).toEqual(["falha_partida", "falha_pressao_oleo", "falha_bateria"]);
    expect(w.find((x) => x.name === "falha_bateria")).toMatchObject({ active: true, tone: "warning", first: true });
    expect(w.find((x) => x.name === "falha_partida")).toMatchObject({ active: false, tone: "critical", since: null });
  });

  it("1ª falha é a ligada há mais tempo; empate fica com a ordem do cadastro", () => {
    const since = { falha_partida: "2026-10-10T10:00:05.000Z", falha_pressao_oleo: "2026-10-10T10:00:00.000Z" };
    const w = annunciator({ falha_partida: 1, falha_pressao_oleo: 1 }, "GENERATOR", tags, since);
    expect(w.filter((x) => x.first).map((x) => x.name)).toEqual(["falha_pressao_oleo"]);
    const tie = annunciator({ falha_partida: 1, falha_pressao_oleo: 1 }, "GENERATOR", tags, {});
    expect(tie.filter((x) => x.first).map((x) => x.name)).toEqual(["falha_partida"]);
  });

  it("guarda desde quando cada falha está ligada entre uma leitura e a próxima", () => {
    const t1 = "2026-10-10T10:00:00.000Z";
    const t2 = "2026-10-10T10:00:10.000Z";
    const first = trackFaultOnsets({ falha_partida: 1, potencia: 0 }, true, t1, null);
    expect(first).toEqual({ falha_partida: t1 });
    const second = trackFaultOnsets({ falha_partida: 1, falha_pressao_oleo: 1 }, true, t2, first);
    expect(second).toEqual({ falha_partida: t1, falha_pressao_oleo: t2 });
    // o alarme do gateway sobre a mesma tag dá o horário exato
    expect(trackFaultOnsets({ falha_tensao: 1 }, true, t2, null, { falha_tensao: t1 })).toEqual({ falha_tensao: t1 });
    // apagou: sai da lista; sem comunicação: fica como estava
    expect(trackFaultOnsets({ falha_partida: 0 }, true, t2, first)).toEqual({});
    expect(trackFaultOnsets({}, false, null, second)).toEqual(second);
  });
});

describe("linhas de nível e sinais do reservatório", () => {
  it("só as linhas válidas, de cima para baixo, com o tom da prioridade", () => {
    const marks = levelMarks([
      { valor: 30, rotulo: "baixo", prioridade: "media" },
      { valor: 97, rotulo: "alto", prioridade: "media" },
      { valor: 15, rotulo: "crítico", prioridade: "alta" },
      { valor: 60, rotulo: "partida da bomba", prioridade: "info" },
      { valor: 120, rotulo: "fora" },
      { valor: 50 },
      "lixo",
    ]);
    expect(marks.map((m) => [m.value, m.label, m.tone])).toEqual([
      [97, "alto", "warning"],
      [60, "partida da bomba", "info"],
      [30, "baixo", "warning"],
      [15, "crítico", "critical"],
    ]);
    expect(levelMarks(null)).toEqual([]);
    expect(belowCritical(12, marks)).toBe(true);
    expect(belowCritical(20, marks)).toBe(false);
  });

  it("boias, bomba em automático e falhas, só as que o CLP informa", () => {
    const s = waterSignals({ bomba_ligada: 1, modo_automatico: 0, boia_baixo: 1, sensor_falha: 0, nivel: 40 });
    expect(s.map((x) => [x.name, x.state, x.tone])).toEqual([
      ["bomba_ligada", "Ligada", "info"],
      ["modo_automatico", "Manual", "warning"],
      ["boia_baixo", "Atuada", "warning"],
      ["sensor_falha", "Normal", "ok"],
    ]);
  });
});
