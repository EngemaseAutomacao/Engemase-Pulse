import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Client } from "pg";
import type { FullConfig } from "@playwright/test";
import { E2E } from "./fixtures";

/**
 * Prepara os dados dos testes: cliente "e2e" com uma unidade, tarifa verde e um
 * token do gateway; depois envia leituras sintéticas por /api/ingest, como o
 * Gateway faria (equipamentos, resumo de 5 min, consumo por hora e alarmes).
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const token = `pnl_${randomBytes(32).toString("base64url")}`;
    const hash = createHash("sha256").update(token).digest("hex");

    await db.query(`DELETE FROM tenants WHERE slug = $1`, [E2E.slug]);
    const tenant = await db.query<{ id: string }>(
      `INSERT INTO tenants (id, slug, name, primary_color, accent_color, updated_at)
       VALUES (gen_random_uuid(), $1, $2, '#4a9ee0', '#38bdf8', now()) RETURNING id`,
      [E2E.slug, E2E.tenantName],
    );
    const site = await db.query<{ id: string }>(
      `INSERT INTO sites (id, tenant_id, name, timezone, agent_token_hash, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'America/Sao_Paulo', $3, now()) RETURNING id`,
      [tenant.rows[0].id, E2E.siteName, hash],
    );
    await db.query(
      `INSERT INTO site_tariffs (site_id, modality, energy_off_peak, energy_peak, demand_price, contracted_demand, tax_rate, updated_at)
       VALUES ($1, 'GREEN', 0.45, 2.2, 35, 120, 25, now())`,
      [site.rows[0].id],
    );
    writeFileSync("e2e/.site.json", JSON.stringify({ siteId: site.rows[0].id, token }));

    await waitFor(`${baseURL}/login`);
    for (const body of painelPayloads(Date.now())) {
      const response = await fetch(`${baseURL}/api/ingest`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`ingest ${response.status}: ${await response.text()}`);
    }
  } finally {
    await db.end();
  }
}

async function waitFor(url: string) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`servidor não respondeu em ${url}`);
}

const HOUR = 3_600_000;
const WINDOW = 300_000;
const FEEDERS = [
  { id: "frios", nome: "Câmaras frias", tag_isa: "QD-01", disjuntor_a: 200, kw: 40 },
  { id: "luz", nome: "Iluminação", tag_isa: "QD-02", disjuntor_a: 100, kw: 20 },
  { id: "padaria", nome: "Padaria", tag_isa: "QD-03", disjuntor_a: 125, kw: 15 },
];
const MAIN_KW = 85; // setores + ~10 % não medido

function values(kw: number, main: boolean) {
  const amps = (kw * 1000) / (Math.sqrt(3) * 380 * 0.95);
  return {
    potencia_ativa: kw,
    potencia_aparente: kw / 0.95,
    corrente_a: amps * 1.05,
    corrente_b: amps,
    corrente_c: amps * 0.97,
    ...(main ? { tensao_ab: 381, tensao_bc: 380, tensao_ca: 382, fp: 0.95, frequencia: 60 } : {}),
  };
}

/** Reservatório (só nível) e grupo gerador, como o gateway v3 envia (grupos agua e gerador). */
const TANK = { id: "caixa", nome: "Caixa d'água E2E", tag_isa: "TQ-01", capacidade: 10_000 };
const GENSET = { id: "gmg", nome: "Gerador E2E", tag_isa: "GMG-01" };

/** Nível do reservatório: desce 0,5 % a cada 5 min e a bomba enche de volta a cada 2 h. */
const tankLevel = (t: number) => 95 - ((t / WINDOW) % 24) * 1.5;

/** Envios do "Gateway": ao vivo (com um alarme), 24 h de resumo de 5 min e consumo por hora. */
function painelPayloads(now: number) {
  const equipments = [
    { id: "geral", nome: "Entrada geral", tag_isa: "QGBT-01", principal: true, disjuntor_a: 400, kw: MAIN_KW },
    ...FEEDERS,
  ];
  const live = {
    versao: 1,
    ts: now,
    agente: { versao: "e2e", planta: "Unidade E2E", modulos: ["energia", "agua", "gerador"] },
    equipamentos: [
      ...equipments.map((e) => ({
        id: e.id,
        nome: e.nome,
        tag_isa: e.tag_isa,
        grupo: "energia",
        principal: "principal" in e ? e.principal : false,
        disjuntor_a: e.disjuntor_a,
        online: true,
        lido_em: now - 1000,
        valores: values(e.kw, e.id === "geral"),
      })),
      {
        id: TANK.id,
        nome: TANK.nome,
        tag_isa: TANK.tag_isa,
        grupo: "agua",
        perfil: "clp-reservatorio",
        parametros: { capacidade_litros: TANK.capacidade, altura_util_m: 2 },
        marcas: [
          { valor: 97, rotulo: "alto", prioridade: "media" },
          { valor: 60, rotulo: "partida da bomba", prioridade: "info" },
          { valor: 15, rotulo: "crítico", prioridade: "alta" },
        ],
        tags: [{ nome: "nivel", rotulo: "Nível da caixa d'água", unidade: "%", decimais: 1 }],
        online: true,
        lido_em: now - 1000,
        valores: { nivel: tankLevel(now), sensor_falha: 0, modo_automatico: 1, bomba_ligada: 0, horas_bomba: 1234 },
      },
      {
        id: GENSET.id,
        nome: GENSET.nome,
        tag_isa: GENSET.tag_isa,
        grupo: "gerador",
        perfil: "gerador-generico",
        parametros: { potencia_nominal_kw: 150, capacidade_tanque_litros: 400, consumo_litros_hora: 35 },
        tags: [
          { nome: "temperatura", rotulo: "Temperatura da água", unidade: "°C", decimais: 0 },
          { nome: "falha_partida", rotulo: "Falha de partida" },
          { nome: "falha_pressao_oleo", rotulo: "Baixa pressão do óleo" },
          { nome: "falha_bateria", rotulo: "Bateria fraca" },
        ],
        online: true,
        lido_em: now - 1000,
        valores: {
          estado: 0,
          pronto: 1,
          nivel_diesel: 70,
          diesel_litros: 280,
          autonomia_h: 8,
          tensao_bateria: 25.5,
          dias_sem_teste: 3,
          rede_presente: 1,
          potencia: 0,
          rotacao: 0,
          temperatura: 32,
          falha_partida: 0,
          falha_pressao_oleo: 0,
          falha_bateria: 0,
        },
      },
    ],
    alarmes: [
      {
        id: 9001,
        tag: "geral.fp",
        mensagem: "Fator de potência abaixo do mínimo",
        prioridade: "media",
        valor: 0.88,
        limite: "mín 0.92",
        inicio: now - 10 * 60_000,
        reconhecido: false,
      },
    ],
  };
  const windows = [];
  for (let t = Math.floor((now - 24 * HOUR) / WINDOW) * WINDOW; t + WINDOW <= now; t += WINDOW) {
    for (const e of equipments) {
      const v = values(e.kw, e.id === "geral");
      windows.push({
        medidor: e.id,
        ts: t,
        valores: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, [x, x, x]])),
      });
    }
  }
  for (let t = Math.floor((now - 24 * HOUR) / WINDOW) * WINDOW; t + WINDOW <= now; t += WINDOW) {
    const level = tankLevel(t);
    windows.push({ medidor: TANK.id, ts: t, valores: { nivel: [level, level, level] } });
    windows.push({ medidor: GENSET.id, ts: t, valores: { nivel_diesel: [70, 70, 70], tensao_bateria: [25.5, 25.4, 25.6], pronto: [1, 1, 1] } });
  }
  const runs = [
    { id: 1, medidor: GENSET.id, inicio: now - 3 * 24 * HOUR, fim: now - 3 * 24 * HOUR + 900_000, motivo: "teste", resultado: "normal",
      bateria_repouso: 25.6, bateria_minima: 21, duracao_s: 900, litros: 9, kwh: 20 },
    { id: 2, medidor: GENSET.id, inicio: now - 26 * HOUR, fim: now - 26 * HOUR + 20_000, motivo: "teste", resultado: "falha de partida (bateria)",
      bateria_repouso: 24.4, bateria_minima: 17.5, duracao_s: 20, litros: 0, kwh: 0 },
  ];
  const hours = [];
  for (let h = Math.floor((now - 30 * HOUR) / HOUR) * HOUR; h + HOUR <= now; h += HOUR) {
    for (const e of equipments) {
      hours.push({ medidor: e.id, grandeza: "ativa", hora: h, kwh: e.kw, fonte: "contador" });
      hours.push({ medidor: e.id, grandeza: "aparente", hora: h, kwh: e.kw * 1.06, fonte: "contador" });
    }
  }
  const history = [];
  for (let i = 0; i < windows.length; i += 2000)
    history.push({ versao: 1, ts: now, resumo_5min: windows.slice(i, i + 2000) });
  history.push({ versao: 1, ts: now, consumo_horario: hours });
  history.push({ versao: 1, ts: now, gerador_corridas: runs });
  return [live, ...history];
}
