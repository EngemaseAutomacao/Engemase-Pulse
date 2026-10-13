"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/forms/field";
import { NativeSelect } from "@/components/forms/native-select";
import { SwitchField } from "@/components/forms/switch-field";
import { useActionToast } from "@/components/forms/use-action-toast";
import { IDLE, type ActionState } from "@/lib/action-state";
import type { ConnectionTestResult } from "@/app/admin/unidades/actions";

type MeterFormValues = {
  siteId: string;
  tag: string;
  name: string;
  location: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  modbusAddress: number | null;
  ctRatio: string | null;
  ptRatio: string | null;
  influxMeasurement: string;
  influxTagKey: string | null;
  influxTagValue: string | null;
  sortOrder: number;
  active: boolean;
};

export type SiteOption = { id: string; name: string; tenantName: string };

export function MeterForm({
  action,
  findMeasurements,
  meter,
  sites,
  defaultSiteId,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  findMeasurements: (siteId: string) => Promise<ConnectionTestResult>;
  meter?: MeterFormValues;
  sites: SiteOption[];
  defaultSiteId?: string;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  useActionToast(state);
  const [siteId, setSiteId] = useState(state.values?.siteId ?? meter?.siteId ?? defaultSiteId ?? "");
  const [lookup, setLookup] = useState<ConnectionTestResult | null>(null);
  const [searching, startSearch] = useTransition();
  const listId = useId();
  const error = (field: string) => state.fieldErrors?.[field];

  // Agrupa as unidades por cliente no seletor.
  const groups = new Map<string, SiteOption[]>();
  for (const site of sites) groups.set(site.tenantName, [...(groups.get(site.tenantName) ?? []), site]);

  return (
    <form action={formAction} className="grid gap-6">
      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-semibold">Identificação</legend>
        <Field label="Unidade" htmlFor="siteId" error={error("siteId")}>
          <NativeSelect
            id="siteId"
            name="siteId"
            value={siteId}
            onChange={(e) => {
              setSiteId(e.target.value);
              setLookup(null);
            }}
            required
            aria-invalid={error("siteId") ? true : undefined}
          >
            <option value="">Selecione…</option>
            {[...groups].map(([tenantName, options]) => (
              <optgroup key={tenantName} label={tenantName}>
                {options.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </NativeSelect>
        </Field>
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Field label="TAG" htmlFor="tag" error={error("tag")}>
            <Input {...fieldProps(state, "tag", meter?.tag)} required placeholder="MM-01" className="font-mono" />
          </Field>
          <Field label="Nome" htmlFor="name" error={error("name")}>
            <Input {...fieldProps(state, "name", meter?.name)} required placeholder="Ex.: Quadro geral de baixa tensão" />
          </Field>
        </div>
        <Field label="Localização" htmlFor="location" error={error("location")}>
          <Input {...fieldProps(state, "location", meter?.location)} placeholder="Ex.: Subestação 1 — painel QGBT" />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-semibold">Origem dos dados no InfluxDB</legend>
        <Field
          label="Measurement"
          htmlFor="influxMeasurement"
          error={error("influxMeasurement")}
          hint="Nome do _measurement onde o gateway grava as leituras deste medidor."
        >
          <div className="flex gap-2">
            <Input {...fieldProps(state, "influxMeasurement", meter?.influxMeasurement)} list={listId} required className="font-mono" />
            <Button
              type="button"
              variant="outline"
              disabled={!siteId || searching}
              onClick={() => startSearch(async () => setLookup(await findMeasurements(siteId)))}
            >
              {searching ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
              Buscar
            </Button>
          </div>
          <datalist id={listId}>
            {lookup?.measurements?.map((m) => <option key={m} value={m} />)}
          </datalist>
        </Field>
        {lookup && (
          <p role="status" className={lookup.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
            {lookup.message}
            {lookup.ok && lookup.measurements && lookup.measurements.length > 0 && " Escolha na lista do campo."}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Filtro por tag (chave)"
            htmlFor="influxTagKey"
            error={error("influxTagKey")}
            hint="Opcional: quando vários medidores dividem o mesmo measurement."
          >
            <Input {...fieldProps(state, "influxTagKey", meter?.influxTagKey)} placeholder="ex.: device" className="font-mono" />
          </Field>
          <Field label="Filtro por tag (valor)" htmlFor="influxTagValue" error={error("influxTagValue")}>
            <Input {...fieldProps(state, "influxTagValue", meter?.influxTagValue)} placeholder="ex.: mm01" className="font-mono" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-semibold">Dados técnicos (opcionais)</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Fabricante" htmlFor="manufacturer" error={error("manufacturer")}>
            <Input {...fieldProps(state, "manufacturer", meter?.manufacturer)} />
          </Field>
          <Field label="Modelo" htmlFor="model" error={error("model")}>
            <Input {...fieldProps(state, "model", meter?.model)} />
          </Field>
          <Field label="Número de série" htmlFor="serialNumber" error={error("serialNumber")}>
            <Input {...fieldProps(state, "serialNumber", meter?.serialNumber)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Endereço Modbus" htmlFor="modbusAddress" error={error("modbusAddress")}>
            <Input {...fieldProps(state, "modbusAddress", meter?.modbusAddress)} type="number" min={1} max={247} />
          </Field>
          <Field label="Relação TC" htmlFor="ctRatio" error={error("ctRatio")}>
            <Input {...fieldProps(state, "ctRatio", meter?.ctRatio)} placeholder="200/5" />
          </Field>
          <Field label="Relação TP" htmlFor="ptRatio" error={error("ptRatio")}>
            <Input {...fieldProps(state, "ptRatio", meter?.ptRatio)} placeholder="13800/115" />
          </Field>
          <Field label="Ordem de exibição" htmlFor="sortOrder" error={error("sortOrder")}>
            <Input {...fieldProps(state, "sortOrder", meter?.sortOrder ?? 0)} type="number" min={0} />
          </Field>
        </div>
      </fieldset>

      <SwitchField
        name="active"
        label="Medidor ativo"
        description="Medidores inativos não aparecem no painel do cliente."
        defaultChecked={meter?.active ?? true}
      />
      <FormMessage state={state} />
      <SubmitButton className="w-fit">{meter ? "Salvar alterações" : "Criar medidor"}</SubmitButton>
    </form>
  );
}
