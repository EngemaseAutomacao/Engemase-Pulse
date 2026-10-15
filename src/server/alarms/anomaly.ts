import "server-only";
import { anomalyState, baselineOf, classifyHour, type Baseline, type HourState } from "@/lib/anomaly";
import { formatNumber } from "@/lib/format";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";
import { RENOTIFY_AFTER_MS, notifyAlarms, type AlarmNotice } from "./notify";

/**
 * Consumo fora do padrão por medidor, pelas horas fechadas que o Painel
 * consolida (meter_energy_hours). Roda nas tarefas periódicas a cada 15 min;
 * a hora que ainda não chegou fica para a próxima rodada.
 */

const CHECK_EVERY_MS = 15 * 60_000;
const HOUR = 3_600_000;
const WEEK = 7 * 86_400_000;
const WEEKS = 4;
const PREFIX = "anomaly:";

export const anomalyKey = (meterId: string) => `${PREFIX}${meterId}`;

export async function checkAnomalies(now = Date.now()): Promise<{ opened: number; cleared: number }> {
  if (!(await getCache().acquire("anomaly-check", CHECK_EVERY_MS))) return { opened: 0, cleared: 0 };

  const last = Math.floor(now / HOUR) * HOUR - HOUR; // última hora fechada
  const previous = last - HOUR;
  const targets = [last, previous];
  const hours = targets.flatMap((t) => [t, ...Array.from({ length: WEEKS }, (_, k) => t - (k + 1) * WEEK)]);

  const meters = await db.meter.findMany({
    where: { active: true, site: { tenant: { active: true } } },
    select: {
      id: true,
      tag: true,
      name: true,
      site: { select: { id: true, name: true, timezone: true, tenant: { select: { id: true, slug: true, name: true } } } },
    },
  });
  if (meters.length === 0) return { opened: 0, cleared: 0 };
  const ids = meters.map((m) => m.id);

  const [rows, typicalRows, open] = await Promise.all([
    db.$queryRaw<{ meter_id: string; hour: number; kwh: number }[]>`
      SELECT meter_id::text, extract(epoch FROM hour)::float8 * 1000 AS hour, value::float8 AS kwh
        FROM meter_energy_hours
       WHERE quantity = 'ACTIVE'
         AND meter_id = ANY(${ids}::uuid[])
         AND hour = ANY(${hours.map((h) => new Date(h).toISOString())}::timestamp[])`,
    typicalHourly(ids, now),
    db.alarm.findMany({ where: { openKey: { startsWith: PREFIX } }, select: { id: true, openKey: true } }),
  ]);
  const value = new Map(rows.map((r) => [`${r.meter_id}|${Number(r.hour)}`, Number(r.kwh)]));
  const openByKey = new Map(open.map((a) => [a.openKey!, a.id]));

  const toClear: string[] = [];
  const toOpen: { meter: (typeof meters)[number]; state: "high" | "low"; baseline: Baseline; average: number }[] = [];
  for (const meter of meters) {
    const typical = typicalRows.get(meter.id) ?? 0;
    const judge = (t: number): { state: HourState; baseline: Baseline; kwh: number } | null => {
      const kwh = value.get(`${meter.id}|${t}`);
      if (kwh === undefined) return null;
      const history = Array.from({ length: WEEKS }, (_, k) => value.get(`${meter.id}|${t - (k + 1) * WEEK}`)).filter(
        (v): v is number => v !== undefined,
      );
      const baseline = baselineOf(history, typical);
      return baseline ? { state: classifyHour(kwh, baseline), baseline, kwh } : null;
    };
    const a = judge(last);
    const b = judge(previous);
    const state = anomalyState(a?.state ?? null, b?.state ?? null);
    const key = anomalyKey(meter.id);
    if (state === "normal" && openByKey.has(key)) toClear.push(openByKey.get(key)!);
    if ((state === "high" || state === "low") && !openByKey.has(key) && a && b) {
      toOpen.push({ meter, state, baseline: a.baseline, average: (a.kwh + b.kwh) / 2 });
    }
  }

  if (toClear.length > 0) {
    await db.alarm.updateMany({ where: { id: { in: toClear }, clearedAt: null }, data: { clearedAt: new Date(now), openKey: null } });
  }
  if (toOpen.length === 0) return { opened: 0, cleared: toClear.length };

  const hourLabel = (t: number, timeZone: string) =>
    new Date(t).toLocaleTimeString("pt-BR", { timeZone, hour: "2-digit", hour12: false }).replace(/\D.*$/, "") + "h";
  const weekday = (t: number, timeZone: string) =>
    new Date(t).toLocaleDateString("pt-BR", { timeZone, weekday: "long" });

  const created = await db.alarm.createManyAndReturn({
    data: toOpen.map(({ meter, state, baseline, average }) => {
      const tz = meter.site.timezone;
      const span = `Das ${hourLabel(previous, tz)} às ${hourLabel(last + HOUR, tz)} (${weekday(last, tz)})`;
      const normal = `o normal nesse horário é ${formatNumber(baseline.median, 1)} kWh por hora`;
      return {
        tenantId: meter.site.tenant.id,
        siteId: meter.site.id,
        meterId: meter.id,
        severity: "WARNING" as const,
        title: `Consumo ${state === "high" ? "acima" : "abaixo"} do normal — ${meter.tag} ${meter.name}`,
        message:
          state === "high"
            ? `${span}, ${formatNumber(average, 1)} kWh por hora; ${normal} (até ${formatNumber(baseline.high, 1)}). Veja se algum equipamento ficou ligado ou está com defeito.`
            : `${span}, ${formatNumber(average, 1)} kWh por hora; ${normal}. Pode ser equipamento parado (câmara fria, compressor, ar-condicionado).`,
        value: average,
        openKey: anomalyKey(meter.id),
      };
    }),
    skipDuplicates: true,
    select: { tenantId: true, meterId: true, severity: true, title: true, message: true, openKey: true },
  });

  // Mesmo medidor que voltou ao normal há pouco não notifica de novo.
  const recent = await db.alarm.findMany({
    where: {
      meterId: { in: created.map((a) => a.meterId!) },
      title: { startsWith: "Consumo " },
      clearedAt: { gte: new Date(now - 4 * RENOTIFY_AFTER_MS) },
    },
    select: { meterId: true },
  });
  const quiet = new Set(recent.map((a) => a.meterId));
  const byTenant = new Map<string, { tenant: { id: string; slug: string; name: string }; notices: AlarmNotice[] }>();
  for (const alarm of created) {
    if (quiet.has(alarm.meterId)) continue;
    const tenant = toOpen.find((o) => o.meter.id === alarm.meterId)!.meter.site.tenant;
    const entry = byTenant.get(tenant.id) ?? { tenant, notices: [] };
    entry.notices.push({ severity: alarm.severity, title: alarm.title, message: alarm.message, tag: alarm.openKey! });
    byTenant.set(tenant.id, entry);
  }
  await Promise.all([...byTenant.values()].map((e) => notifyAlarms(e.tenant, e.notices)));
  return { opened: created.length, cleared: toClear.length };
}

/** Consumo médio por hora de cada medidor nos últimos 28 dias (escala do circuito); em cache por 6 h. */
async function typicalHourly(meterIds: string[], now: number): Promise<Map<string, number>> {
  const cache = getCache();
  const key = "anomaly:typical:v1";
  const stored = await cache.get<Record<string, number>>(key);
  if (stored && meterIds.every((id) => id in stored)) return new Map(Object.entries(stored));
  const rows = await db.$queryRaw<{ meter_id: string; kwh: number }[]>`
    SELECT meter_id::text, avg(value)::float8 AS kwh
      FROM meter_energy_hours
     WHERE quantity = 'ACTIVE'
       AND meter_id = ANY(${meterIds}::uuid[])
       AND hour >= ${new Date(now - 28 * 86_400_000).toISOString()}::timestamp
     GROUP BY meter_id`;
  const result = Object.fromEntries(meterIds.map((id) => [id, 0]));
  for (const r of rows) result[r.meter_id] = Number(r.kwh);
  await cache.set(key, result, 6 * HOUR);
  return new Map(Object.entries(result));
}
