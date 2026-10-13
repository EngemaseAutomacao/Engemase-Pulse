import type { z } from "zod";

/**
 * Resultado padrão das Server Actions de formulário (usado com useActionState).
 * `values` devolve o que foi digitado, para o formulário não "esquecer" os
 * campos quando a validação falha (o React limpa o form após a action).
 */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export const IDLE: ActionState = { status: "idle" };

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$") && !/password|token/i.test(key)) values[key] = value;
  }
  return values;
}

export function validationError(error: z.ZodError, formData: FormData): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    fieldErrors[key] ??= issue.message;
  }
  return { status: "error", message: "Revise os campos destacados.", fieldErrors, values: formValues(formData) };
}

export function errorState(message: string, formData?: FormData): ActionState {
  return { status: "error", message, values: formData ? formValues(formData) : undefined };
}
