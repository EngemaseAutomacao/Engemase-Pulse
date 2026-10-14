"use client";

import { useActionState, useState, useTransition } from "react";
import { Link2Icon, Loader2Icon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { CopyField } from "@/components/forms/copy-field";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/forms/field";
import { NativeSelect } from "@/components/forms/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IDLE } from "@/lib/action-state";
import type { InviteState } from "@/app/app/[tenant]/usuarios/actions";

const ROLE_OPTIONS = [
  { value: "VIEWER", label: "Visualizador", hint: "vê painéis, consumo, fatura e alarmes" },
  { value: "OPERATOR", label: "Operador", hint: "também reconhece alarmes e exporta" },
  { value: "ADMIN", label: "Administrador", hint: "também cria regras de alarme e gerencia usuários" },
] as const;

export function InviteMemberForm({
  action,
}: {
  action: (state: InviteState, formData: FormData) => Promise<InviteState>;
}) {
  const [state, formAction] = useActionState(action, IDLE as InviteState);
  const error = (field: string) => state.fieldErrors?.[field];
  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid items-start gap-4 sm:grid-cols-[1fr_1fr_12rem]">
        <Field label="Nome" htmlFor="name" error={error("name")}>
          <Input {...fieldProps(state, "name")} required autoComplete="off" />
        </Field>
        <Field label="E-mail" htmlFor="email" error={error("email")}>
          <Input {...fieldProps(state, "email")} type="email" required autoComplete="off" />
        </Field>
        <Field label="Papel" htmlFor="role" error={error("role")}>
          <NativeSelect {...fieldProps(state, "role", "VIEWER")}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {ROLE_OPTIONS.map((r) => (
          <li key={r.value}>
            <span className="font-medium text-foreground/80">{r.label}:</span> {r.hint}
          </li>
        ))}
      </ul>
      <FormMessage state={state} />
      {state.link && <CopyField label="Link para definir a senha" value={state.link} />}
      <SubmitButton className="w-fit" pendingText="Convidando…">
        <UserPlusIcon />
        Convidar
      </SubmitButton>
    </form>
  );
}

/** Troca o papel na hora (sem botão salvar); em caso de recusa, volta o valor. */
export function RoleSelect({
  action,
  role,
  disabled,
}: {
  action: (formData: FormData) => Promise<{ error: string } | void>;
  role: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <NativeSelect
      aria-label="Papel"
      defaultValue={role}
      disabled={disabled || pending}
      className="h-8 w-40"
      onChange={(e) => {
        const select = e.currentTarget;
        const formData = new FormData();
        formData.set("role", select.value);
        startTransition(async () => {
          const result = await action(formData);
          if (result?.error) {
            toast.error(result.error);
            select.value = role;
          } else {
            toast.success("Papel alterado.");
          }
        });
      }}
    >
      {ROLE_OPTIONS.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Gera um link de acesso (primeiro acesso ou nova senha); mostra o link se não houver e-mail. */
export function AccessLinkButton({
  action,
  label,
}: {
  action: () => Promise<{ error?: string; url?: string | null; emailed?: boolean }>;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  return (
    <div className="grid justify-items-end gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await action();
            if (result.error) {
              toast.error(result.error);
            } else if (result.emailed) {
              setUrl(null);
              toast.success("Link enviado por e-mail.");
            } else if (result.url) {
              setUrl(result.url);
            } else {
              toast.error("Endereço do sistema não configurado (APP_URL).");
            }
          })
        }
      >
        {pending ? <Loader2Icon className="animate-spin" /> : <Link2Icon />}
        {label}
      </Button>
      {url && (
        <div className="w-full max-w-md">
          <CopyField label="Link de acesso" value={url} />
        </div>
      )}
    </div>
  );
}
