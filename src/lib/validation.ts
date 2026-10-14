import { z } from "zod";
import { FIELD_KEYS } from "./meter-fields";
import { TARIFF_MODALITIES, type TariffModality } from "./tariff";

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

const email = z.string({ error: "Informe o e-mail" }).trim().toLowerCase().pipe(z.email("E-mail inválido").max(254));

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

export const forgotPasswordSchema = z.object({ email });

/** Nova senha pelo link de uso único (esqueci a senha ou convite). */
export const resetPasswordSchema = z
  .object({
    token: z.string().min(10).max(200),
    newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
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

export const siteSchema = z.object({
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
});

/** Edição de um medidor (eles são criados pelo Painel local; a unidade não muda). */
export const meterSchema = z.object({
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
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  active: checkbox,
});

/**
 * Número digitado em português ("0,85", "1.234,56") ou com ponto ("0.85").
 * Vazio vira null.
 */
export function parseDecimal(value: unknown, thousandsDot = false): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const text = value.trim().replace(/\s/g, "");
  // Em campos de kW, "1.200" é milhar (ninguém contrata 1,2 kW).
  const dotIsThousands = text.includes(",") || (thousandsDot && /^\d{1,3}(\.\d{3})+$/.test(text));
  const normalized = dotIsThousands ? text.replace(/\./g, "").replace(",", ".") : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : Number.NaN;
}

const decimal = (max: number, thousandsDot = false) =>
  z
    .unknown()
    .transform((v) => parseDecimal(v, thousandsDot))
    .refine((v) => v === null || !Number.isNaN(v), "Número inválido")
    .refine((v) => v === null || (v >= 0 && v <= max), `Entre 0 e ${max.toLocaleString("pt-BR")}`);

const hour = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

/** Tarifa da unidade: os campos exigidos dependem da modalidade. */
export const tariffSchema = z
  .object({
    modality: z.enum(TARIFF_MODALITIES, { error: "Escolha a modalidade" }),
    energyOffPeak: decimal(100),
    energyPeak: decimal(100),
    energyIntermediate: decimal(100),
    flagAdder: decimal(10),
    demandPrice: decimal(10_000),
    demandPeakPrice: decimal(10_000),
    contractedDemand: decimal(1_000_000, true),
    contractedDemandPeak: decimal(1_000_000, true),
    peakStartHour: hour(0, 23),
    peakEndHour: hour(1, 24),
    taxRate: decimal(60),
  })
  .superRefine((t, ctx) => {
    const need = (field: keyof typeof t, message = "Obrigatório nesta modalidade") => {
      if (t[field] === null || t[field] === 0) ctx.addIssue({ code: "custom", path: [field], message });
    };
    need("energyOffPeak", t.modality === "CONVENTIONAL" ? "Informe o preço do kWh" : "Informe o kWh fora ponta");
    if (t.modality !== "CONVENTIONAL") need("energyPeak");
    if (t.modality === "WHITE") need("energyIntermediate");
    if (t.modality === "GREEN" || t.modality === "BLUE") {
      need("demandPrice");
      need("contractedDemand");
    }
    if (t.modality === "BLUE") {
      need("demandPeakPrice");
      need("contractedDemandPeak");
    }
    if (t.peakEndHour <= t.peakStartHour) {
      ctx.addIssue({ code: "custom", path: ["peakEndHour"], message: "O fim da ponta deve ser depois do início" });
    }
  })
  .transform((t) => {
    const only = <T>(value: T, ...modalities: TariffModality[]) => (modalities.includes(t.modality) ? value : null);
    return {
      modality: t.modality,
      energyOffPeak: t.energyOffPeak!,
      energyPeak: only(t.energyPeak, "WHITE", "GREEN", "BLUE"),
      energyIntermediate: only(t.energyIntermediate, "WHITE"),
      flagAdder: t.flagAdder ?? 0,
      demandPrice: only(t.demandPrice, "GREEN", "BLUE"),
      demandPeakPrice: only(t.demandPeakPrice, "BLUE"),
      contractedDemand: only(t.contractedDemand, "GREEN", "BLUE"),
      contractedDemandPeak: only(t.contractedDemandPeak, "BLUE"),
      peakStartHour: t.peakStartHour,
      peakEndHour: t.peakEndHour,
      taxRate: t.taxRate ?? 0,
    };
  });

export type TariffInput = z.infer<typeof tariffSchema>;

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

/** Convite de usuário pelo administrador do cliente. */
export const inviteMemberSchema = z.object({
  name: requiredText("Nome"),
  email,
  role: z.enum(ROLES, { error: "Escolha o papel" }),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

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
  .transform((rule) => (rule.kind === "OFFLINE" ? { ...rule, field: null, comparison: null } : rule));

export type AlarmRuleInput = z.infer<typeof alarmRuleSchema>;

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
