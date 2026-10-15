import "server-only";
import { analyzeCapacitors, type PowerFactorResponse, type PowerSample } from "@/lib/power-factor";
import { hasDemand, withTaxes } from "@/lib/tariff";
import { cached } from "@/server/cache";
import { db } from "@/server/db";
import { getTariff } from "@/server/queries/billing";
import { getTenantTopology } from "@/server/telemetry/topology";

const DAYS = 30;

/** Fator de potência da entrada nos últimos 30 dias e o banco de capacitores recomendado. */
export async function getPowerFactorAnalysis(tenantId: string, siteId: string): Promise<PowerFactorResponse | null> {
  const site = (await getTenantTopology(tenantId)).find((s) => s.id === siteId);
  if (!site) return null;
  const main = site.meters.find((m) => m.isMain);
  const tariff = await getTariff(site.id);
  const empty: PowerFactorResponse = {
    siteId,
    days: DAYS,
    coveredDays: 0,
    analysis: null,
    groupA: tariff ? hasDemand(tariff.modality) : false,
    hasTariff: tariff !== null,
    monthlyCostNow: null,
    monthlyCostAfter: null,
    noMainMeter: !main,
    estimatedReactive: false,
  };
  if (!main) return empty;

  // Uma vez por hora basta: são ~8.600 amostras de 5 min.
  return cached(`power-factor:v1:${site.id}:${Math.floor(Date.now() / 3_600_000)}`, 3_600_000, async () => {
    const since = new Date(Date.now() - DAYS * 86_400_000);
    const rows = await db.$queryRaw<{ kw: number | null; kvar: number | null; pf: number | null }[]>`
      SELECT ("values" -> 'Total_kW' ->> 0)::float8 AS kw,
             ("values" -> 'Total_kVAr' ->> 0)::float8 AS kvar,
             ("values" -> 'PF_AVG' ->> 0)::float8 AS pf
        FROM meter_readings_5m
       WHERE meter_id = ${main.id}::uuid AND ts >= ${since.toISOString()}::timestamp
         AND "values" ? 'Total_kW'`;
    let estimated = false;
    const samples: PowerSample[] = rows.flatMap((r) => {
      if (r.kw === null) return [];
      const kw = Number(r.kw);
      if (r.kvar !== null) return [{ kw, kvar: Number(r.kvar) }];
      if (r.pf === null) return [];
      const pf = Math.min(1, Math.abs(Number(r.pf)));
      if (pf <= 0) return [];
      estimated = true;
      return [{ kw, kvar: kw * Math.tan(Math.acos(pf)) }];
    });
    if (samples.length === 0) return empty;
    const analysis = analyzeCapacitors(samples);
    const coveredDays = (samples.length * 5) / 1440;
    const perMonth = coveredDays > 0 ? 30 / coveredDays : 0;
    const groupA = tariff ? hasDemand(tariff.modality) : false;
    const price = tariff?.energyOffPeak ?? 0;
    return {
      ...empty,
      coveredDays,
      analysis,
      estimatedReactive: estimated,
      monthlyCostNow: groupA && tariff ? withTaxes(analysis.excessNow * price, tariff.taxRate) * perMonth : null,
      monthlyCostAfter: groupA && tariff ? withTaxes(analysis.excessAfter * price, tariff.taxRate) * perMonth : null,
    };
  });
}
