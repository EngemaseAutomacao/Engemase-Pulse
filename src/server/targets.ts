import "server-only";
import { formatMoney, formatNumber } from "@/lib/format";
import { energyCost, withTaxes } from "@/lib/tariff";
import { projectMonth, TARGET_ALERT_AFTER_DAYS, targetStatus, type SiteTargets, type TargetRow } from "@/lib/targets";
import { notifyAlarms, type AlarmNotice } from "@/server/alarms/notify";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";
import { getSiteBilling, getTariff, hourlyEnergy, monthWindow } from "@/server/queries/billing";
import { getTenantTopology } from "@/server/telemetry/topology";
import { meterLabel } from "@/lib/meter-label";

/**
 * Metas mensais de consumo e custo: o andamento do mês contra a meta de cada
 * unidade (entrada geral) e de cada setor, e o alarme quando a projeção do
 * mês passa da meta.
 */

const HOUR = 3_600_000;

export const siteScope = (siteId: string) => `unidade:${siteId}`;
export const meterScope = (meterId: string) => `medidor:${meterId}`;

export function monthOf(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
}

export async function getSiteTargets(tenantId: string, siteId?: string, now = new Date()): Promise<SiteTargets[]> {
  const sites = (await getTenantTopology(tenantId)).filter((s) => s.meters.length > 0 && (!siteId || s.id === siteId));
  return Promise.all(
    sites.map(async (site) => {
      const month = monthOf(now, site.timezone);
      const { start, stop } = monthWindow(month, site.timezone);
      const until = new Date(Math.min(now.getTime(), stop.getTime()));
      const meterIds = site.meters.map((m) => m.id);
      const [hourly, targets, tariff] = await Promise.all([
        hourlyEnergy(meterIds, start, until),
        db.energyTarget.findMany({ where: { siteId: site.id } }),
        getTariff(site.id),
      ]);
      const bill = tariff ? await getSiteBilling(tenantId, site.id, month, now) : null;
      const byScope = new Map(targets.map((t) => [t.scope, t]));
      const elapsedHours = (until.getTime() - start.getTime()) / HOUR;
      const monthHours = (stop.getTime() - start.getTime()) / HOUR;

      const mains = site.meters.filter((m) => m.isMain);
      const entrance = mains.length > 0 ? mains : site.meters;
      const entranceHours = new Map<number, number>();
      for (const m of entrance) for (const r of hourly.get(m.id) ?? []) entranceHours.set(r.hour, (entranceHours.get(r.hour) ?? 0) + r.kwh);
      const entranceKwh = [...entranceHours.values()].reduce((s, v) => s + v, 0);

      const siteTarget = byScope.get(siteScope(site.id));
      const billing = bill && "bill" in bill ? bill.bill : null;
      const rows: TargetRow[] = [
        {
          scope: siteScope(site.id),
          siteId: site.id,
          meterId: null,
          label: "Unidade inteira",
          detail: mains.length > 0 ? "Entrada geral; custo pela fatura estimada (com demanda)" : "Soma dos medidores",
          kwhSoFar: entranceKwh,
          kwhProjected: projectMonth(entranceKwh, entranceHours.size, elapsedHours, monthHours),
          costSoFar: billing ? billing.total : null,
          costProjected: billing ? (billing.projection?.total ?? billing.total) : null,
          targetKwh: siteTarget?.kwh ?? null,
          targetCost: siteTarget?.cost ?? null,
        },
      ];
      for (const meter of site.meters) {
        if (meter.isMain) continue;
        const hours = hourly.get(meter.id) ?? [];
        const kwh = hours.reduce((s, r) => s + r.kwh, 0);
        const cost = tariff ? withTaxes(energyCost(hours, site.timezone, tariff), tariff.taxRate) : null;
        const projectedKwh = projectMonth(kwh, hours.length, elapsedHours, monthHours);
        const target = byScope.get(meterScope(meter.id));
        rows.push({
          scope: meterScope(meter.id),
          siteId: site.id,
          meterId: meter.id,
          label: meterLabel(meter),
          detail: "Custo da energia do setor",
          kwhSoFar: kwh,
          kwhProjected: projectedKwh,
          costSoFar: cost,
          costProjected: cost !== null && projectedKwh !== null && kwh > 0 ? cost * (projectedKwh / kwh) : cost,
          targetKwh: target?.kwh ?? null,
          targetCost: target?.cost ?? null,
        });
      }
      return { siteId: site.id, siteName: site.name, month, timeZone: site.timezone, hasTariff: tariff !== null, rows };
    }),
  );
}

/** Grava (ou apaga, sem valores) a meta de um escopo do cliente. false = escopo não é do cliente. */
export async function saveTarget(
  tenantId: string,
  scope: string,
  kwh: number | null,
  cost: number | null,
): Promise<boolean> {
  const [kind, id] = scope.split(":");
  let siteId: string | null = null;
  let meterId: string | null = null;
  if (kind === "unidade") {
    siteId = (await db.site.findFirst({ where: { id, tenantId }, select: { id: true } }))?.id ?? null;
  } else if (kind === "medidor") {
    const meter = await db.meter.findFirst({ where: { id, site: { tenantId } }, select: { id: true, siteId: true } });
    siteId = meter?.siteId ?? null;
    meterId = meter?.id ?? null;
  }
  if (!siteId) return false;
  if (kwh === null && cost === null) {
    await db.energyTarget.deleteMany({ where: { scope } });
  } else {
    await db.energyTarget.upsert({
      where: { scope },
      create: { scope, siteId, meterId, kwh, cost },
      update: { kwh, cost },
    });
  }
  await getCache().del(`targets-check`);
  return true;
}

// ---------------------------------------------------------------------------
// Alarme de projeção acima da meta
// ---------------------------------------------------------------------------

const PREFIX = "target:";
const CHECK_EVERY_MS = HOUR;

export async function checkTargets(now = new Date()): Promise<{ opened: number; cleared: number }> {
  if (!(await getCache().acquire("targets-check", CHECK_EVERY_MS))) return { opened: 0, cleared: 0 };
  const sites = await db.site.findMany({
    where: { targets: { some: {} }, tenant: { active: true } },
    select: { id: true, name: true, tenant: { select: { id: true, slug: true, name: true } } },
  });
  const open = await db.alarm.findMany({ where: { openKey: { startsWith: PREFIX } }, select: { id: true, openKey: true } });
  const wanted = new Map<string, { tenant: { id: string; slug: string; name: string }; siteId: string; title: string; message: string; value: number }>();

  for (const site of sites) {
    const [data] = await getSiteTargets(site.tenant.id, site.id, now);
    if (!data) continue;
    const day = Number(new Intl.DateTimeFormat("en-CA", { timeZone: data.timeZone, day: "2-digit" }).format(now));
    if (day < TARGET_ALERT_AFTER_DAYS) continue;
    const monthName = new Date(`${data.month}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
    for (const row of data.rows) {
      const where = row.meterId ? `${row.label} (${site.name})` : site.name;
      const kwhOver = targetStatus(row.kwhProjected, row.targetKwh) === "over";
      const costOver = targetStatus(row.costProjected, row.targetCost) === "over";
      if (!kwhOver && !costOver) continue;
      const parts = [
        kwhOver &&
          `${formatNumber(row.kwhProjected!, 0)} kWh previstos para ${monthName} (meta ${formatNumber(row.targetKwh!, 0)} kWh, +${formatNumber(((row.kwhProjected! - row.targetKwh!) / row.targetKwh!) * 100, 0)} %)`,
        costOver &&
          `${formatMoney(row.costProjected!, true)} previstos (meta ${formatMoney(row.targetCost!, true)})`,
      ].filter(Boolean);
      wanted.set(`${PREFIX}${row.scope}:${data.month}`, {
        tenant: site.tenant,
        siteId: site.id,
        title: `Projeção acima da meta — ${where}`,
        message: `${parts.join("; ")}. Até agora: ${formatNumber(row.kwhSoFar, 0)} kWh. Veja Metas.`,
        value: kwhOver ? row.kwhProjected! : row.costProjected!,
      });
    }
  }

  const stale = open.filter((a) => !wanted.has(a.openKey!)).map((a) => a.id);
  if (stale.length > 0) {
    await db.alarm.updateMany({ where: { id: { in: stale } }, data: { clearedAt: now, openKey: null } });
  }
  const openKeys = new Set(open.map((a) => a.openKey));
  const toOpen = [...wanted].filter(([key]) => !openKeys.has(key));
  if (toOpen.length === 0) return { opened: 0, cleared: stale.length };

  const created = await db.alarm.createManyAndReturn({
    data: toOpen.map(([key, w]) => ({
      tenantId: w.tenant.id,
      siteId: w.siteId,
      severity: "WARNING" as const,
      title: w.title,
      message: w.message,
      value: w.value,
      openKey: key,
    })),
    skipDuplicates: true,
    select: { tenantId: true, severity: true, title: true, message: true, openKey: true },
  });
  const byTenant = new Map<string, { tenant: { id: string; slug: string; name: string }; notices: AlarmNotice[] }>();
  for (const alarm of created) {
    const tenant = wanted.get(alarm.openKey!)!.tenant;
    const entry = byTenant.get(tenant.id) ?? { tenant, notices: [] };
    entry.notices.push({ severity: alarm.severity, title: alarm.title, message: alarm.message, tag: alarm.openKey! });
    byTenant.set(tenant.id, entry);
  }
  await Promise.all([...byTenant.values()].map((e) => notifyAlarms(e.tenant, e.notices)));
  return { opened: created.length, cleared: stale.length };
}
