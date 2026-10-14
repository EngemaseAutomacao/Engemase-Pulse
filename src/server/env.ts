import "server-only";
import { z } from "zod";

/**
 * Variáveis de ambiente do servidor, validadas uma única vez.
 * Em desenvolvimento vêm do `.env`; na Vercel, das Environment Variables do projeto.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL não configurada"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  /** Web Push (opcional: sem as chaves, as notificações ficam desativadas). */
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  /** Segredo exigido pela rota do avaliador de alarmes. */
  CRON_SECRET: z.string().min(16, "CRON_SECRET deve ter ao menos 16 caracteres").optional(),
  /**
   * Endereço público do sistema, para links enviados por e-mail. Na Vercel, sem
   * isso usa o domínio de produção do projeto. Nunca vem do cabeçalho Host
   * (dá para forjar e mandar o link de senha para outro site).
   */
  APP_URL: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional()),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  /** E-mail pelo Resend (opcional: sem isso, links de senha são entregues pela tela). */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
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
