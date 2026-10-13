import type { Role } from "@/generated/prisma/enums";

/**
 * Regras de autorização puras (sem I/O), fáceis de testar.
 *
 * Papéis por cliente:
 *  - VIEWER:   consulta painéis e medidores;
 *  - OPERATOR: idem + exporta dados;
 *  - ADMIN:    idem + gerencia usuários do próprio cliente (próxima etapa).
 * Administradores da plataforma têm papel ADMIN em todos os clientes.
 */

export type Membership = { tenantId: string; tenantSlug: string; tenantName: string; role: Role };

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  memberships: Membership[];
};

const ROLE_RANK: Record<Role, number> = { VIEWER: 1, OPERATOR: 2, ADMIN: 3 };

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  OPERATOR: "Operador",
  VIEWER: "Visualizador",
};

export function roleInTenant(user: AuthUser, tenantId: string): Role | null {
  if (user.isPlatformAdmin) return "ADMIN";
  return user.memberships.find((m) => m.tenantId === tenantId)?.role ?? null;
}

export function hasTenantRole(user: AuthUser, tenantId: string, minimum: Role = "VIEWER"): boolean {
  const role = roleInTenant(user, tenantId);
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** Para onde mandar o usuário depois do login. */
export function homePathFor(user: AuthUser): string {
  if (user.isPlatformAdmin) return "/admin";
  if (user.memberships.length === 1) return `/app/${user.memberships[0].tenantSlug}`;
  return "/app";
}
