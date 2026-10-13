import "server-only";
import { NextResponse } from "next/server";
import type { Role } from "@/generated/prisma/enums";
import { getCurrentUser, getTenantAccess, type TenantContext } from "@/server/auth/dal";

export const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

type ApiAccess = { ok: true; context: TenantContext } | { ok: false; response: NextResponse };

/** Autorização de Route Handlers por cliente: 401 sem sessão, 404 sem acesso. */
export async function authorizeTenantApi(slug: string, minimum: Role = "VIEWER"): Promise<ApiAccess> {
  if (!(await getCurrentUser())) return { ok: false, response: jsonError(401, "Sessão expirada") };
  const context = await getTenantAccess(slug, minimum);
  if (!context) return { ok: false, response: jsonError(404, "Não encontrado") };
  return { ok: true, context };
}
