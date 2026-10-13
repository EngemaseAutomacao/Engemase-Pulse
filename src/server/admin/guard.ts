import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/server/auth/dal";
import type { AuthUser } from "@/server/auth/permissions";

export class ForbiddenError extends Error {
  constructor() {
    super("Acesso restrito à equipe da plataforma");
    this.name = "ForbiddenError";
  }
}

/** Server Actions de administração: reconfere a sessão a cada chamada. */
export async function requireAdminForAction(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user?.isPlatformAdmin) throw new ForbiddenError();
  return user;
}

/** Violação de unicidade (P2002), opcionalmente num campo específico. */
export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  if (!field) return true;
  const target = JSON.stringify(error.meta ?? {});
  return target.includes(field);
}

/** Registro não encontrado (P2025) — ex.: apagado em outra aba. */
export function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
