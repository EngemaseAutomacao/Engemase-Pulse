import "server-only";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/permissions";
import type { TenantInput } from "@/lib/validation";

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function listTenants() {
  return db.tenant.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      document: true,
      active: true,
      primaryColor: true,
      _count: { select: { sites: true, memberships: true } },
      sites: { select: { _count: { select: { meters: true } } } },
    },
  });
}

export function getTenant(id: string) {
  return db.tenant.findUnique({
    where: { id },
    include: {
      logo: { select: { updatedAt: true } },
      loginBackground: { select: { updatedAt: true } },
      sites: { orderBy: { name: "asc" }, include: { _count: { select: { meters: true } } } },
      memberships: { include: { user: { select: { id: true, name: true, email: true, active: true } } } },
    },
  });
}

export function tenantOptions() {
  return db.tenant.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, active: true } });
}

// ---------------------------------------------------------------------------
// Alterações
// ---------------------------------------------------------------------------

export async function createTenant(actor: AuthUser, input: TenantInput) {
  const tenant = await db.tenant.create({ data: input });
  await audit({ actorId: actor.id, action: "create", entityType: "tenant", entityId: tenant.id, details: input });
  return tenant;
}

/** Atualiza e devolve o slug anterior (para invalidar o cache da marca). */
export async function updateTenant(actor: AuthUser, id: string, input: TenantInput) {
  const previous = await db.tenant.findUniqueOrThrow({ where: { id }, select: { slug: true } });
  const tenant = await db.tenant.update({ where: { id }, data: input });
  await audit({ actorId: actor.id, action: "update", entityType: "tenant", entityId: id, details: input });
  return { tenant, previousSlug: previous.slug };
}

export async function deleteTenant(actor: AuthUser, id: string) {
  const tenant = await db.tenant.delete({ where: { id } });
  await audit({ actorId: actor.id, action: "delete", entityType: "tenant", entityId: id, details: { name: tenant.name } });
  return tenant;
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

export const LOGO_MAX_BYTES = 512 * 1024;

/** Confere a assinatura do arquivo — não confia na extensão nem no Content-Type do navegador. */
export function detectImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function setTenantLogo(actor: AuthUser, tenantId: string, bytes: Uint8Array<ArrayBuffer>, mimeType: string) {
  await db.tenantLogo.upsert({
    where: { tenantId },
    create: { tenantId, data: bytes, mimeType },
    update: { data: bytes, mimeType },
  });
  await audit({ actorId: actor.id, action: "update", entityType: "tenant", entityId: tenantId, details: { logo: mimeType } });
}

export async function removeTenantLogo(actor: AuthUser, tenantId: string) {
  await db.tenantLogo.deleteMany({ where: { tenantId } });
  await audit({ actorId: actor.id, action: "update", entityType: "tenant", entityId: tenantId, details: { logo: null } });
}

// ---------------------------------------------------------------------------
// Imagem de fundo do login
// ---------------------------------------------------------------------------

/** O navegador já reduz a foto antes de enviar (ver LoginBackgroundForm); isto é o teto. */
export const LOGIN_BACKGROUND_MAX_BYTES = 1536 * 1024;

export async function setTenantLoginBackground(
  actor: AuthUser,
  tenantId: string,
  bytes: Uint8Array<ArrayBuffer>,
  mimeType: string,
) {
  await db.tenantLoginBackground.upsert({
    where: { tenantId },
    create: { tenantId, data: bytes, mimeType },
    update: { data: bytes, mimeType },
  });
  await audit({
    actorId: actor.id,
    action: "update",
    entityType: "tenant",
    entityId: tenantId,
    details: { loginBackground: mimeType },
  });
}

export async function removeTenantLoginBackground(actor: AuthUser, tenantId: string) {
  await db.tenantLoginBackground.deleteMany({ where: { tenantId } });
  await audit({
    actorId: actor.id,
    action: "update",
    entityType: "tenant",
    entityId: tenantId,
    details: { loginBackground: null },
  });
}
