import "server-only";
import { leakCheck, levelMarks, waterDays, type LevelMark, type WaterDay, type WaterSample } from "@/lib/utilities";
import { energyBucketStarts } from "@/lib/time-range";
import { zonedParts } from "@/lib/tz";
import { db } from "@/server/db";
import { numericSetting, type UtilityEquipmentRef } from "@/server/utilities/catalog";

/**
 * Relatório mensal do reservatório: consumo em m³ dia a dia (as mesmas contas
 * da tela Água), as madrugadas com suspeita de vazamento, a bomba e o nível.
 * Lê também o mês anterior, que dá a comparação e a referência das madrugadas
 * no começo do mês.
 */

const DAY = 86_400_000;

export type WaterMonthDay = WaterDay & { start: number; leakSuspect: boolean; baselineLh: number | null };

export type WaterMonth = {
  id: string;
  name: string;
  tag: string | null;
  capacityL: number | null;
  marks: LevelMark[];
  /** Dias do mês (todos, com ou sem leitura). */
  days: { start: number; data: WaterMonthDay | null }[];
  totalLiters: number;
  /** Média por dia com leitura, no mês e no anterior (compara mês em andamento com mês fechado). */
  perDayLiters: number | null;
  previousPerDayLiters: number | null;
  pumpHours: number | null;
  pumpStarts: number | null;
  level: { min: number | null; minAt: Date | null; avg: number | null; hoursBelowCritical: number | null };
  levelOnly: boolean;
};

const localKey = (ts: number, timeZone: string) => {
  const p = zonedParts(new Date(ts), timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

export async function waterMonth(
  tank: UtilityEquipmentRef,
  start: Date,
  stop: Date,
  previousStart: Date,
): Promise<WaterMonth> {
  const timeZone = tank.timeZone;
  const capacityL = numericSetting(tank, "capacidade_litros");
  const marks = levelMarks(tank.settings.marcas);
  const critical = marks.filter((m) => m.tone === "critical").sort((a, b) => b.value - a.value)[0] ?? null;
  // um dia antes do mês anterior: o consumo de cada janela usa a anterior
  const from = new Date(previousStart.getTime() - DAY);

  const [rows, level] = await Promise.all([
    db.$queryRaw<{ ts: number; level: number | null; inflow: number | null; pump: number | null }[]>`
      SELECT extract(epoch FROM ts)::float8 * 1000 AS ts,
             ("values" -> 'nivel' ->> 0)::float8 AS level,
             ("values" -> 'vazao_entrada' ->> 0)::float8 AS inflow,
             ("values" -> 'bomba_ligada' ->> 0)::float8 AS pump
        FROM utility_readings_5m
       WHERE equipment_id = ${tank.id}::uuid
         AND ts >= ${from.toISOString()}::timestamp
         AND ts < ${stop.toISOString()}::timestamp
       ORDER BY ts`,
    db.$queryRaw<{ min: number | null; min_at: Date | null; avg: number | null; below: number | null }[]>`
      SELECT min(("values" -> 'nivel' ->> 1)::float8) AS min,
             (array_agg(ts ORDER BY ("values" -> 'nivel' ->> 1)::float8 ASC))[1] AS min_at,
             avg(("values" -> 'nivel' ->> 0)::float8) AS avg,
             count(*) FILTER (WHERE ${critical?.value ?? null}::float8 IS NOT NULL
                                AND ("values" -> 'nivel' ->> 1)::float8 < ${critical?.value ?? null}::float8)::float8 AS below
        FROM utility_readings_5m
       WHERE equipment_id = ${tank.id}::uuid
         AND ts >= ${start.toISOString()}::timestamp
         AND ts < ${stop.toISOString()}::timestamp
         AND "values" ? 'nivel'`,
  ]);

  const num = (v: number | null) => (v === null || !Number.isFinite(Number(v)) ? null : Number(v));
  const samples: WaterSample[] = rows.map((r) => ({
    ts: Number(r.ts),
    level: num(r.level),
    inflow: num(r.inflow),
    pump: num(r.pump),
  }));
  const all = capacityL ? waterDays(samples, capacityL, timeZone) : [];
  const monthStarts = energyBucketStarts({ start, stop, interval: "1d", timeZone }).map((d) => d.getTime());
  const monthKeys = new Set(monthStarts.map((t) => localKey(t, timeZone)));
  const previousKeys = new Set(
    energyBucketStarts({ start: previousStart, stop: start, interval: "1d", timeZone }).map((d) =>
      localKey(d.getTime(), timeZone),
    ),
  );
  const byKey = new Map(all.map((d) => [d.day, d]));
  const days = monthStarts.map((t) => {
    const d = byKey.get(localKey(t, timeZone));
    if (!d) return { start: t, data: null };
    const leak = leakCheck(all, d.day);
    return { start: t, data: { ...d, start: t, leakSuspect: leak.suspect, baselineLh: leak.baselineLh } };
  });

  // dia com pouca leitura distorce a média: só entram os que têm metade das janelas ou mais
  const perDay = (keys: Set<string>) => {
    const list = all.filter((d) => keys.has(d.day) && d.coverage >= 0.5);
    return list.length ? list.reduce((s, d) => s + d.liters, 0) / list.length : null;
  };
  const inMonth = all.filter((d) => monthKeys.has(d.day));
  const pumpDays = inMonth.filter((d) => d.pumpHours !== null);
  const below = num(level[0]?.below ?? null);

  return {
    id: tank.id,
    name: tank.name,
    tag: tank.tag,
    capacityL,
    marks,
    days,
    totalLiters: inMonth.reduce((s, d) => s + d.liters, 0),
    perDayLiters: perDay(monthKeys),
    previousPerDayLiters: perDay(previousKeys),
    pumpHours: pumpDays.length ? pumpDays.reduce((s, d) => s + (d.pumpHours ?? 0), 0) : null,
    pumpStarts: pumpDays.length ? pumpDays.reduce((s, d) => s + (d.pumpStarts ?? 0), 0) : null,
    level: {
      min: num(level[0]?.min ?? null),
      minAt: level[0]?.min_at ?? null,
      avg: num(level[0]?.avg ?? null),
      // janelas de 5 min abaixo da linha crítica, em horas
      hoursBelowCritical: critical && below !== null ? (below * 5) / 60 : null,
    },
    levelOnly: !samples.some((s) => s.inflow !== null),
  };
}
