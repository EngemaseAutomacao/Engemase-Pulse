import { zonedParts } from "@/lib/tz";

/**
 * Módulos Água e Gerador: equipamentos do gateway que não são medidores
 * de energia. Aqui ficam os nomes, os rótulos das tags e as contas — tudo puro,
 * usado pelo servidor e pelas telas.
 */

// ---------------------------------------------------------------------------
// Módulos
// ---------------------------------------------------------------------------

export const UTILITY_MODULES = ["agua", "gerador"] as const;
export type UtilityModule = (typeof UTILITY_MODULES)[number];
export type UtilityKind = "WATER" | "GENERATOR";

export const MODULE_INFO: Record<UtilityModule, { label: string; kind: UtilityKind; description: string }> = {
  agua: { label: "Água", kind: "WATER", description: "Reservatório, bomba de recalque, consumo em m³ e aviso de vazamento" },
  gerador: { label: "Gerador", kind: "GENERATOR", description: "Prontidão, diesel e autonomia, bateria, partidas e falhas" },
};

export const MODULE_BY_KIND: Record<UtilityKind, UtilityModule> = { WATER: "agua", GENERATOR: "gerador" };

/** Grupo do equipamento no gateway → tipo na nuvem (os demais grupos ficam de fora). */
export function kindForGroup(grupo: string | null | undefined): UtilityKind | null {
  if (grupo === "agua") return "WATER";
  if (grupo === "gerador") return "GENERATOR";
  return null;
}

/** Lista de módulos válida, sem repetição e na ordem padrão. */
export function normalizeModules(input: unknown): UtilityModule[] {
  const list = Array.isArray(input) ? input : [];
  return UTILITY_MODULES.filter((m) => list.includes(m));
}

/** Módulos que o gateway da unidade pode declarar (energia incluída). */
export const DECLARABLE_MODULES = ["energia", ...UTILITY_MODULES] as const;

export function normalizeDeclared(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [];
  return DECLARABLE_MODULES.filter((m) => list.includes(m));
}

/** O que a nuvem sabe de cada unidade para decidir os módulos. */
export type SiteModuleInfo = {
  /** Declarados pelo configurador (vazio: gateway antigo, sem declaração). */
  declared: readonly string[];
  /** Tipos de equipamento que o gateway já enviou. */
  kinds: readonly UtilityKind[];
};

/** O módulo vale nesta unidade? O configurador manda; sem declaração, vale quando chega o equipamento. */
export function siteHasModule(site: SiteModuleInfo, module: UtilityModule): boolean {
  return site.declared.length > 0 ? site.declared.includes(module) : site.kinds.includes(MODULE_INFO[module].kind);
}

/** Módulos que aparecem para o cliente: valem em alguma unidade e não foram desligados na administração. */
export function resolveModules(sites: SiteModuleInfo[], off: readonly string[]): UtilityModule[] {
  return UTILITY_MODULES.filter((m) => !off.includes(m) && sites.some((s) => siteHasModule(s, m)));
}

// ---------------------------------------------------------------------------
// Tags: rótulo, unidade e casas (o gateway manda os dele; estes são o padrão)
// ---------------------------------------------------------------------------

export type TagInfo = { label: string; unit?: string | null; decimals?: number | null };

export const WATER_TAGS: Record<string, TagInfo> = {
  nivel: { label: "Nível", unit: "%", decimals: 1 },
  coluna: { label: "Coluna d'água", unit: "m", decimals: 2 },
  volume_litros: { label: "Volume", unit: "L", decimals: 0 },
  vazao_entrada: { label: "Vazão de entrada", unit: "m³/h", decimals: 1 },
  pressao_recalque: { label: "Pressão de recalque", unit: "mca", decimals: 1 },
  horas_bomba: { label: "Horímetro da bomba", unit: "h", decimals: 0 },
  bomba_ligada: { label: "Bomba de recalque ligada" },
  bomba_falha: { label: "Falha da bomba de recalque" },
  boia_baixo: { label: "Boia de nível baixo" },
  boia_alto: { label: "Boia de nível alto" },
  sensor_falha: { label: "Falha do sensor de nível" },
  modo_automatico: { label: "Bomba em automático" },
};

export const GENERATOR_TAGS: Record<string, TagInfo> = {
  potencia: { label: "Potência fornecida", unit: "kW", decimals: 0 },
  tensao_ab: { label: "Tensão V1-2", unit: "V", decimals: 0 },
  tensao_bc: { label: "Tensão V2-3", unit: "V", decimals: 0 },
  tensao_ca: { label: "Tensão V3-1", unit: "V", decimals: 0 },
  corrente_a: { label: "Corrente I1", unit: "A", decimals: 0 },
  corrente_b: { label: "Corrente I2", unit: "A", decimals: 0 },
  corrente_c: { label: "Corrente I3", unit: "A", decimals: 0 },
  frequencia: { label: "Frequência", unit: "Hz", decimals: 1 },
  rotacao: { label: "Rotação", unit: "rpm", decimals: 0 },
  carga_pct: { label: "Carga", unit: "%", decimals: 0 },
  fator_potencia: { label: "Fator de potência", decimals: 2 },
  potencia_rede: { label: "Potência da rede", unit: "kW", decimals: 0 },
  temperatura_oleo: { label: "Temperatura do óleo", unit: "°C", decimals: 0 },
  partidas: { label: "Partidas (contador)", decimals: 0 },
  tensao_bateria: { label: "Bateria", unit: "V", decimals: 1 },
  pressao_oleo: { label: "Pressão do óleo", unit: "bar", decimals: 1 },
  temperatura: { label: "Temperatura da água", unit: "°C", decimals: 0 },
  nivel_diesel: { label: "Diesel", unit: "%", decimals: 0 },
  diesel_litros: { label: "Diesel no tanque", unit: "L", decimals: 0 },
  autonomia_h: { label: "Autonomia", unit: "h", decimals: 1 },
  dias_sem_teste: { label: "Dias desde a última partida", unit: "d", decimals: 1 },
  horimetro: { label: "Horímetro", unit: "h", decimals: 0 },
  pronto: { label: "Pronto para partir" },
  rede_presente: { label: "Rede da concessionária presente" },
  disjuntor_fechado: { label: "Disjuntor do gerador fechado" },
};

/** Rótulo de uma tag: o que o gateway mandou, o padrão do módulo ou o nome legível. */
export function tagInfo(name: string, kind: UtilityKind, fromPainel?: Record<string, TagInfo> | null): TagInfo {
  return fromPainel?.[name] ?? (kind === "WATER" ? WATER_TAGS : GENERATOR_TAGS)[name] ?? { label: humanize(name) };
}

function humanize(name: string): string {
  const text = name.replace(/^falha_/, "").replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const isOn = (v: number | null | undefined) => v !== null && v !== undefined && Number.isFinite(v) && v >= 0.5;

/** Tag de falha: `falha_*` (gerador) ou `*_falha` (bomba e sensor do reservatório). */
export const isFaultTag = (name: string) => name.startsWith("falha_") || name.endsWith("_falha");

/** Falhas ligadas agora (tags `falha_*`, mais a da bomba e a do sensor no reservatório). */
export function activeFaults(
  values: Record<string, number | null>,
  kind: UtilityKind,
  fromPainel?: Record<string, TagInfo> | null,
): { name: string; label: string }[] {
  return Object.entries(values)
    .filter(([name, v]) => isFaultTag(name) && isOn(v))
    .map(([name]) => ({ name, label: tagInfo(name, kind, fromPainel).label }));
}

export type SignalTone = "critical" | "warning" | "info" | "ok" | "muted";

// ---------------------------------------------------------------------------
// Linhas de nível (limites do reservatório e do tanque de diesel)
// ---------------------------------------------------------------------------

/** Linha de nível vinda do gateway: "alto 97 %", "partida da bomba 60 %", "crítico 15 %". */
export type LevelMark = { value: number; label: string; tone: "critical" | "warning" | "info" };

const MARK_TONE: Record<string, LevelMark["tone"]> = { alta: "critical", media: "warning", média: "warning" };

/** Linhas válidas, de cima para baixo (o gateway manda em `marcas`; ficam em `settings.marcas`). */
export function levelMarks(input: unknown): LevelMark[] {
  if (!Array.isArray(input)) return [];
  return input
    .flatMap((m) => {
      if (!m || typeof m !== "object") return [];
      const { valor, rotulo, prioridade } = m as Record<string, unknown>;
      if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > 100) return [];
      if (typeof rotulo !== "string" || !rotulo.trim()) return [];
      const tone = MARK_TONE[typeof prioridade === "string" ? prioridade : ""] ?? "info";
      return [{ value: valor, label: rotulo.trim().slice(0, 40), tone }];
    })
    .slice(0, 8)
    .sort((a, b) => b.value - a.value);
}

/** Nível abaixo de uma linha crítica (para a cor do valor). */
export function belowCritical(levelPct: number | null, marks: LevelMark[]): boolean {
  return levelPct !== null && marks.some((m) => m.tone === "critical" && levelPct < m.value);
}

// ---------------------------------------------------------------------------
// Anunciador de falhas do gerador (com a 1ª falha)
// ---------------------------------------------------------------------------

/** Leituras do motor e do alternador, na ordem da tela (só aparecem as que o controlador tem). */
export const ENGINE_TAGS = [
  "rotacao",
  "frequencia",
  "tensao_ab",
  "tensao_bc",
  "tensao_ca",
  "corrente_a",
  "corrente_b",
  "corrente_c",
  "carga_pct",
  "fator_potencia",
  "pressao_oleo",
  "temperatura",
  "temperatura_oleo",
  "potencia_rede",
  "partidas",
] as const;

/** Falhas que não param o grupo (bateria, carregador): atenção, não crítico. */
const WARNING_FAULTS = new Set(["falha_bateria", "falha_carregador"]);

export type AnnunciatorWindow = {
  name: string;
  label: string;
  tone: "critical" | "warning";
  active: boolean;
  /** Desde quando está ligada (ISO), se ligada. */
  since: string | null;
  /** Acendeu primeiro entre as ligadas (a 1ª falha do anunciador). */
  first: boolean;
};

/**
 * Janelas do anunciador: todas as falhas que o controlador informa, ligadas ou
 * não, na ordem do cadastro. A 1ª falha é a ligada há mais tempo — como no
 * anunciador físico, é ela que diz o que causou a parada quando várias acendem
 * juntas. Empate (acenderam na mesma leitura): vale a ordem do cadastro.
 */
export function annunciator(
  values: Record<string, number | null>,
  kind: UtilityKind,
  fromPainel: Record<string, TagInfo> | null | undefined,
  since: Record<string, string> | null | undefined,
): AnnunciatorWindow[] {
  const names = [...new Set([...Object.keys(fromPainel ?? {}), ...Object.keys(values)])].filter(isFaultTag);
  const windows = names.map((name) => {
    const active = isOn(values[name]);
    return {
      name,
      label: tagInfo(name, kind, fromPainel).label,
      tone: WARNING_FAULTS.has(name) ? ("warning" as const) : ("critical" as const),
      active,
      since: active ? (since?.[name] ?? null) : null,
      first: false,
    };
  });
  let first: AnnunciatorWindow | null = null;
  for (const w of windows) {
    if (!w.active) continue;
    const t = w.since ? Date.parse(w.since) : Infinity;
    const best = first?.since ? Date.parse(first.since) : Infinity;
    if (!first || t < best) first = w;
  }
  if (first) first.first = true;
  return windows;
}

/**
 * Desde quando cada falha está ligada, de uma leitura ao vivo para a próxima:
 * a que continua ligada guarda o horário; a nova recebe o do alarme do gateway
 * (exato) ou o da leitura. Sem comunicação, fica como estava.
 */
export function trackFaultOnsets(
  values: Record<string, number>,
  online: boolean,
  readAt: string | null,
  previous: Record<string, string> | null | undefined,
  alarmStarts: Record<string, string> = {},
): Record<string, string> {
  if (!online) return { ...(previous ?? {}) };
  const out: Record<string, string> = {};
  for (const [name, v] of Object.entries(values)) {
    if (!isFaultTag(name) || !isOn(v)) continue;
    const at = alarmStarts[name] ?? previous?.[name] ?? readAt;
    if (at) out[name] = at;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sinais do reservatório (boias, bomba, sensor)
// ---------------------------------------------------------------------------

export type WaterSignal = { name: string; label: string; state: string; tone: SignalTone };

/** Como cada sinal digital do reservatório aparece: texto ligado/desligado e o tom quando ligado. */
const WATER_SIGNALS: { name: string; on: string; off: string; onTone: SignalTone; offTone: SignalTone }[] = [
  { name: "bomba_ligada", on: "Ligada", off: "Desligada", onTone: "info", offTone: "muted" },
  { name: "modo_automatico", on: "Automático", off: "Manual", onTone: "ok", offTone: "warning" },
  { name: "boia_alto", on: "Atuada", off: "Normal", onTone: "info", offTone: "muted" },
  { name: "boia_baixo", on: "Atuada", off: "Normal", onTone: "warning", offTone: "muted" },
  { name: "bomba_falha", on: "Em falha", off: "Normal", onTone: "critical", offTone: "ok" },
  { name: "sensor_falha", on: "Em falha", off: "Normal", onTone: "critical", offTone: "ok" },
];

/** Sinais digitais que o CLP do reservatório informa, na ordem da tela. */
export function waterSignals(values: Record<string, number | null>, fromPainel?: Record<string, TagInfo> | null): WaterSignal[] {
  return WATER_SIGNALS.filter((s) => finite(values[s.name])).map((s) => {
    const on = isOn(values[s.name]);
    return {
      name: s.name,
      label: tagInfo(s.name, "WATER", fromPainel).label,
      state: on ? s.on : s.off,
      tone: on ? s.onTone : s.offTone,
    };
  });
}

// ---------------------------------------------------------------------------
// Água
// ---------------------------------------------------------------------------

const WINDOW_MS = 300_000;
const WINDOW_H = WINDOW_MS / 3_600_000;
/** Janelas recentes de descida usadas para estimar o consumo durante a reposição. */
const RECENT_DROPS = 12;

/** Uma janela de 5 min do reservatório (médias). */
export type WaterSample = {
  ts: number;
  /** Nível (%). */
  level: number | null;
  /** Vazão de entrada (m³/h), se houver medidor. */
  inflow?: number | null;
  /** Fração do tempo com a bomba de recalque ligada (0–1), se houver o sinal. */
  pump?: number | null;
};

export type UsageWindow = { ts: number; liters: number; estimated: boolean };

const finite = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Consumo de água da unidade janela a janela (litros), visto do reservatório:
 *  - com vazão de entrada: o que entrou menos o quanto o volume subiu;
 *  - só com o nível: o quanto o volume desceu. Enquanto ele sobe (bomba
 *    enchendo), o consumo é estimado pelo ritmo das últimas descidas.
 * Janela sem a anterior (buraco no envio) fica de fora: não dá para saber.
 */
export function waterUsage(samples: WaterSample[], capacityL: number): UsageWindow[] {
  const rows = samples.filter((s) => finite(s.level)).sort((a, b) => a.ts - b.ts);
  const out: UsageWindow[] = [];
  const drops: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    if (cur.ts - prev.ts !== WINDOW_MS) continue;
    const deltaL = ((cur.level! - prev.level!) / 100) * capacityL;
    if (finite(cur.inflow)) {
      const inL = Math.max(0, cur.inflow) * 1000 * WINDOW_H;
      out.push({ ts: cur.ts, liters: Math.max(0, inL - deltaL), estimated: false });
      continue;
    }
    const filling = deltaL > 0 || (finite(cur.pump) && cur.pump > 0);
    if (!filling) {
      out.push({ ts: cur.ts, liters: -deltaL, estimated: false });
      drops.push(-deltaL);
      if (drops.length > RECENT_DROPS) drops.shift();
    } else {
      out.push({ ts: cur.ts, liters: drops.length ? median(drops) : 0, estimated: true });
    }
  }
  return out;
}

/** Litros por hora nas últimas `hours` horas (null sem janelas suficientes). */
export function recentUsageRate(usage: UsageWindow[], now: number, hours = 3): number | null {
  const since = now - hours * 3_600_000;
  const recent = usage.filter((u) => u.ts >= since && u.ts <= now);
  if (recent.length < 6) return null;
  return recent.reduce((s, u) => s + u.liters, 0) / (recent.length * WINDOW_H);
}

/** Horas até esvaziar no ritmo atual, sem reposição. */
export function reservoirAutonomyHours(levelPct: number | null, capacityL: number | null, usageLh: number | null): number | null {
  if (!finite(levelPct) || !finite(capacityL) || !finite(usageLh) || usageLh <= 0) return null;
  return ((Math.max(0, levelPct) / 100) * capacityL) / usageLh;
}

export type WaterDay = {
  /** AAAA-MM-DD no fuso da unidade. */
  day: string;
  liters: number;
  /** Fração estimada (reposição sem medidor de vazão), 0–1. */
  estimatedShare: number;
  /** Horas com a bomba ligada (null sem o sinal). */
  pumpHours: number | null;
  /** Partidas da bomba, contadas janela a janela (aproximado). */
  pumpStarts: number | null;
  /** Menor consumo de uma hora inteira entre 0h e 5h (L/h): vazamento aparece aqui. */
  nightMinLh: number | null;
  /** Fração das janelas do dia com leitura, 0–1. */
  coverage: number;
};

const NIGHT_HOURS = [0, 1, 2, 3, 4];

/** Consumo e bomba por dia (fuso da unidade). */
export function waterDays(samples: WaterSample[], capacityL: number, timeZone: string): WaterDay[] {
  const usage = waterUsage(samples, capacityL);
  type Acc = {
    liters: number;
    estimated: number;
    windows: number;
    pumpH: number;
    pumpSeen: boolean;
    starts: number;
    night: Map<number, { liters: number; n: number }>;
  };
  const days = new Map<string, Acc>();
  const keyOf = (ts: number) => {
    const p = zonedParts(new Date(ts), timeZone);
    return { day: `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`, hour: p.hour };
  };
  const acc = (day: string) => {
    let a = days.get(day);
    if (!a) {
      a = { liters: 0, estimated: 0, windows: 0, pumpH: 0, pumpSeen: false, starts: 0, night: new Map() };
      days.set(day, a);
    }
    return a;
  };

  for (const u of usage) {
    const { day, hour } = keyOf(u.ts);
    const a = acc(day);
    a.liters += u.liters;
    if (u.estimated) a.estimated += u.liters;
    if (NIGHT_HOURS.includes(hour)) {
      const h = a.night.get(hour) ?? { liters: 0, n: 0 };
      h.liters += u.liters;
      h.n += 1;
      a.night.set(hour, h);
    }
  }

  const sorted = samples.filter((s) => finite(s.level) || finite(s.pump)).sort((a, b) => a.ts - b.ts);
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const a = acc(keyOf(s.ts).day);
    a.windows += 1;
    if (finite(s.pump)) {
      a.pumpSeen = true;
      a.pumpH += Math.min(1, Math.max(0, s.pump)) * WINDOW_H;
      const prev = sorted[i - 1];
      if (s.pump > 0 && prev && s.ts - prev.ts === WINDOW_MS && finite(prev.pump) && prev.pump === 0) a.starts += 1;
    }
  }

  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, a]) => {
      const fullHours = [...a.night.values()].filter((h) => h.n === 12).map((h) => h.liters);
      return {
        day,
        liters: a.liters,
        estimatedShare: a.liters > 0 ? a.estimated / a.liters : 0,
        pumpHours: a.pumpSeen ? a.pumpH : null,
        pumpStarts: a.pumpSeen ? a.starts : null,
        nightMinLh: fullHours.length >= 3 ? Math.min(...fullHours) : null,
        coverage: Math.min(1, a.windows / 288),
      };
    });
}

/** Madrugada acima do normal: pelo menos 2× a mediana das noites anteriores e 30 L/h a mais. */
export const LEAK_FACTOR = 2;
export const LEAK_MARGIN_LH = 30;
/** Noites anteriores com dado necessárias antes de julgar (o "normal" varia de unidade para unidade). */
export const LEAK_MIN_NIGHTS = 7;

export type LeakCheck = {
  suspect: boolean;
  nightMinLh: number | null;
  baselineLh: number | null;
  nights: number;
};

/**
 * Possível vazamento na madrugada de `day`: a hora mais calma da noite (0h–5h)
 * comparada com a mesma medida nas 14 noites anteriores. Compara a unidade com
 * ela mesma — torre de resfriamento ou máquina de gelo gastam água a noite
 * toda e não são vazamento; o que denuncia é o salto.
 */
export function leakCheck(days: WaterDay[], day: string): LeakCheck {
  const today = days.find((d) => d.day === day);
  const previous = days
    .filter((d) => d.day < day && d.nightMinLh !== null)
    .slice(-14)
    .map((d) => d.nightMinLh!);
  const nightMinLh = today?.nightMinLh ?? null;
  if (nightMinLh === null || previous.length < LEAK_MIN_NIGHTS) {
    return { suspect: false, nightMinLh, baselineLh: previous.length ? median(previous) : null, nights: previous.length };
  }
  const baselineLh = median(previous);
  return {
    suspect: nightMinLh >= baselineLh * LEAK_FACTOR && nightMinLh >= baselineLh + LEAK_MARGIN_LH,
    nightMinLh,
    baselineLh,
    nights: previous.length,
  };
}

// ---------------------------------------------------------------------------
// Gerador
// ---------------------------------------------------------------------------

/** `estado` do gateway (mesma língua para qualquer controlador). */
export const GENERATOR_STATES = ["Parado", "Pré-partida", "Partindo", "Em carga", "Resfriando", "Em falha"] as const;

export function generatorStateLabel(estado: number | null | undefined): string | null {
  if (!finite(estado)) return null;
  return GENERATOR_STATES[Math.round(estado)] ?? null;
}

export const generatorRunning = (estado: number | null | undefined) => finite(estado) && estado >= 1 && estado <= 4;

export type GeneratorRunLite = {
  startedAt: number;
  endedAt: number | null;
  reason: string | null;
  result: string | null;
  durationSeconds: number | null;
  liters: number | null;
  kwh: number | null;
  batteryRest: number | null;
  batteryMin: number | null;
};

/** Partida que não deu certo: não pegou ou não assumiu a carga. */
export const runFailed = (r: Pick<GeneratorRunLite, "result">) => /falha de partida|não assumiu/i.test(r.result ?? "");
/** Pegou e assumiu, mas desarmou por falha. */
export const runTripped = (r: Pick<GeneratorRunLite, "result">) => /^desarme/i.test(r.result ?? "");

/** Corrida com tempo suficiente para medir o consumo (igual ao gateway). */
const MIN_RUN_FOR_RATE_S = 600;

export type GeneratorStats = {
  starts: number;
  failedStarts: number;
  trips: number;
  hours: number;
  liters: number;
  kwh: number;
  /** Consumo medido (L/h) nas corridas de 10 min ou mais. */
  litersPerHour: number | null;
  lastRunAt: number | null;
  /** Maior queda de tensão da bateria no arranque (V). */
  maxBatteryDrop: number | null;
  /** Queda da bateria no último arranque (V). */
  lastBatteryDrop: number | null;
};

/** Indicadores das corridas a partir de `since` (ms). */
export function generatorStats(runs: GeneratorRunLite[], since: number): GeneratorStats {
  const period = runs.filter((r) => r.startedAt >= since).sort((a, b) => a.startedAt - b.startedAt);
  const drop = (r: GeneratorRunLite) =>
    finite(r.batteryRest) && finite(r.batteryMin) ? Math.max(0, r.batteryRest - r.batteryMin) : null;
  const drops = period.map(drop).filter(finite);
  const rated = period.filter((r) => (r.durationSeconds ?? 0) >= MIN_RUN_FOR_RATE_S && (r.liters ?? 0) > 0);
  const ratedHours = rated.reduce((s, r) => s + r.durationSeconds! / 3600, 0);
  const last = runs.reduce<GeneratorRunLite | null>((m, r) => (!m || r.startedAt > m.startedAt ? r : m), null);
  const lastWithDrop = [...period].reverse().find((r) => drop(r) !== null);
  return {
    starts: period.length,
    failedStarts: period.filter(runFailed).length,
    trips: period.filter(runTripped).length,
    hours: period.reduce((s, r) => s + (r.durationSeconds ?? 0) / 3600, 0),
    liters: period.reduce((s, r) => s + (r.liters ?? 0), 0),
    kwh: period.reduce((s, r) => s + (r.kwh ?? 0), 0),
    litersPerHour: ratedHours > 0 ? rated.reduce((s, r) => s + r.liters!, 0) / ratedHours : null,
    lastRunAt: last?.startedAt ?? null,
    maxBatteryDrop: drops.length ? Math.max(...drops) : null,
    lastBatteryDrop: lastWithDrop ? drop(lastWithDrop) : null,
  };
}

/** Teste semanal é a prática: depois de 7 dias sem partir, avisar; 15, alertar. */
export const DAYS_WITHOUT_RUN_WARN = 7;
export const DAYS_WITHOUT_RUN_ALERT = 15;
