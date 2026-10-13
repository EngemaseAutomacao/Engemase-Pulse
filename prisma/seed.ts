/**
 * Cria o primeiro administrador da plataforma e, com --demo, um cliente de
 * demonstração com unidades simuladas (não precisa de gateway nem InfluxDB).
 *
 *   npm run db:seed              → só o administrador
 *   npm run db:seed -- --demo    → administrador + cliente de demonstração
 *
 * Variáveis: DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (e DEMO_USER_PASSWORD para --demo).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/crypto";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: required("DATABASE_URL") }) });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`✖ Defina ${name} (no .env ou na linha de comando).`);
    process.exit(1);
  }
  return value;
}

async function seedAdmin() {
  const email = required("SEED_ADMIN_EMAIL").toLowerCase();
  const password = required("SEED_ADMIN_PASSWORD");
  if (password.length < 10) throw new Error("SEED_ADMIN_PASSWORD precisa de pelo menos 10 caracteres");

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`• Administrador ${email} já existe — mantido.`);
    return;
  }
  await db.user.create({
    data: { email, name: "Administrador", passwordHash: await hashPassword(password), isPlatformAdmin: true },
  });
  console.log(`✔ Administrador criado: ${email}`);
}

const DEMO_SITES = [
  {
    name: "Fábrica Campinas",
    city: "Campinas",
    state: "SP",
    meters: [
      { tag: "MM-01", name: "Entrada geral (QGBT)", location: "Subestação principal" },
      { tag: "MM-02", name: "Compressores", location: "Casa de máquinas" },
      { tag: "MM-03", name: "Linha de produção 1", location: "Galpão A" },
      { tag: "MM-04", name: "Iluminação e tomadas", location: "Administrativo" },
    ],
  },
  {
    name: "Centro de Distribuição",
    city: "Jundiaí",
    state: "SP",
    meters: [
      { tag: "MM-01", name: "Entrada geral", location: "Cabine primária" },
      { tag: "MM-02", name: "Câmaras frias", location: "Doca 3" },
    ],
  },
];

async function seedDemo() {
  const slug = "demo";
  const existing = await db.tenant.findUnique({ where: { slug } });
  if (existing) {
    console.log("• Cliente de demonstração já existe — mantido.");
    return;
  }

  const tenant = await db.tenant.create({
    data: {
      slug,
      name: "Cliente Demonstração",
      loginTagline: "Painel de demonstração com dados simulados.",
      sites: {
        create: DEMO_SITES.map((site, siteIndex) => ({
          name: site.name,
          city: site.city,
          state: site.state,
          telemetrySource: "SIMULATED",
          meters: {
            create: site.meters.map((meter, i) => ({
              ...meter,
              influxMeasurement: `medidor_${siteIndex + 1}_${String(i + 1).padStart(2, "0")}`,
              manufacturer: "Schneider Electric",
              model: "PM5560",
              modbusAddress: i + 1,
              ctRatio: i === 0 ? "1000/5" : "200/5",
              sortOrder: i,
            })),
          },
        })),
      },
    },
  });
  console.log(`✔ Cliente de demonstração criado: /app/${tenant.slug} (login em /login/${tenant.slug})`);

  const demoPassword = process.env.DEMO_USER_PASSWORD?.trim();
  if (demoPassword && demoPassword.length >= 10) {
    await db.user.create({
      data: {
        email: "demo@cliente.com.br",
        name: "Usuário Demonstração",
        passwordHash: await hashPassword(demoPassword),
        memberships: { create: { tenantId: tenant.id, role: "OPERATOR" } },
      },
    });
    console.log("✔ Usuário de demonstração criado: demo@cliente.com.br (senha de DEMO_USER_PASSWORD)");
  }
}

async function main() {
  await seedAdmin();
  if (process.argv.includes("--demo")) await seedDemo();
}

main()
  .catch((error) => {
    console.error("✖", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
