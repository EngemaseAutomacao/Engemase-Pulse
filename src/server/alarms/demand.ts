import "server-only";
import { formatMoney, formatNumber } from "@/lib/format";
import { demandCharges, hasDemand, maxDemand } from "@/lib/tariff";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";
import { demandWindows, monthWindow, toTariff } from "@/server/queries/billing";
import { pushAlarms } from "./notify";

/**
 * Ultrapassagem de demanda: a maior média de 15 min do mês passou da
 * contratada além da tolerância. A multa já está garantida, então o alarme
 * fica aberto até o fim do mês (um por unidade por mês) — serve para avisar
 * a tempo de rever cargas e o contrato.
 */

const CHECK_EVERY_MS = 15 * 60_000;
const KEY_PREFIX = "demand-overrun:";

export async function checkDemandOverruns(now = new Date()): Promise<{ opened: number; cleared: number }> {
  if (!(await getCache().acquire("demand-check", CHECK_EVERY_MS))) return { opened: 0, cleared: 0 };

  const sites = await db.site.findMany({
    where: { tariff: { modality: { in: ["GREEN", "BLUE"] } }, tenant: { active: true } },
    select: {
      id: true,
      name: true,
      tenantId: true,
      timezone: true,
      tariff: true,
      tenant: { select: { id: true, slug: true, name: true } },
      meters: { where: { isMain: true, active: true }, select: { id: true }, take: 1 },
    },
  });
  const monthOf = (timeZone: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(now).slice(0, 7);

  // Mês virou: fecha os alarmes do mês anterior.
  const open = await db.alarm.findMany({
    where: { openKey: { startsWith: KEY_PREFIX } },
    select: { id: true, openKey: true },
  });
  const currentKeys = new Set(sites.map((s) => `${KEY_PREFIX}${s.id}:${monthOf(s.timezone)}`));
  const stale = open.filter((a) => !currentKeys.has(a.openKey!)).map((a) => a.id);
  if (stale.length > 0) {
    await db.alarm.updateMany({ where: { id: { in: stale } }, data: { clearedAt: now, openKey: null } });
  }
  const openKeys = new Set(open.map((a) => a.openKey));

  let opened = 0;
  for (const site of sites) {
    const main = site.meters[0];
    const key = `${KEY_PREFIX}${site.id}:${monthOf(site.timezone)}`;
    if (!main || !site.tariff || openKeys.has(key)) continue;
    const tariff = toTariff(site.tariff);
    if (!hasDemand(tariff.modality)) continue;

    const { start, stop } = monthWindow(monthOf(site.timezone), site.timezone);
    const windows = await demandWindows(main.id, start, stop);
    const charges = demandCharges(tariff, maxDemand(windows, site.timezone, tariff)).filter((c) => c.overrun > 0);
    if (charges.length === 0) continue;

    const worst = charges.reduce((a, b) => (b.overrun > a.overrun ? b : a));
    const fine = charges.reduce((s, c) => s + c.overrunCost, 0);
    const created = await db.alarm.createManyAndReturn({
      data: [
        {
          tenantId: site.tenantId,
          siteId: site.id,
          severity: "WARNING",
          title: `Demanda acima da contratada — ${site.name}`,
          message: `Maior demanda do mês: ${formatNumber(worst.measured, 1)} kW (contratada ${formatNumber(worst.contracted, 0)} kW${
            worst.period === "peak" ? ", na ponta" : worst.period === "offPeak" ? ", fora ponta" : ""
          }). Multa estimada de ${formatMoney(fine)} sem impostos. Veja a Fatura.`,
          value: worst.measured,
          openKey: key,
        },
      ],
      skipDuplicates: true,
      select: { severity: true, title: true, message: true, openKey: true },
    });
    opened += created.length;
    if (created.length > 0)
      await pushAlarms(
        site.tenant,
        created.map((a) => ({ ...a, tag: a.openKey! })),
      );
  }
  return { opened, cleared: stale.length };
}
