import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations precisam de conexão direta (sem o pool do Neon). A integração
    // Neon da Vercel cria DATABASE_URL_UNPOOLED; localmente cai na DATABASE_URL.
    // O app em si usa DATABASE_URL (com pool) — ver src/server/db.ts.
    url: process.env["DATABASE_URL_UNPOOLED"] ?? process.env["DATABASE_URL"],
    // Só no desenvolvimento local com `prisma dev`, que expõe um banco "sombra"
    // separado para o `migrate dev` comparar o schema.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
