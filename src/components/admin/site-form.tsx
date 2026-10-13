"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { CircleCheckIcon, CircleXIcon, DatabaseIcon, FlaskConicalIcon, Loader2Icon, PlugIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/forms/field";
import { NativeSelect } from "@/components/forms/native-select";
import { useActionToast } from "@/components/forms/use-action-toast";
import { IDLE, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";
import type { ConnectionTestResult } from "@/app/admin/unidades/actions";

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
  telemetrySource: "INFLUXDB" | "SIMULATED";
  influxUrl: string | null;
  influxOrg: string | null;
  influxBucket: string | null;
  influxRollupBucket: string | null;
  hasInfluxToken: boolean;
};

export function SiteForm({
  action,
  testConnection,
  site,
  tenants,
  defaultTenantId,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  testConnection: (formData: FormData) => Promise<ConnectionTestResult>;
  site?: SiteFormValues;
  tenants: { id: string; name: string }[];
  defaultTenantId?: string;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  useActionToast(state);
  const formRef = useRef<HTMLFormElement>(null);
  const [source, setSource] = useState(state.values?.telemetrySource ?? site?.telemetrySource ?? "INFLUXDB");
  const [test, setTest] = useState<ConnectionTestResult | null>(null);
  const [testing, startTest] = useTransition();
  const error = (field: string) => state.fieldErrors?.[field];

  return (
    <form ref={formRef} action={formAction} className="grid gap-6">
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

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-semibold">Fonte das leituras</legend>
        <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
          <SourceOption
            value="INFLUXDB"
            current={source}
            onSelect={setSource}
            icon={<DatabaseIcon />}
            title="InfluxDB"
            description="Leituras reais gravadas pelo gateway RS485."
          />
          <SourceOption
            value="SIMULATED"
            current={source}
            onSelect={setSource}
            icon={<FlaskConicalIcon />}
            title="Simulado"
            description="Dados gerados pelo sistema, para demonstração."
          />
        </div>

        <div className={cn("grid gap-4", source !== "INFLUXDB" && "hidden")}>
          <Field
            label="URL do InfluxDB"
            htmlFor="influxUrl"
            error={error("influxUrl")}
            hint="Precisa ser acessível pela internet (ex.: https://influx.cliente.com.br)."
          >
            <Input {...fieldProps(state, "influxUrl", site?.influxUrl)} placeholder="https://" inputMode="url" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organização" htmlFor="influxOrg" error={error("influxOrg")}>
              <Input {...fieldProps(state, "influxOrg", site?.influxOrg)} />
            </Field>
            <Field label="Bucket" htmlFor="influxBucket" error={error("influxBucket")}>
              <Input {...fieldProps(state, "influxBucket", site?.influxBucket)} />
            </Field>
          </div>
          <Field
            label="Bucket agregado por hora (opcional)"
            htmlFor="influxRollupBucket"
            error={error("influxRollupBucket")}
            hint="Recomendado com muitos dados: históricos longos e consumo diário/mensal ficam bem mais rápidos. Veja docs/influx no projeto."
          >
            <Input {...fieldProps(state, "influxRollupBucket", site?.influxRollupBucket)} placeholder="ex.: medicoes_1h" />
          </Field>
          <Field
            label="Token de leitura"
            htmlFor="influxToken"
            error={error("influxToken")}
            hint={
              site?.hasInfluxToken
                ? "Já existe um token salvo. Deixe em branco para mantê-lo."
                : "Use um token somente leitura deste bucket. Fica cifrado no banco."
            }
          >
            <Input
              id="influxToken"
              name="influxToken"
              type="password"
              autoComplete="off"
              placeholder={site?.hasInfluxToken ? "•••••••• (mantido)" : ""}
              aria-invalid={error("influxToken") ? true : undefined}
            />
          </Field>

          <div className="flex flex-wrap items-start gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={testing}
              onClick={() =>
                startTest(async () => {
                  setTest(await testConnection(new FormData(formRef.current!)));
                })
              }
            >
              {testing ? <Loader2Icon className="animate-spin" /> : <PlugIcon />}
              Testar conexão
            </Button>
            {test && <TestResult result={test} />}
          </div>
        </div>
      </fieldset>

      <input type="hidden" name="telemetrySource" value={source} />
      <FormMessage state={state} />
      <SubmitButton className="w-fit">{site ? "Salvar alterações" : "Criar unidade"}</SubmitButton>
    </form>
  );
}

function SourceOption({
  value,
  current,
  onSelect,
  icon,
  title,
  description,
}: {
  value: "INFLUXDB" | "SIMULATED";
  current: string;
  onSelect: (value: "INFLUXDB" | "SIMULATED") => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(value)}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary/40",
        selected && "border-primary bg-accent",
      )}
    >
      <span className={cn("mt-0.5 text-muted-foreground [&_svg]:size-5", selected && "text-primary")}>{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function TestResult({ result }: { result: ConnectionTestResult }) {
  return (
    <div
      role="status"
      className={cn(
        "min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm",
        result.ok ? "border-success/30 bg-success/10" : "border-destructive/30 bg-destructive/10",
      )}
    >
      <p className={cn("flex items-center gap-2 font-medium", result.ok ? "text-success" : "text-destructive")}>
        {result.ok ? <CircleCheckIcon className="size-4" /> : <CircleXIcon className="size-4" />}
        {result.message}
      </p>
      {result.measurements && result.measurements.length > 0 && (
        <p className="mt-1 text-xs break-words text-muted-foreground">
          Measurements: {result.measurements.slice(0, 30).join(", ")}
          {result.measurements.length > 30 ? "…" : ""}
        </p>
      )}
    </div>
  );
}
