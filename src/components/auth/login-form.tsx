"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { LogInIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/forms/field";
import { IDLE } from "@/lib/action-state";
import { login } from "@/app/login/actions";

/** Formulário de login. `defaultNext` é o destino padrão (ex.: painel do cliente). */
export function LoginForm({ defaultNext }: { defaultNext?: string }) {
  const [state, formAction] = useActionState(login, IDLE);
  const params = useSearchParams();
  const next = params.get("next") ?? defaultNext ?? "";
  const passwordSet = params.get("senha") === "definida";

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {passwordSet && state.status === "idle" && (
        <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          Senha salva. Entre com o seu e-mail e a nova senha.
        </p>
      )}
      <Field label="E-mail" htmlFor="email" error={state.fieldErrors?.email}>
        <Input {...fieldProps(state, "email")} type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Senha" htmlFor="password" error={state.fieldErrors?.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.fieldErrors?.password ? true : undefined}
        />
      </Field>
      <Link
        href="/login/esqueci"
        className="-mt-2 justify-self-end text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Esqueci minha senha
      </Link>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="mt-1 h-10" pendingText="Entrando…">
        <LogInIcon />
        Entrar
      </SubmitButton>
    </form>
  );
}
