import "server-only";
import { forgetAgentToken, generateAgentToken } from "@/server/agent/token";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/permissions";
import type { SiteInput, TariffInput } from "@/lib/validation";

export function listSites(tenantId?: string) {
  return db.site.findMany({
    where: tenantId ? { tenantId } : undefined,
    orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      agentLastSeenAt: true,
      agentTokenHash: true,
      tenant: { select: { id: true, name: true } },
      _count: { select: { meters: true } },
    },
  });
}

/** Unidade para edição. Os tokens nunca saem daqui: só a informação de que existem. */
export async function getSiteForEdit(id: string) {
  const site = await db.site.findUnique({
    where: { id },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      meters: {
        orderBy: [{ sortOrder: "asc" }, { tag: "asc" }],
        select: { id: true, tag: true, name: true, active: true },
      },
      utilities: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, kind: true, tag: true, name: true, profile: true, settings: true },
      },
    },
  });
  if (!site) return null;
  const { agentTokenHash, ...rest } = site;
  return { ...rest, hasAgentToken: Boolean(agentTokenHash) };
}

export function siteOptions() {
  return db.site.findMany({
    orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, tenant: { select: { id: true, name: true } } },
  });
}

export async function createSite(actor: AuthUser, input: SiteInput) {
  const site = await db.site.create({ data: input });
  await audit({ actorId: actor.id, action: "create", entityType: "site", entityId: site.id, details: input });
  return site;
}

export async function updateSite(actor: AuthUser, id: string, input: SiteInput) {
  const site = await db.site.update({ where: { id }, data: input });
  await audit({ actorId: actor.id, action: "update", entityType: "site", entityId: id, details: input });
  return site;
}

/** Novo token do gateway; devolve o token (a única vez em que ele aparece). */
export async function rotateSiteAgentToken(actor: AuthUser, id: string): Promise<string> {
  const { token, hash } = generateAgentToken();
  const previous = await db.site.findUniqueOrThrow({ where: { id }, select: { agentTokenHash: true } });
  await db.site.update({ where: { id }, data: { agentTokenHash: hash } });
  await forgetAgentToken(previous.agentTokenHash);
  await audit({
    actorId: actor.id,
    action: "rotate-agent-token",
    entityType: "site",
    entityId: id,
    details: { substituiuAnterior: Boolean(previous.agentTokenHash) },
  });
  return token;
}

export async function deleteSite(actor: AuthUser, id: string) {
  const site = await db.site.delete({ where: { id } });
  await audit({ actorId: actor.id, action: "delete", entityType: "site", entityId: id, details: { name: site.name } });
  return site;
}

// ---------------------------------------------------------------------------
// Tarifa
// ---------------------------------------------------------------------------

export function getSiteTariff(siteId: string) {
  return db.siteTariff.findUnique({ where: { siteId } });
}

export async function setSiteTariff(actor: AuthUser, siteId: string, input: TariffInput) {
  await db.siteTariff.upsert({ where: { siteId }, create: { siteId, ...input }, update: input });
  await audit({
    actorId: actor.id,
    action: "update",
    entityType: "site",
    entityId: siteId,
    details: { tariff: input },
  });
}

export async function removeSiteTariff(actor: AuthUser, siteId: string) {
  await db.siteTariff.deleteMany({ where: { siteId } });
  await audit({ actorId: actor.id, action: "update", entityType: "site", entityId: siteId, details: { tariff: null } });
}
