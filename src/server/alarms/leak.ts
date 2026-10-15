import "server-only";
import { formatNumber } from "@/lib/format";
import { leakCheck, siteHasModule, waterDays } from "@/lib/utilities";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";
import { localDay, waterSamples } from "@/server/utilities/views";
import { notifyAlarms, type AlarmNotice } from "./notify";

/**
 * Possível vazamento de água: a hora mais calma da madrugada (0h–5h) de cada
 * reservatório contra as noites anteriores da mesma unidade (ver leakCheck). Roda
 * nas tarefas periódicas a cada hora; a madrugada só é julgada depois das 6h.
 */

const CHECK_EVERY_MS = 60 * 60_000;
const DAY = 86_400_000;
const PREFIX = "leak:";

export const leakKey = (equipmentId: string) => `${PREFIX}${equipmentId}`;

export async function checkLeaks(now = Date.now()): Promise<{ opened: number; cleared: number }> {
  if (!(await getCache().acquire("leak-check", CHECK_EVERY_MS))) return { opened: 0, cleared: 0 };

  const tanks = await db.utilityEquipment.findMany({
    where: { kind: "WATER", site: { tenant: { active: true } } },
    select: {
      id: true,
      tag: true,
      name: true,
      settings: true,
      site: {
        select: {
          id: true,
          name: true,
          timezone: true,
          modules: true,
          tenant: { select: { id: true, slug: true, name: true, modulesOff: true } },
        },
      },
    },
  });
  const open = await db.alarm.findMany({ where: { openKey: { startsWith: PREFIX } }, select: { id: true, openKey: true } });
  const openByKey = new Map(open.map((a) => [a.openKey!, a.id]));

  const toClear: string[] = [];
  const toOpen: {
    tank: (typeof tanks)[number];
    day: string;
    nightMinLh: number;
    baselineLh: number;
    nights: number;
  }[] = [];

  for (const tank of tanks) {
    const { site } = tank;
    const enabled =
      !site.tenant.modulesOff.includes("agua") && siteHasModule({ declared: site.modules, kinds: ["WATER"] }, "agua");
    const capacity = (tank.settings as Record<string, unknown> | null)?.capacidade_litros;
    const key = leakKey(tank.id);
    if (!enabled || typeof capacity !== "number" || capacity <= 0) {
      if (openByKey.has(key)) toClear.push(openByKey.get(key)!);
      continue;
    }
    const { day: today, hour } = localDay(now, site.timezone);
    const day = hour >= 6 ? today : localDay(now - DAY, site.timezone).day;
    const check = leakCheck(waterDays(await waterSamples(tank.id, now), capacity, site.timezone), day);
    if (check.nightMinLh === null) continue; // madrugada sem dado: não abre nem fecha
    if (!check.suspect && openByKey.has(key)) toClear.push(openByKey.get(key)!);
    if (check.suspect && !openByKey.has(key)) {
      toOpen.push({ tank, day, nightMinLh: check.nightMinLh, baselineLh: check.baselineLh!, nights: check.nights });
    }
  }

  if (toClear.length > 0) {
    await db.alarm.updateMany({ where: { id: { in: toClear }, clearedAt: null }, data: { clearedAt: new Date(now), openKey: null } });
  }
  if (toOpen.length === 0) return { opened: 0, cleared: toClear.length };

  const created = await db.alarm.createManyAndReturn({
    data: toOpen.map(({ tank, day, nightMinLh, baselineLh, nights }) => ({
      tenantId: tank.site.tenant.id,
      siteId: tank.site.id,
      severity: "WARNING" as const,
      title: `Possível vazamento de água — ${tank.tag ? `${tank.tag} ` : ""}${tank.name} (${tank.site.name})`,
      message:
        `Na madrugada de ${day.slice(8, 10)}/${day.slice(5, 7)}, a hora mais calma gastou ${formatNumber(nightMinLh, 0)} L/h; ` +
        `o normal desta unidade é ${formatNumber(baselineLh, 0)} L/h (últimas ${nights} noites). ` +
        "Confira descargas, boias, torneiras e o próprio reservatório.",
      value: nightMinLh,
      openKey: leakKey(tank.id),
    })),
    skipDuplicates: true,
    select: { tenantId: true, severity: true, title: true, message: true, openKey: true },
  });

  const byTenant = new Map<string, { tenant: { id: string; slug: string; name: string }; notices: AlarmNotice[] }>();
  for (const alarm of created) {
    const tenant = toOpen.find((o) => leakKey(o.tank.id) === alarm.openKey)!.tank.site.tenant;
    const entry = byTenant.get(tenant.id) ?? { tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name }, notices: [] };
    entry.notices.push({ severity: alarm.severity, title: alarm.title, message: alarm.message, tag: alarm.openKey! });
    byTenant.set(tenant.id, entry);
  }
  await Promise.all([...byTenant.values()].map((e) => notifyAlarms(e.tenant, e.notices)));
  return { opened: created.length, cleared: toClear.length };
}
