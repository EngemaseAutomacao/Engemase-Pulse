import "server-only";
import { formatChange, formatMoney, formatNumber } from "@/lib/format";
import { zonedParts } from "@/lib/tz";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";
import { appUrl, isEmailConfigured, itemsEmail, sendEmail, type EmailItem } from "@/server/email";
import { reportCaught } from "@/server/errors";
import { getSiteBilling, getSiteMonthConsumption, monthWindow } from "@/server/queries/billing";
import { getTenantTopology } from "@/server/telemetry/topology";

/**
 * Resumo do mês por e-mail: no dia 1 (a partir das 6 h, no fuso do cliente)
 * vai para quem marcou "Resumo do mês" o consumo, o custo, a demanda e os
 * alarmes do mês que fechou, com o link para o relatório completo. Se o
 * envio não acontecer no dia 1 (sistema parado), ainda sai até o dia 3.
 */

const CHECK_EVERY_MS = 30 * 60_000;
const LAST_DAY = 3;

function previousMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function sendMonthlyReports(now = new Date()): Promise<number> {
  const base = appUrl();
  if (!isEmailConfigured() || !base) return 0;
  if (!(await getCache().acquire("monthly-report-check", CHECK_EVERY_MS))) return 0;

  const tenants = await db.tenant.findMany({
    where: { active: true, memberships: { some: { monthlyReport: true, user: { active: true } } } },
    select: { id: true, slug: true, name: true, primaryColor: true, sites: { select: { timezone: true }, take: 1 } },
  });
  let sent = 0;
  for (const tenant of tenants) {
    const timeZone = tenant.sites[0]?.timezone ?? "America/Sao_Paulo";
    const local = zonedParts(now, timeZone);
    if (local.day > LAST_DAY || (local.day === 1 && local.hour < 6)) continue;
    const month = previousMonth(local.year, local.month);

    // Reserva o envio antes (chave única cliente+mês): duas rodadas juntas não mandam em dobro.
    const claimed = await db.monthlyReportDelivery
      .create({ data: { tenantId: tenant.id, month } })
      .then(() => true)
      .catch(() => false);
    if (!claimed) continue;
    try {
      const delivered = await sendTenantReport(tenant, month, timeZone, base);
      if (delivered === 0) {
        await db.monthlyReportDelivery.delete({ where: { tenantId_month: { tenantId: tenant.id, month } } });
      } else {
        await db.monthlyReportDelivery.update({
          where: { tenantId_month: { tenantId: tenant.id, month } },
          data: { recipients: delivered },
        });
        sent += delivered;
      }
    } catch (error) {
      await db.monthlyReportDelivery.deleteMany({ where: { tenantId: tenant.id, month } });
      reportCaught("tarefa", "resumo mensal por e-mail", error);
    }
  }
  return sent;
}

/** Monta e envia o resumo de um cliente; devolve quantos e-mails saíram. */
export async function sendTenantReport(
  tenant: { id: string; slug: string; name: string; primaryColor: string },
  month: string,
  timeZone: string,
  base: string,
): Promise<number> {
  const recipients = await db.membership.findMany({
    where: { tenantId: tenant.id, monthlyReport: true, user: { active: true } },
    select: { user: { select: { email: true } } },
  });
  if (recipients.length === 0) return 0;

  const sites = (await getTenantTopology(tenant.id)).filter((s) => s.meters.length > 0);
  const { start, stop } = monthWindow(month, timeZone);
  const end = new Date(stop.getTime() + 60_000); // mês já fechado: o "agora" fica depois do fim
  const items: EmailItem[] = [];
  let totalCost = 0;
  let anyCost = false;
  for (const site of sites) {
    const [consumption, billing] = await Promise.all([
      getSiteMonthConsumption(tenant.id, site.id, month, end),
      getSiteBilling(tenant.id, site.id, month, end),
    ]);
    if (!consumption) continue;
    const kwh = consumption.entrance.total;
    const bill = billing && "bill" in billing ? billing.bill : null;
    const details: string[] = [];
    if (bill) {
      details.push(`fatura estimada ${formatMoney(bill.total, true)}`);
      totalCost += bill.total;
      anyCost = true;
    }
    const change = formatChange(kwh, consumption.entrance.previousTotal);
    if (change) details.push(`${change} x mês anterior`);
    const demand = bill?.demand.find((d) => d.period !== "peak");
    if (demand?.measured !== null && demand?.measured !== undefined) {
      details.push(
        `demanda máx. ${formatNumber(demand.measured, 0)} kW${demand.contracted ? ` (contratada ${formatNumber(demand.contracted, 0)})` : ""}${
          demand.overrun > 0 ? " — ultrapassou" : ""
        }`,
      );
    }
    if (bill?.averagePowerFactor) details.push(`FP ${formatNumber(bill.averagePowerFactor, 2)}`);
    items.push({ title: site.name, value: `${formatNumber(kwh, 0)} kWh`, detail: details.join(" · ") || undefined });
  }

  const [alarmCount, criticalCount] = await Promise.all([
    db.alarm.count({ where: { tenantId: tenant.id, startedAt: { gte: start, lt: stop } } }),
    db.alarm.count({ where: { tenantId: tenant.id, severity: "CRITICAL", startedAt: { gte: start, lt: stop } } }),
  ]);
  items.push({
    title: "Alarmes no mês",
    value: String(alarmCount),
    detail: criticalCount > 0 ? `${criticalCount} crítico(s)` : alarmCount === 0 ? "Nenhum alarme" : undefined,
  });

  const monthName = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const message = itemsEmail({
    title: `Resumo de ${monthName}`,
    intro: `${tenant.name}: consumo de cada unidade no mês${anyCost ? `, com a fatura estimada (total ${formatMoney(totalCost, true)})` : ""}.`,
    items,
    button: "Ver o relatório completo",
    url: `${base}/relatorio/${tenant.slug}?mes=${month}${sites[0] ? `&unidade=${sites[0].id}` : ""}`,
    footer: "Você recebe porque marcou “Resumo do mês” em Minha conta → Avisos. Valores estimados pelas medições.",
    color: tenant.primaryColor,
  });
  const results = await Promise.all(
    recipients.map((r) => sendEmail({ to: r.user.email, subject: `Resumo de ${monthName} — ${tenant.name}`, ...message })),
  );
  return results.filter(Boolean).length;
}
