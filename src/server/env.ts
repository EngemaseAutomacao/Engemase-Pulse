import "server-only";
import { z } from "zod";

/**
 * Variáveis de ambiente do servidor, validadas uma única vez.
 * Em desenvolvimento vêm do `.env`; na Vercel, das Environment Variables do projeto.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL não configurada"),
  /** 32 bytes em base64. Cifra os tokens do InfluxDB gravados no banco. */
  APP_SECRET: z
    .string()
    .min(1, "APP_SECRET não configurada")
    .refine((v) => Buffer.from(v, "base64").length === 32, "APP_SECRET deve ter 32 bytes em base64"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  /** Web Push (opcional: sem as chaves, as notificações ficam desativadas). */
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  /** Segredo exigido pela rota do avaliador de alarmes. */
  CRON_SECRET: z.string().min(16, "CRON_SECRET deve ter ao menos 16 caracteres").optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
