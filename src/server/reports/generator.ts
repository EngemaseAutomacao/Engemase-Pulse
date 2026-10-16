import "server-only";
import { generatorStats, runFailed, runTripped, type GeneratorStats } from "@/lib/utilities";
import { weekStartsOf, weeklyCoverage, type WeekCoverage } from "@/lib/reports";
import { energyBucketStarts } from "@/lib/time-range";
import { db } from "@/server/db";
import { numericSetting, type UtilityEquipmentRef } from "@/server/utilities/catalog";

/**
 * Relatório mensal do grupo gerador: partidas e o resultado de cada uma, as
 * semanas com partida (o teste semanal), o tempo pronto para partir, o diesel
 * e a bateria dia a dia, a partir do resumo de 5 min e das corridas que o
 * gateway registrou.
 */

export type GeneratorRunRow = {
  id: number;
  startedAt: Date;
  endedAt: Date | null;
  reason: string | null;
  result: string | null;
  status: "running" | "ok" | "failed" | "tripped";
  durationSeconds: number | null;
  liters: number | null;
  kwh: number | null;
  batteryDrop: number | null;
};

export type GeneratorMonth = {
  id: string;
  name: string;
  tag: string | null;
  nominalKw: number | null;
  tankL: number | null;
  stats: GeneratorStats;
  runs: GeneratorRunRow[];
  weeks: WeekCoverage[];
  /** Fração do tempo pronto para partir no mês (0–1). */
  readiness: number | null;
  days: number[];
  /** Menor nível de diesel de cada dia (%). */
  dieselMin: (number | null)[];
  /** Menor tensão da bateria de cada dia (V). */
  batteryMin: (number | null)[];
  dieselFirst: number | null;
  dieselLast: number | null;
  batteryLowest: { value: number; day: number } | null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : v === null || v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function generatorMonth(
  gen: UtilityEquipmentRef,
  start: Date,
  stop: Date,
  now = new Date(),
): Promise<GeneratorMonth> {
  const timeZone = gen.timeZone;
  const days = energyBucketStarts({ start, stop, interval: "1d", timeZone }).map((d) => d.getTime());
  const [runs, daily, overall] = await Promise.all([
    db.generatorRun.findMany({
      where: { equipmentId: gen.id, startedAt: { gte: start, lt: stop } },
      orderBy: { startedAt: "asc" },
      take: 500,
    }),
    db.$queryRaw<{ day: number; diesel: number | null; battery: number | null }[]>`
      SELECT extract(epoch FROM date_trunc('day', (ts AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text) AT TIME ZONE ${timeZone}::text)::float8 * 1000 AS day,
             min(("values" -> 'nivel_diesel' ->> 1)::float8) AS diesel,
             min(("values" -> 'tensao_bateria' ->> 1)::float8) AS battery
        FROM utility_readings_5m
       WHERE equipment_id = ${gen.id}::uuid
         AND ts >= ${start.toISOString()}::timestamp
         AND ts < ${stop.toISOString()}::timestamp
       GROUP BY 1
       ORDER BY 1`,
    db.$queryRaw<{ ready: number | null; first: number | null; last: number | null }[]>`
      SELECT avg(("values" -> 'pronto' ->> 0)::float8) FILTER (WHERE "values" ? 'pronto') AS ready,
             (array_agg(("values" -> 'nivel_diesel' ->> 0)::float8 ORDER BY ts) FILTER (WHERE "values" ? 'nivel_diesel'))[1] AS first,
             (array_agg(("values" -> 'nivel_diesel' ->> 0)::float8 ORDER BY ts DESC) FILTER (WHERE "values" ? 'nivel_diesel'))[1] AS last
        FROM utility_readings_5m
       WHERE equipment_id = ${gen.id}::uuid
         AND ts >= ${start.toISOString()}::timestamp
         AND ts < ${stop.toISOString()}::timestamp`,
  ]);

  const lite = runs.map((r) => ({
    startedAt: r.startedAt.getTime(),
    endedAt: r.endedAt?.getTime() ?? null,
    reason: r.reason,
    result: r.result,
    durationSeconds: r.durationSeconds,
    liters: r.liters,
    kwh: r.kwh,
    batteryRest: r.batteryRest,
    batteryMin: r.batteryMin,
  }));
  const byDay = new Map(daily.map((d) => [Number(d.day), d]));
  const dieselMin = days.map((d) => num(byDay.get(d)?.diesel));
  const batteryMin = days.map((d) => num(byDay.get(d)?.battery));
  let batteryLowest: GeneratorMonth["batteryLowest"] = null;
  batteryMin.forEach((v, i) => {
    if (v !== null && (batteryLowest === null || v < batteryLowest.value)) batteryLowest = { value: v, day: days[i] };
  });

  return {
    id: gen.id,
    name: gen.name,
    tag: gen.tag,
    nominalKw: numericSetting(gen, "potencia_nominal_kw"),
    tankL: numericSetting(gen, "capacidade_tanque_litros"),
    stats: generatorStats(lite, start.getTime()),
    runs: runs.map((r, i) => {
      const l = lite[i];
      return {
        id: r.externalId,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        reason: r.reason,
        result: r.result,
        status: l.endedAt === null ? "running" : runFailed(l) ? "failed" : runTripped(l) ? "tripped" : "ok",
        durationSeconds: r.durationSeconds,
        liters: r.liters,
        kwh: r.kwh,
        batteryDrop: r.batteryRest !== null && r.batteryMin !== null ? Math.max(0, r.batteryRest - r.batteryMin) : null,
      };
    }),
    weeks: weeklyCoverage(
      weekStartsOf(start, stop, timeZone),
      lite.map((r) => ({ startedAt: r.startedAt, ok: !runFailed(r) })),
      now.getTime(),
    ),
    readiness: num(overall[0]?.ready),
    days,
    dieselMin,
    batteryMin,
    dieselFirst: num(overall[0]?.first),
    dieselLast: num(overall[0]?.last),
    batteryLowest,
  };
}
