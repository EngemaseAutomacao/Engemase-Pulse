import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

export type AuditEntry = {
  /** null: feito pelo próprio sistema (ex.: medidor criado pelo Painel local). */
  actorId: string | null;
  action: "create" | "update" | "delete" | "reset-password" | "rotate-agent-token";
  entityType: "tenant" | "site" | "meter" | "user" | "alarm-rule";
  entityId?: string;
  details?: Prisma.InputJsonValue;
};

/** Registra uma alteração administrativa. Falha aqui nunca derruba a operação principal. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({ data: entry });
  } catch (error) {
    console.error("[auditoria] falha ao registrar", entry.action, entry.entityType, error);
  }
}
