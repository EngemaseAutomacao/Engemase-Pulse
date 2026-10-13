import "server-only";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/permissions";
import type { MeterInput } from "@/lib/validation";

export function listMeters(filter: { tenantId?: string; siteId?: string }) {
  return db.meter.findMany({
    where: {
      ...(filter.siteId ? { siteId: filter.siteId } : {}),
      ...(filter.tenantId ? { site: { tenantId: filter.tenantId } } : {}),
    },
    orderBy: [{ site: { tenant: { name: "asc" } } }, { site: { name: "asc" } }, { sortOrder: "asc" }, { tag: "asc" }],
    select: {
      id: true,
      tag: true,
      name: true,
      active: true,
      influxMeasurement: true,
      influxTagKey: true,
      influxTagValue: true,
      site: { select: { id: true, name: true, tenant: { select: { id: true, name: true, slug: true } } } },
    },
  });
}

export function getMeter(id: string) {
  return db.meter.findUnique({
    where: { id },
    include: { site: { select: { id: true, name: true, tenant: { select: { id: true, name: true, slug: true } } } } },
  });
}

export async function createMeter(actor: AuthUser, input: MeterInput) {
  const meter = await db.meter.create({ data: input });
  await audit({ actorId: actor.id, action: "create", entityType: "meter", entityId: meter.id, details: input });
  return meter;
}

export async function updateMeter(actor: AuthUser, id: string, input: MeterInput) {
  const meter = await db.meter.update({ where: { id }, data: input });
  await audit({ actorId: actor.id, action: "update", entityType: "meter", entityId: id, details: input });
  return meter;
}

export async function deleteMeter(actor: AuthUser, id: string) {
  const meter = await db.meter.delete({ where: { id } });
  await audit({ actorId: actor.id, action: "delete", entityType: "meter", entityId: id, details: { tag: meter.tag } });
  return meter;
}
