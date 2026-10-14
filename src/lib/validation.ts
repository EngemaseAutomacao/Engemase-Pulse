import { z } from "zod";
import { FIELD_KEYS } from "./meter-fields";

/**
 * Esquemas de validação dos formulários. Rodam no servidor (Server Actions);
 * mensagens já em português para aparecer direto na tela.
 */

// ---------------------------------------------------------------------------
// Blocos reutilizáveis
// ---------------------------------------------------------------------------

/** Texto opcional: string vazia vira null. */
const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres`)
    .nullish()
    .transform((v) => v || null);

const requiredText = (label: string, max = 120) =>
  z
    .string({ error: `${label} é obrigatório` })
    .trim()
    .min(1, `${label} é obrigatório`)
    .max(max, `Máximo de ${max} caracteres`);

/** Checkbox de formulário HTML: presente ("on") = true, ausente = false. */
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .nullish()
  .transform((v) => v === "on" || v === "true");

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Cor no formato #RRGGBB")
  .transform((v) => v.toLowerCase());

const email = z
  .string({ error: "Informe o e-mail" })
  .trim()
  .toLowerCase()
  .pipe(z.email("E-mail inválido").max(254));

export const PASSWORD_MIN_LENGTH = 10;

const newPassword = z
  .string({ error: "Informe a senha" })
  .min(PASSWORD_MIN_LENGTH, `A senha precisa de pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(200, "Senha longa demais");

const uuid = z.uuid("Seleção inválida");

export function isValidCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const check = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(digits[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === Number(digits[12]) && check(13) === Number(digits[13]);
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Login e conta
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Informe a senha").max(200),
  /** Caminho interno para onde voltar após o login. */
  next: z
    .string()
    .nullish()
    .transform((v) => (v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : null)),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  });

// ---------------------------------------------------------------------------
// Administração
// ---------------------------------------------------------------------------

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export const tenantSchema = z.object({
  name: requiredText("Nome"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_PATTERN, "Use letras minúsculas, números e hífen (ex.: acme-industria)"),
  document: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .refine((v) => v === null || isValidCnpj(v), "CNPJ inválido"),
  primaryColor: hexColor,
  accentColor: hexColor,
  loginTagline: optionalText(160),
  active: checkbox,
});

export const TELEMETRY_SOURCES = ["INFLUXDB", "SIMULATED", "AGENT"] as const;
export type TelemetrySourceId = (typeof TELEMETRY_SOURCES)[number];

export const siteSchema = z
  .object({
    tenantId: uuid,
    name: requiredText("Nome"),
    address: optionalText(200),
    city: optionalText(100),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .nullish()
      .transform((v) => v || null)
      .refine((v) => v === null || /^[A-Z]{2}$/.test(v), "UF com 2 letras"),
    timezone: z.string().trim().refine(isValidTimeZone, "Fuso horário inválido"),
    telemetrySource: z.enum(TELEMETRY_SOURCES, { error: "Selecione a fonte de dados" }),
    influxUrl: z
      .string()
      .trim()
      .nullish()
      .transform((v) => (v ? v.replace(/\/+$/, "") : null))
      .refine((v) => v === null || /^https?:\/\/[^\s]+$/i.test(v), "URL deve começar com http:// ou https://"),
    influxOrg: optionalText(120),
    influxBucket: optionalText(120),
    /** Bucket com médias horárias, alimentado por uma task do InfluxDB (opcional). */
    influxRollupBucket: optionalText(120),
    /** Vazio na edição = manter o token atual. */
    influxToken: optionalText(500),
  })
  .superRefine((site, ctx) => {
    if (site.telemetrySource !== "INFLUXDB") return;
    for (const key of ["influxUrl", "influxOrg", "influxBucket"] as const) {
      if (!site[key]) ctx.addIssue({ code: "custom", path: [key], message: "Obrigatório para InfluxDB" });
    }
  });

export const meterSchema = z
  .object({
    siteId: uuid,
    tag: requiredText("TAG", 40),
    name: requiredText("Nome"),
    location: optionalText(160),
    manufacturer: optionalText(80),
    model: optionalText(80),
    serialNumber: optionalText(80),
    modbusAddress: z
      .string()
      .trim()
      .nullish()
      .transform((v) => (v ? Number(v) : null))
      .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 247), "Endereço Modbus entre 1 e 247"),
    ctRatio: optionalText(20),
    ptRatio: optionalText(20),
    influxMeasurement: requiredText("Measurement", 200),
    influxTagKey: optionalText(100),
    influxTagValue: optionalText(200),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
    active: checkbox,
  })
  .refine((m) => !m.influxTagKey || m.influxTagValue, {
    message: "Informe o valor da tag",
    path: ["influxTagValue"],
  });

export const ROLES = ["ADMIN", "OPERATOR", "VIEWER"] as const;

const membershipEntry = z.object({ tenantId: uuid, role: z.enum(ROLES) });

export const userSchema = z.object({
  name: requiredText("Nome"),
  email,
  /** Obrigatória na criação; na edição, vazio = não alterar. */
  password: z
    .string()
    .nullish()
    .transform((v) => v || null)
    .pipe(newPassword.nullable()),
  isPlatformAdmin: checkbox,
  active: checkbox,
  memberships: z.array(membershipEntry),
});

/** Extrai os vínculos do formulário: campos `role.<tenantId>` com o papel (vazio = sem acesso). */
export function membershipsFromForm(formData: FormData): { tenantId: string; role: string }[] {
  const entries: { tenantId: string; role: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("role.") && typeof value === "string" && value) {
      entries.push({ tenantId: key.slice("role.".length), role: value });
    }
  }
  return entries;
}

export type TenantInput = z.infer<typeof tenantSchema>;
export type SiteInput = z.infer<typeof siteSchema>;
export type MeterInput = z.infer<typeof meterSchema>;
export type UserInput = z.infer<typeof userSchema>;

// ---------------------------------------------------------------------------
// Alarmes
// ---------------------------------------------------------------------------

export const SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;

export const alarmRuleSchema = z
  .object({
    name: requiredText("Nome", 80),
    kind: z.enum(["THRESHOLD", "OFFLINE"], { error: "Escolha o tipo de regra" }),
    /** Vazio = todos os medidores do cliente. */
    meterId: z
      .string()
      .nullish()
      .transform((v) => v || null)
      .pipe(z.uuid("Medidor inválido").nullable()),
    field: z
      .string()
      .nullish()
      .transform((v) => v || null),
    comparison: z
      .enum(["ABOVE", "BELOW"])
      .nullish()
      .or(z.literal("").transform(() => null))
      .transform((v) => v ?? null),
    threshold: z.coerce.number({ error: "Informe um número" }).refine(Number.isFinite, "Informe um número"),
    severity: z.enum(SEVERITIES),
    enabled: checkbox,
  })
  .superRefine((rule, ctx) => {
    if (rule.kind === "OFFLINE") {
      if (rule.threshold < 1 || rule.threshold > 1440) {
        ctx.addIssue({ code: "custom", path: ["threshold"], message: "Entre 1 e 1440 minutos" });
      }
      return;
    }
    if (!rule.field || !FIELD_KEYS.includes(rule.field)) {
      ctx.addIssue({ code: "custom", path: ["field"], message: "Escolha a grandeza" });
    }
    if (!rule.comparison) ctx.addIssue({ code: "custom", path: ["comparison"], message: "Escolha acima ou abaixo" });
  })
  .transform((rule) =>
    rule.kind === "OFFLINE" ? { ...rule, field: null, comparison: null } : rule,
  );

export type AlarmRuleInput = z.infer<typeof alarmRuleSchema>;

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
