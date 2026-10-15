import "server-only";
import {
  demandStatus,
  demandWindowStart,
  DEMAND_WINDOW_MS,
  projectDemand,
  type SiteDemandNow,
} from "@/lib/demand-forecast";
import { formatNumber } from "@/lib/format";
import { DEMAND_TOLERANCE, hasDemand, periodAt, type Tariff } from "@/lib/tariff";
import { readAgentLive } from "@/server/agent/live-store";
import { RENOTIFY_AFTER_MS, notifyAlarms } from "@/server/alarms/notify";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";
import { reportCaught } from "@/server/errors";
import { toTariff } from "@/server/queries/billing";
import { getTenantTopology } from "@/server/telemetry/topology";

/**
 * Demanda da janela de 15 min em andamento, por unidade com tarifa verde ou
 * azul: para a tela ("Demanda agora") e para o alarme preventivo, que avisa
 * enquanto ainda dá tempo de desligar carga.
 */

/** Leitura ao vivo mais velha que isso não serve como "potência de agora". */
const LIVE_FRESH_MS = 2 * 60_000;

type SiteRef = { id: string; name: string; timezone: string; mainMeterId: string };

export async function getSiteDemandNow(site: SiteRef, tariff: Tariff, now = Date.now()): Promise<SiteDemandNow> {
  const windowStart = demandWindowStart(now);
  const [rows, live] = await Promise.all([
    db.$queryRaw<{ ts: number; kw: number }[]>`
      SELECT extract(epoch FROM ts)::float8 * 1000 AS ts, ("values" -> 'Total_kW' ->> 0)::float8 AS kw
        FROM meter_readings_5m
       WHERE meter_id = ${site.mainMeterId}::uuid
         AND ts >= ${new Date(windowStart).toISOString()}::timestamp
         AND ts < ${new Date(windowStart + DEMAND_WINDOW_MS).toISOString()}::timestamp
         AND "values" ? 'Total_kW'
       ORDER BY ts`,
    readAgentLive(site.id),
  ]);
  const reading = live?.readings[site.mainMeterId];
  const fresh = reading?.time && now - Date.parse(reading.time) <= LIVE_FRESH_MS;
  const currentKw = fresh && Number.isFinite(reading.values.Total_kW) ? reading.values.Total_kW : null;
  const projection = projectDemand({
    now,
    blocks: rows.map((r) => ({ ts: Number(r.ts), kw: Number(r.kw) })),
    currentKw,
  });
  const period =
    tariff.modality === "BLUE" ? (periodAt(now, site.timezone, tariff) === "peak" ? "peak" : "offPeak") : "single";
  const contracted = period === "peak" ? tariff.contractedDemandPeak : tariff.contractedDemand;
  return {
    ...projection,
    siteId: site.id,
    siteName: site.name,
    timeZone: site.timezone,
    period,
    contracted,
    status: demandStatus(projection.projected, contracted),
  };
}

/** Unidades do cliente com tarifa de demanda e entrada geral. */
export async function getTenantDemandNow(tenantId: string, siteId?: string): Promise<SiteDemandNow[]> {
  const sites = (await getTenantTopology(tenantId)).filter((s) => !siteId || s.id === siteId);
  const candidates = sites.flatMap((s) => {
    const main = s.meters.find((m) => m.isMain);
    return main ? [{ id: s.id, name: s.name, timezone: s.timezone, mainMeterId: main.id }] : [];
  });
  if (candidates.length === 0) return [];
  const tariffs = await db.siteTariff.findMany({
    where: { siteId: { in: candidates.map((c) => c.id) }, modality: { in: ["GREEN", "BLUE"] } },
  });
  const bySite = new Map(tariffs.map((t) => [t.siteId, toTariff(t)]));
  const now = Date.now();
  return Promise.all(
    candidates.filter((c) => bySite.has(c.id)).map((c) => getSiteDemandNow(c, bySite.get(c.id)!, now)),
  );
}

// ---------------------------------------------------------------------------
// Alarme preventivo
// ---------------------------------------------------------------------------

const FORECAST_PREFIX = "demand-forecast:";
/** Antes disso a projeção depende demais da potência de um instante. */
const MIN_ELAPSED_MIN = 4;
/** Volta a ficar normal só com folga (evita abrir e fechar a cada leitura). */
const CLEAR_BELOW = 0.97;

export const demandForecastKey = (siteId: string) => `${FORECAST_PREFIX}${siteId}`;

const clock = (t: number, timeZone: string) =>
  new Date(t).toLocaleTimeString("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" });

/** Chamado a cada envio do gateway com leitura ao vivo; roda no máximo uma vez por minuto por unidade. */
export async function checkDemandForecast(siteId: string, now = Date.now()): Promise<void> {
  if (!(await getCache().acquire(`demand-forecast:${siteId}`, 60_000))) return;
  try {
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        name: true,
        timezone: true,
        tenantId: true,
        tariff: true,
        tenant: { select: { id: true, slug: true, name: true, active: true } },
        meters: { where: { isMain: true, active: true }, select: { id: true }, take: 1 },
      },
    });
    const key = demandForecastKey(siteId);
    const open = await db.alarm.findUnique({ where: { openKey: key }, select: { id: true } });
    const tariff = site?.tariff ? toTariff(site.tariff) : null;
    if (!site || !site.tenant.active || !tariff || !hasDemand(tariff.modality) || site.meters.length === 0) {
      if (open) await db.alarm.update({ where: { id: open.id }, data: { clearedAt: new Date(now), openKey: null } });
      return;
    }

    const demand = await getSiteDemandNow(
      { id: site.id, name: site.name, timezone: site.timezone, mainMeterId: site.meters[0].id },
      tariff,
      now,
    );
    if (!demand.contracted || demand.projected === null || demand.elapsedMin < MIN_ELAPSED_MIN) return;

    if (open) {
      if (demand.projected <= demand.contracted * CLEAR_BELOW) {
        await db.alarm.update({ where: { id: open.id }, data: { clearedAt: new Date(now), openKey: null } });
      }
      return;
    }
    if (demand.projected <= demand.contracted) return;

    const limit = demand.contracted * (1 + DEMAND_TOLERANCE);
    const over = demand.projected > limit;
    const until = clock(demand.windowEnd, site.timezone);
    const postoLabel = demand.period === "peak" ? " na ponta" : demand.period === "offPeak" ? " fora ponta" : "";
    const [created] = await db.alarm.createManyAndReturn({
      data: [
        {
          tenantId: site.tenantId,
          siteId: site.id,
          severity: over ? "CRITICAL" : "WARNING",
          title: `Demanda vai passar da contratada — ${site.name}`,
          message: `Janela das ${clock(demand.windowStart, site.timezone)} às ${until}: média projetada de ${formatNumber(demand.projected, 0)} kW (contratada ${formatNumber(demand.contracted, 0)} kW${postoLabel}${
            over ? `; acima da tolerância de ${formatNumber(limit, 0)} kW, gera multa` : ""
          }).${demand.currentKw !== null ? ` Potência agora: ${formatNumber(demand.currentKw, 0)} kW.` : ""} Reduza cargas até ${until}.`,
          value: demand.projected,
          openKey: key,
        },
      ],
      skipDuplicates: true,
      select: { severity: true, title: true, message: true },
    });
    if (!created) return;
    // Carga alta por várias janelas seguidas notifica só a primeira.
    const recent = await db.alarm.count({
      where: { siteId: site.id, title: { startsWith: "Demanda vai passar" }, clearedAt: { gte: new Date(now - 2 * RENOTIFY_AFTER_MS) } },
    });
    if (recent === 0) await notifyAlarms(site.tenant, [{ ...created, tag: key }]);
  } catch (error) {
    reportCaught("servidor", "previsão de demanda", error);
  }
}

/** Unidade que parou de enviar não pode deixar o aviso de demanda aberto. */
export async function closeStaleDemandForecasts(now = Date.now()): Promise<number> {
  const open = await db.alarm.findMany({
    where: { openKey: { startsWith: FORECAST_PREFIX } },
    select: { id: true, site: { select: { agentLastSeenAt: true } } },
  });
  const stale = open.filter((a) => !a.site?.agentLastSeenAt || now - a.site.agentLastSeenAt.getTime() > 5 * 60_000);
  if (stale.length === 0) return 0;
  const { count } = await db.alarm.updateMany({
    where: { id: { in: stale.map((a) => a.id) }, clearedAt: null },
    data: { clearedAt: new Date(now), openKey: null },
  });
  return count;
}
