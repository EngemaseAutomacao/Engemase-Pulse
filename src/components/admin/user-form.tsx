"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/forms/field";
import { NativeSelect } from "@/components/forms/native-select";
import { SwitchField } from "@/components/forms/switch-field";
import { useActionToast } from "@/components/forms/use-action-toast";
import { IDLE, type ActionState } from "@/lib/action-state";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";

type Role = "ADMIN" | "OPERATOR" | "VIEWER";

const ROLE_OPTIONS: { value: Role | ""; label: string }[] = [
  { value: "", label: "Sem acesso" },
  { value: "VIEWER", label: "Visualizador" },
  { value: "OPERATOR", label: "Operador (exporta dados)" },
  { value: "ADMIN", label: "Administrador" },
];

type UserFormValues = {
  name: string;
  email: string;
  isPlatformAdmin: boolean;
  active: boolean;
  memberships: { tenantId: string; role: Role }[];
};

export function UserForm({
  action,
  user,
  tenants,
  isSelf,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  user?: UserFormValues;
  tenants: { id: string; name: string; active: boolean }[];
  isSelf?: boolean;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  useActionToast(state);
  const error = (field: string) => state.fieldErrors?.[field];
  const roleOf = (tenantId: string) =>
    state.values?.[`role.${tenantId}`] ?? user?.memberships.find((m) => m.tenantId === tenantId)?.role ?? "";

  return (
    <form action={formAction} className="grid gap-6">
      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-semibold">Dados de acesso</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" htmlFor="name" error={error("name")}>
            <Input {...fieldProps(state, "name", user?.name)} required autoComplete="off" />
          </Field>
          <Field label="E-mail" htmlFor="email" error={error("email")}>
            <Input {...fieldProps(state, "email", user?.email)} type="email" required autoComplete="off" />
          </Field>
        </div>
        <Field
          label={user ? "Nova senha" : "Senha inicial"}
          htmlFor="password"
          error={error("password")}
          hint={
            user
              ? "Deixe em branco para manter. Se preencher, o usuário é desconectado de todas as sessões."
              : `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres. Passe para o usuário por um canal seguro.`
          }
        >
          <Input id="password" name="password" type="password" autoComplete="new-password" required={!user} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <SwitchField
            name="active"
            label="Usuário ativo"
            description="Inativos não conseguem entrar."
            defaultChecked={user?.active ?? true}
            disabled={isSelf}
          />
          <SwitchField
            name="isPlatformAdmin"
            label="Equipe da plataforma"
            description="Acesso a todos os clientes e à administração."
            defaultChecked={user?.isPlatformAdmin ?? false}
            disabled={isSelf}
          />
        </div>
        {/* Switch desabilitado não é enviado: mantém os valores do próprio usuário. */}
        {isSelf && (
          <>
            <input type="hidden" name="active" value="on" />
            <input type="hidden" name="isPlatformAdmin" value="on" />
          </>
        )}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-semibold">Acesso por cliente</legend>
        <p className="text-xs text-muted-foreground">
          Defina o papel do usuário em cada cliente. A equipe da plataforma já vê todos.
        </p>
        {tenants.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado ainda.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {tenants.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <label htmlFor={`role.${t.id}`} className="text-sm">
                  {t.name}
                  {!t.active && <span className="ml-2 text-xs text-muted-foreground">(inativo)</span>}
                </label>
                <div className="w-full sm:w-60">
                  <NativeSelect id={`role.${t.id}`} name={`role.${t.id}`} defaultValue={roleOf(t.id)}>
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <FormMessage state={state} />
      <SubmitButton className="w-fit">{user ? "Salvar alterações" : "Criar usuário"}</SubmitButton>
    </form>
  );
}
