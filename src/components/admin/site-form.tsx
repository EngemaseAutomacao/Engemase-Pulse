"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/forms/field";
import { NativeSelect } from "@/components/forms/native-select";
import { useActionToast } from "@/components/forms/use-action-toast";
import { IDLE, type ActionState } from "@/lib/action-state";
import type { AgentTokenResult } from "@/app/admin/unidades/actions";
import { AgentConnection, type AgentStatus } from "./agent-connection";

const TIME_ZONES = [
  ["America/Sao_Paulo", "Brasília (SP, RJ, MG, Sul, GO, DF…)"],
  ["America/Bahia", "Bahia"],
  ["America/Recife", "Pernambuco, PB, RN, AL, SE"],
  ["America/Fortaleza", "Ceará, PI, MA"],
  ["America/Belem", "Pará (leste), AP"],
  ["America/Manaus", "Amazonas, RR, RO"],
  ["America/Cuiaba", "Mato Grosso"],
  ["America/Campo_Grande", "Mato Grosso do Sul"],
  ["America/Rio_Branco", "Acre"],
  ["America/Noronha", "Fernando de Noronha"],
] as const;

type SiteFormValues = {
  tenantId: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  timezone: string;
  agent: AgentStatus;
};

export function SiteForm({
  action,
  rotateAgentToken,
  site,
  tenants,
  defaultTenantId,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** Só na edição: a unidade precisa existir para ter token. */
  rotateAgentToken?: () => Promise<AgentTokenResult>;
  site?: SiteFormValues;
  tenants: { id: string; name: string }[];
  defaultTenantId?: string;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  useActionToast(state);
  const error = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="grid gap-6">
      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-semibold">Dados da unidade</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente" htmlFor="tenantId" error={error("tenantId")}>
            {site ? (
              <>
                <Input value={tenants.find((t) => t.id === site.tenantId)?.name ?? ""} disabled />
                <input type="hidden" name="tenantId" value={site.tenantId} />
              </>
            ) : (
              <NativeSelect {...fieldProps(state, "tenantId", defaultTenantId)} required>
                <option value="">Selecione…</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Nome da unidade" htmlFor="name" error={error("name")}>
            <Input {...fieldProps(state, "name", site?.name)} required placeholder="Ex.: Fábrica Campinas" />
          </Field>
        </div>
        <Field label="Endereço" htmlFor="address" error={error("address")}>
          <Input {...fieldProps(state, "address", site?.address)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_6rem_1fr]">
          <Field label="Cidade" htmlFor="city" error={error("city")}>
            <Input {...fieldProps(state, "city", site?.city)} />
          </Field>
          <Field label="UF" htmlFor="state" error={error("state")}>
            <Input {...fieldProps(state, "state", site?.state)} maxLength={2} className="uppercase" />
          </Field>
          <Field label="Fuso horário" htmlFor="timezone" error={error("timezone")} hint="Usado para agrupar consumo por dia.">
            <NativeSelect {...fieldProps(state, "timezone", site?.timezone ?? "America/Sao_Paulo")}>
              {TIME_ZONES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-semibold">Painel local (loja)</legend>
        <p className="text-sm text-muted-foreground">
          As leituras chegam do Painel instalado na loja, que lê os multimedidores pela RS-485 e envia para cá.
        </p>
        <AgentConnection status={site?.agent ?? null} rotateToken={rotateAgentToken} />
      </fieldset>

      <FormMessage state={state} />
      <SubmitButton className="w-fit">{site ? "Salvar alterações" : "Criar unidade"}</SubmitButton>
    </form>
  );
}
