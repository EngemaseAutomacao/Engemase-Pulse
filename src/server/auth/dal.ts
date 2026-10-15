import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import type { Role } from "@/generated/prisma/enums";
import { readSessionUserId } from "./session";
import { hasTenantRole, roleInTenant, type AuthUser } from "./permissions";

/**
 * Data Access Layer de autenticação. Toda página, Server Action e Route Handler
 * passa por aqui — a verificação fica perto dos dados, não só no layout.
 */

/** Usuário logado (memoizado por requisição) ou null. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const userId = await readSessionUserId();
  return userId ? loadAuthUser(userId) : null;
});

/** Usuário ativo com seus vínculos a clientes ativos, ou null. */
export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      active: true,
      isPlatformAdmin: true,
      memberships: {
        where: { tenant: { active: true } },
        select: { role: true, tenant: { select: { id: true, slug: true, name: true } } },
        orderBy: { tenant: { name: "asc" } },
      },
    },
  });
  if (!user || !user.active) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isPlatformAdmin: user.isPlatformAdmin,
    memberships: user.memberships.map((m) => ({
      tenantId: m.tenant.id,
      tenantSlug: m.tenant.slug,
      tenantName: m.tenant.name,
      role: m.role,
    })),
  };
}

/** Exige login; sem sessão redireciona para /login. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Exige administrador da plataforma. Para os demais, a área "não existe". */
export async function requirePlatformAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.isPlatformAdmin) notFound();
  return user;
}

export type TenantContext = {
  user: AuthUser;
  role: Role;
  tenant: {
    id: string;
    slug: string;
    name: string;
    primaryColor: string;
    accentColor: string;
    hasLogo: boolean;
    logoVersion: number | null;
    /** Módulos desligados pela administração ("agua", "gerador"). */
    modulesOff: string[];
  };
};

/**
 * Carrega o cliente pelo slug e confirma o acesso do usuário.
 * Cliente inexistente, inativo ou sem vínculo → 404 (não revela que existe).
 */
export const requireTenant = cache(async (slug: string, minimum: Role = "VIEWER"): Promise<TenantContext> => {
  const user = await requireUser();
  const context = await findTenantAccess(user, slug, minimum);
  if (!context) notFound();
  return context;
});

/** Versão sem redirecionamento, para Route Handlers (que respondem 401/404 em JSON). */
export async function getTenantAccess(slug: string, minimum: Role = "VIEWER"): Promise<TenantContext | null> {
  const user = await getCurrentUser();
  return user ? findTenantAccess(user, slug, minimum) : null;
}

async function findTenantAccess(user: AuthUser, slug: string, minimum: Role): Promise<TenantContext | null> {
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      active: true,
      primaryColor: true,
      accentColor: true,
      modulesOff: true,
      logo: { select: { updatedAt: true } },
    },
  });
  if (!tenant || (!tenant.active && !user.isPlatformAdmin)) return null;
  if (!hasTenantRole(user, tenant.id, minimum)) return null;

  return {
    user,
    role: roleInTenant(user, tenant.id)!,
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      primaryColor: tenant.primaryColor,
      accentColor: tenant.accentColor,
      hasLogo: tenant.logo !== null,
      logoVersion: tenant.logo?.updatedAt.getTime() ?? null,
      modulesOff: tenant.modulesOff,
    },
  };
}
