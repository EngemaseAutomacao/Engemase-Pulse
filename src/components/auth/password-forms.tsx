"use client";

import Link from "next/link";
import { useActionState } from "react";
import { KeyRoundIcon, MailIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/forms/field";
import { IDLE } from "@/lib/action-state";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";
import { requestPasswordReset, resetPassword } from "@/app/login/actions";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, IDLE);
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <Field label="E-mail" htmlFor="email" error={state.fieldErrors?.email}>
        <Input {...fieldProps(state, "email")} type="email" autoComplete="username" required autoFocus />
      </Field>
      <FormMessage state={state} />
      {state.status !== "success" && (
        <SubmitButton size="lg" className="mt-1 h-10" pendingText="Enviando…">
          <MailIcon />
          Enviar link
        </SubmitButton>
      )}
      <Link
        href="/login"
        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Voltar para o login
      </Link>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPassword, IDLE);
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <Field
        label="Nova senha"
        htmlFor="newPassword"
        error={state.fieldErrors?.newPassword}
        hint={`Pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`}
      >
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required autoFocus />
      </Field>
      <Field label="Repita a nova senha" htmlFor="confirmPassword" error={state.fieldErrors?.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="mt-1 h-10" pendingText="Salvando…">
        <KeyRoundIcon />
        Salvar senha e entrar
      </SubmitButton>
    </form>
  );
}
