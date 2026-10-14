import "server-only";
import { forgetAgentToken, generateAgentToken } from "@/server/agent/token";
import { audit } from "@/server/audit";
import { encryptSecret } from "@/server/crypto";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/permissions";
import type { SiteInput } from "@/lib/validation";

export function listSites(tenantId?: string) {
  return db.site.findMany({
    where: tenantId ? { tenantId } : undefined,
    orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      telemetrySource: true,
      influxUrl: true,
      influxBucket: true,
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
      meters: { orderBy: [{ sortOrder: "asc" }, { tag: "asc" }], select: { id: true, tag: true, name: true, active: true } },
    },
  });
  if (!site) return null;
  const { influxTokenEncrypted, agentTokenHash, ...rest } = site;
  return { ...rest, hasInfluxToken: Boolean(influxTokenEncrypted), hasAgentToken: Boolean(agentTokenHash) };
}

export function siteOptions() {
  return db.site.findMany({
    orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, tenant: { select: { id: true, name: true } } },
  });
}

function toData(input: SiteInput) {
  const { influxToken, ...rest } = input;
  return { ...rest, ...(influxToken ? { influxTokenEncrypted: encryptSecret(influxToken) } : {}) };
}

/** Dados da auditoria sem o token. */
function auditDetails(input: SiteInput) {
  const { influxToken, ...rest } = input;
  return { ...rest, influxToken: influxToken ? "(alterado)" : undefined };
}

export async function createSite(actor: AuthUser, input: SiteInput) {
  const site = await db.site.create({ data: toData(input) });
  await audit({ actorId: actor.id, action: "create", entityType: "site", entityId: site.id, details: auditDetails(input) });
  return site;
}

export async function updateSite(actor: AuthUser, id: string, input: SiteInput) {
  const site = await db.site.update({ where: { id }, data: toData(input) });
  await audit({ actorId: actor.id, action: "update", entityType: "site", entityId: id, details: auditDetails(input) });
  return site;
}

/** Novo token do Painel local; devolve o token (a única vez em que ele aparece). */
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
