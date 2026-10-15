import "server-only";
import { randomBytes } from "node:crypto";
import type { Role } from "@/generated/prisma/enums";
import type { InviteMemberInput } from "@/lib/validation";
import { audit } from "@/server/audit";
import { createPasswordLink, deliverPasswordLink } from "@/server/auth/password-token";
import type { AuthUser } from "@/server/auth/permissions";
import { deleteUserSessions } from "@/server/auth/session";
import { hashPassword } from "@/server/crypto";
import { db } from "@/server/db";

/**
 * Usuários de um cliente, geridos pelo administrador do próprio cliente.
 * Ele só mexe nos vínculos com o cliente dele — nunca em nome, e-mail, senha
 * ou acesso a outros clientes. Regras:
 *  - ninguém altera nem remove o próprio acesso;
 *  - o cliente nunca fica sem administrador;
 *  - link de senha só para quem tem acesso apenas a este cliente (senão o
 *    administrador de uma empresa poderia tomar a conta de alguém que também
 *    acessa outra).
 */

export class MemberRuleError extends Error {}

type Tenant = { id: string; name: string; primaryColor?: string };

export function listTenantMembers(tenantId: string) {
  return db.membership.findMany({
    where: { tenantId },
    orderBy: { user: { name: "asc" } },
    select: {
      role: true,
      createdAt: true,
      alarmEmail: true,
      monthlyReport: true,
      escalation: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          isPlatformAdmin: true,
          lastLoginAt: true,
          telegramChatId: true,
          _count: { select: { memberships: true } },
        },
      },
    },
  });
}

export type LinkDelivery = { emailed: boolean; url: string | null };

export async function inviteMember(
  actor: AuthUser,
  tenant: Tenant,
  input: InviteMemberInput,
): Promise<{ existing: boolean; delivery: LinkDelivery | null }> {
  const existing = await db.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      active: true,
      isPlatformAdmin: true,
      memberships: { where: { tenantId: tenant.id }, select: { role: true } },
    },
  });

  if (existing) {
    if (existing.isPlatformAdmin) throw new MemberRuleError("Esta pessoa é da equipe Engemase e já tem acesso.");
    if (!existing.active) throw new MemberRuleError("Este usuário está desativado. Fale com a Engemase.");
    if (existing.memberships.length > 0) throw new MemberRuleError("Esta pessoa já tem acesso a este cliente.");
    await db.membership.create({
      data: { userId: existing.id, tenantId: tenant.id, role: input.role as Role, monthlyReport: input.role === "ADMIN" },
    });
    await audit({
      actorId: actor.id,
      action: "create",
      entityType: "membership",
      entityId: existing.id,
      details: { tenantId: tenant.id, role: input.role, email: input.email },
    });
    // Já tem senha (acessa outro cliente): só ganha o acesso novo.
    return { existing: true, delivery: null };
  }

  const user = await db.user.create({
    data: {
      name: input.name,
      email: input.email,
      // Senha impossível de adivinhar; a pessoa define a dela pelo link do convite.
      passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
      // Administrador do cliente já sai recebendo o resumo do mês (dá para desligar em Minha conta).
      memberships: { create: { tenantId: tenant.id, role: input.role as Role, monthlyReport: input.role === "ADMIN" } },
    },
  });
  await audit({
    actorId: actor.id,
    action: "create",
    entityType: "user",
    entityId: user.id,
    details: { name: input.name, email: input.email, tenantId: tenant.id, role: input.role, invited: true },
  });
  const path = await createPasswordLink(user.id, "invite");
  return { existing: false, delivery: await deliverPasswordLink(user, path, "invite", { tenantName: tenant.name, color: tenant.primaryColor }) };
}

async function assertCanChange(actor: AuthUser, tenantId: string, userId: string, losingAdmin: boolean) {
  if (actor.id === userId) throw new MemberRuleError("Você não pode alterar o seu próprio acesso.");
  const member = await db.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true },
  });
  if (!member) throw new MemberRuleError("Esta pessoa não tem mais acesso a este cliente.");
  if (losingAdmin && member.role === "ADMIN") {
    const admins = await db.membership.count({ where: { tenantId, role: "ADMIN", user: { active: true } } });
    if (admins <= 1) throw new MemberRuleError("O cliente precisa de pelo menos um administrador.");
  }
  return member;
}

export async function changeMemberRole(actor: AuthUser, tenantId: string, userId: string, role: Role) {
  await assertCanChange(actor, tenantId, userId, role !== "ADMIN");
  await db.membership.update({ where: { userId_tenantId: { userId, tenantId } }, data: { role } });
  await audit({
    actorId: actor.id,
    action: "update",
    entityType: "membership",
    entityId: userId,
    details: { tenantId, role },
  });
}

export async function removeMember(actor: AuthUser, tenantId: string, userId: string) {
  await assertCanChange(actor, tenantId, userId, true);
  await db.membership.delete({ where: { userId_tenantId: { userId, tenantId } } });
  // Sem nenhum outro cliente, a sessão aberta não serve para mais nada: encerra.
  const remaining = await db.membership.count({ where: { userId } });
  if (remaining === 0) await deleteUserSessions(userId);
  await audit({
    actorId: actor.id,
    action: "delete",
    entityType: "membership",
    entityId: userId,
    details: { tenantId },
  });
}

/** Novo link de acesso (primeiro acesso ou senha esquecida) para quem só acessa este cliente. */
export async function newAccessLink(actor: AuthUser, tenant: Tenant, userId: string): Promise<LinkDelivery> {
  if (actor.id === userId) throw new MemberRuleError("Para a sua senha, use “Minha conta”.");
  const user = await db.user.findFirst({
    where: { id: userId, memberships: { some: { tenantId: tenant.id } } },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      isPlatformAdmin: true,
      lastLoginAt: true,
      _count: { select: { memberships: true } },
    },
  });
  if (!user) throw new MemberRuleError("Esta pessoa não tem mais acesso a este cliente.");
  if (!user.active) throw new MemberRuleError("Este usuário está desativado. Fale com a Engemase.");
  if (user.isPlatformAdmin || user._count.memberships > 1) {
    throw new MemberRuleError("Esta pessoa também acessa outros clientes: peça o link à Engemase.");
  }
  const purpose = user.lastLoginAt ? "reset" : "invite";
  const path = await createPasswordLink(user.id, purpose);
  await audit({
    actorId: actor.id,
    action: "reset-password",
    entityType: "user",
    entityId: user.id,
    details: { email: user.email, link: purpose },
  });
  return deliverPasswordLink(user, path, purpose, { tenantName: tenant.name, color: tenant.primaryColor });
}
