import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Client } from "pg";
import type { FullConfig } from "@playwright/test";
import { E2E } from "./fixtures";

/**
 * Prepara os dados dos testes: cliente "e2e" com uma loja, tarifa verde e um
 * token do Painel; depois envia leituras sintéticas por /api/ingest, como o
 * Painel faria (equipamentos, resumo de 5 min, consumo por hora e alarmes).
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

/** Envios do "Painel": ao vivo (com um alarme), 24 h de resumo de 5 min e consumo por hora. */
function painelPayloads(now: number) {
  const equipments = [
    { id: "geral", nome: "Entrada geral", tag_isa: "QGBT-01", principal: true, disjuntor_a: 400, kw: MAIN_KW },
    ...FEEDERS,
  ];
  const live = {
    versao: 1,
    ts: now,
    agente: { versao: "e2e", planta: "Loja E2E" },
    equipamentos: equipments.map((e) => ({
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
  const hours = [];
  for (let h = Math.floor((now - 30 * HOUR) / HOUR) * HOUR; h + HOUR <= now; h += HOUR) {
    for (const e of equipments) hours.push({ medidor: e.id, grandeza: "ativa", hora: h, kwh: e.kw, fonte: "contador" });
  }
  const history = [];
  for (let i = 0; i < windows.length; i += 2000)
    history.push({ versao: 1, ts: now, resumo_5min: windows.slice(i, i + 2000) });
  history.push({ versao: 1, ts: now, consumo_horario: hours });
  return [live, ...history];
}
