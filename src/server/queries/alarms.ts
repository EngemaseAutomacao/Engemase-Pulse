import "server-only";
import { db } from "@/server/db";

export function countActiveAlarms(tenantId: string) {
  return db.alarm.count({ where: { tenantId, clearedAt: null } });
}

const alarmSelect = {
  id: true,
  severity: true,
  title: true,
  message: true,
  value: true,
  startedAt: true,
  clearedAt: true,
  acknowledgedAt: true,
  acknowledgedBy: { select: { name: true } },
  meter: { select: { id: true, tag: true, name: true } },
} as const;

export function listActiveAlarms(tenantId: string, take = 100) {
  return db.alarm.findMany({
    where: { tenantId, clearedAt: null },
    orderBy: [{ severity: "desc" }, { startedAt: "desc" }],
    take,
    select: alarmSelect,
  });
}

export function listAlarmHistory(tenantId: string, take = 50) {
  return db.alarm.findMany({
    where: { tenantId, clearedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    take,
    select: alarmSelect,
  });
}

export type AlarmRow = Awaited<ReturnType<typeof listActiveAlarms>>[number];

export function listAlarmRules(tenantId: string) {
  return db.alarmRule.findMany({
    where: { tenantId },
    orderBy: [{ enabled: "desc" }, { name: "asc" }],
    include: {
      meter: { select: { tag: true, name: true } },
      _count: { select: { alarms: { where: { clearedAt: null } } } },
    },
  });
}

export function getAlarmRule(tenantId: string, ruleId: string) {
  return db.alarmRule.findFirst({ where: { id: ruleId, tenantId } });
}
