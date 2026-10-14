/**
 * Cria o primeiro administrador da plataforma.
 *
 *   npm run db:seed                       → cria o administrador (erro se faltar algo)
 *   npm run db:seed -- --if-configured    → idem, mas sem SEED_ADMIN_* (ou com valor
 *                                           inválido) só avisa e sai sem erro: usado no build da
 *                                           Vercel ("vercel-build"), onde não pode impedir o deploy
 *
 * Variáveis: DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/crypto";

const ifConfigured = process.argv.includes("--if-configured");

let db!: PrismaClient;

function required(name: string): string {
  // Aspas coladas junto no valor (ex.: "a@b.com" no painel da Vercel) viram parte dele; tira.
  const value = process.env[name]?.trim().replace(/^(["'])(.*)\1$/, "$2");
  if (!value) throw new Error(`Defina ${name} (no .env ou na linha de comando).`);
  return value;
}

async function seedAdmin() {
  if (ifConfigured && !process.env.SEED_ADMIN_EMAIL?.trim()) {
    console.log("• SEED_ADMIN_EMAIL não definida — criação do administrador ignorada.");
    return;
  }
  const email = required("SEED_ADMIN_EMAIL").toLowerCase();

  // Conta existente nunca é alterada (nem a senha), então depois do primeiro deploy
  // SEED_ADMIN_PASSWORD pode ser apagada da Vercel.
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`• Administrador ${email} já existe — mantido.`);
    return;
  }

  const password = required("SEED_ADMIN_PASSWORD");
  if (password.length < 10) throw new Error("SEED_ADMIN_PASSWORD precisa de pelo menos 10 caracteres");
  await db.user.create({
    data: { email, name: "Administrador", passwordHash: await hashPassword(password), isPlatformAdmin: true },
  });
  console.log(`✔ Administrador criado: ${email}`);
}

async function main() {
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: required("DATABASE_URL") }) });
  await seedAdmin();
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (ifConfigured) {
      // No build da Vercel: o sistema sobe mesmo assim; o aviso fica no log do build.
      console.warn(`⚠ Administrador não criado: ${message}`);
      return;
    }
    console.error("✖", message);
    process.exitCode = 1;
  })
  .finally(() => db?.$disconnect());
