"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton } from "@/components/forms/field";
import { changePassword } from "@/app/actions/account";
import { IDLE } from "@/lib/action-state";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePassword, IDLE);
  const error = (name: string) => state.fieldErrors?.[name];

  return (
    <form action={formAction} className="grid max-w-md gap-4">
      <Field label="Senha atual" htmlFor="currentPassword" error={error("currentPassword")}>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field
        label="Nova senha"
        htmlFor="newPassword"
        error={error("newPassword")}
        hint={`Pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`}
      >
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirme a nova senha" htmlFor="confirmPassword" error={error("confirmPassword")}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-fit">Alterar senha</SubmitButton>
    </form>
  );
}
