import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { audit } from "@/server/audit";
import { hashPassword } from "@/server/crypto";
import { db } from "@/server/db";
import type { AuthUser } from "@/server/auth/permissions";
import type { UserInput } from "@/lib/validation";

export function listUsers(tenantId?: string) {
  return db.user.findMany({
    where: tenantId ? { memberships: { some: { tenantId } } } : undefined,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      isPlatformAdmin: true,
      lastLoginAt: true,
      memberships: { select: { role: true, tenant: { select: { id: true, name: true } } } },
    },
  });
}

export function getUser(id: string) {
  return db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      isPlatformAdmin: true,
      lastLoginAt: true,
      createdAt: true,
      memberships: { select: { tenantId: true, role: true } },
    },
  });
}

export class UserRuleError extends Error {}

export async function createUser(actor: AuthUser, input: UserInput) {
  if (!input.password) throw new UserRuleError("Defina uma senha inicial");
  const user = await db.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      isPlatformAdmin: input.isPlatformAdmin,
      active: input.active,
      memberships: { create: input.memberships.map((m) => ({ tenantId: m.tenantId, role: m.role as Role })) },
    },
  });
  await audit({ actorId: actor.id, action: "create", entityType: "user", entityId: user.id, details: summary(input) });
  return user;
}

/**
 * Atualiza dados e vínculos. Troca de senha ou desativação derrubam as sessões
 * do usuário. Ninguém tira o próprio acesso de administrador nem se desativa.
 */
export async function updateUser(actor: AuthUser, id: string, input: UserInput) {
  if (id === actor.id && (!input.isPlatformAdmin || !input.active)) {
    throw new UserRuleError("Você não pode remover o próprio acesso de administrador nem se desativar");
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        name: input.name,
        email: input.email,
        isPlatformAdmin: input.isPlatformAdmin,
        active: input.active,
        ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      },
    });
    await tx.membership.deleteMany({ where: { userId: id } });
    if (input.memberships.length > 0) {
      await tx.membership.createMany({
        data: input.memberships.map((m) => ({ userId: id, tenantId: m.tenantId, role: m.role as Role })),
      });
    }
    if (input.password || !input.active) await tx.session.deleteMany({ where: { userId: id } });
  });

  await audit({
    actorId: actor.id,
    action: input.password ? "reset-password" : "update",
    entityType: "user",
    entityId: id,
    details: summary(input),
  });
}

export async function deleteUser(actor: AuthUser, id: string) {
  if (id === actor.id) throw new UserRuleError("Você não pode excluir o próprio usuário");
  const user = await db.user.delete({ where: { id } });
  await audit({ actorId: actor.id, action: "delete", entityType: "user", entityId: id, details: { email: user.email } });
}

/** O que vai para a auditoria (sem senha). */
function summary(input: UserInput) {
  return {
    name: input.name,
    email: input.email,
    isPlatformAdmin: input.isPlatformAdmin,
    active: input.active,
    memberships: input.memberships,
    passwordChanged: Boolean(input.password),
  };
}
