import "server-only";
import { REPORTS, type ReportKind } from "@/lib/reports";
import { zonedParts } from "@/lib/tz";
import type { TenantContext } from "@/server/auth/dal";
import { monthWindow } from "@/server/queries/billing";
import { getTenantTopology } from "@/server/telemetry/topology";
import { getUtilityCatalog, sitesWithModule, visibleModules } from "@/server/utilities/catalog";

/** Unidades que cada relatório pode mostrar e quais relatórios valem para o cliente. */
export async function reportContext(tenant: TenantContext["tenant"]) {
  const [topology, catalog, modules] = await Promise.all([
    getTenantTopology(tenant.id),
    getUtilityCatalog(tenant.id),
    visibleModules(tenant),
  ]);
  const energySites = topology.filter((s) => s.meters.length > 0);
  const withKind = (module: "agua" | "gerador", kind: "WATER" | "GENERATOR") =>
    modules.includes(module)
      ? sitesWithModule(catalog, module)
          .filter((s) => catalog.equipment.some((e) => e.siteId === s.id && e.kind === kind))
          .map((s) => ({ id: s.id, name: s.name, timezone: s.timeZone }))
      : [];
  const generatorSites = withKind("gerador", "GENERATOR");
  const waterSites = withKind("agua", "WATER");
  const has: Record<ReportKind, boolean> = {
    energia: energySites.length > 0,
    demanda: energySites.length > 0,
    gerador: generatorSites.length > 0,
    agua: waterSites.length > 0,
    unidades: energySites.length > 1,
  };
  return {
    topology,
    catalog,
    energySites,
    generatorSites,
    waterSites,
    available: REPORTS.filter((r) => has[r.id]).map((r) => r.id),
  };
}

/** Mês pedido (AAAA-MM) ou o atual no fuso da unidade, com a janela e o nome. */
export function resolveReportMonth(requested: unknown, timeZone: string, now = new Date()) {
  const p = zonedParts(now, timeZone);
  const current = `${p.year}-${String(p.month).padStart(2, "0")}`;
  const month =
    typeof requested === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) && requested <= current
      ? requested
      : current;
  const { start, stop } = monthWindow(month, timeZone);
  const name = new Date(start.getTime() + 15 * 86_400_000).toLocaleDateString("pt-BR", {
    timeZone,
    month: "long",
    year: "numeric",
  });
  const [y, m] = month.split("-").map(Number);
  const previous = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  return { month, maxMonth: current, start, stop, name, inProgress: now < stop, previous };
}
