"use server";

import { revalidatePath } from "next/cache";
import { requireAdminForAction } from "@/server/admin/guard";
import { db } from "@/server/db";

/** Limpa a lista de erros (depois de resolvidos). */
export async function clearErrors(): Promise<void> {
  await requireAdminForAction();
  await db.errorLog.deleteMany({});
  revalidatePath("/admin/saude");
}
