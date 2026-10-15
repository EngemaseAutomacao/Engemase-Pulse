import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

/**
 * O pg já trata sslmode=require (o que a Neon entrega) como verify-full, mas avisa
 * disso a cada instância nova, poluindo os logs. Deixa explícito: mesmo comportamento.
 */
export function withExplicitSslMode(url: string): string {
  return url.replace(/([?&]sslmode=)(?:prefer|require|verify-ca)(?=&|$)/, "$1verify-full");
}

function createClient() {
  const adapter = new PrismaPg({ connectionString: withExplicitSslMode(env().DATABASE_URL) });
  return new PrismaClient({ adapter });
}

// Em desenvolvimento o hot reload recria os módulos; reaproveitamos o client
// para não abrir um pool de conexões novo a cada edição.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
