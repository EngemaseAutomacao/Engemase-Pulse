"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/forms/field";
import { SwitchField } from "@/components/forms/switch-field";
import { useActionToast } from "@/components/forms/use-action-toast";
import { IDLE, type ActionState } from "@/lib/action-state";

type MeterFormValues = {
  tag: string;
  name: string;
  location: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  modbusAddress: number | null;
  ctRatio: string | null;
  ptRatio: string | null;
  sortOrder: number;
  active: boolean;
};

/**
 * Edição de um medidor. Ele nasce do gateway, que também mantém nome,
 * entrada geral, disjuntor e endereço: se a unidade mudar o cadastro dela, esses
 * campos voltam a seguir o gateway. O resto é informativo e fica como salvo aqui.
 */
export function MeterForm({
  action,
  meter,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  meter: MeterFormValues;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  useActionToast(state);
  const error = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="grid gap-6">
      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-semibold">Identificação</legend>
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Field label="TAG" htmlFor="tag" error={error("tag")}>
            <Input {...fieldProps(state, "tag", meter.tag)} required placeholder="MM-01" className="font-mono" />
          </Field>
          <Field label="Nome" htmlFor="name" error={error("name")}>
            <Input {...fieldProps(state, "name", meter.name)} required placeholder="Ex.: Quadro geral de baixa tensão" />
          </Field>
        </div>
        <Field label="Localização" htmlFor="location" error={error("location")}>
          <Input {...fieldProps(state, "location", meter.location)} placeholder="Ex.: Subestação 1 — painel QGBT" />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-semibold">Dados técnicos (opcionais)</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Fabricante" htmlFor="manufacturer" error={error("manufacturer")}>
            <Input {...fieldProps(state, "manufacturer", meter.manufacturer)} />
          </Field>
          <Field label="Modelo" htmlFor="model" error={error("model")}>
            <Input {...fieldProps(state, "model", meter.model)} />
          </Field>
          <Field label="Número de série" htmlFor="serialNumber" error={error("serialNumber")}>
            <Input {...fieldProps(state, "serialNumber", meter.serialNumber)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Endereço Modbus" htmlFor="modbusAddress" error={error("modbusAddress")}>
            <Input {...fieldProps(state, "modbusAddress", meter.modbusAddress)} type="number" min={1} max={247} />
          </Field>
          <Field label="Relação TC" htmlFor="ctRatio" error={error("ctRatio")}>
            <Input {...fieldProps(state, "ctRatio", meter.ctRatio)} placeholder="200/5" />
          </Field>
          <Field label="Relação TP" htmlFor="ptRatio" error={error("ptRatio")}>
            <Input {...fieldProps(state, "ptRatio", meter.ptRatio)} placeholder="13800/115" />
          </Field>
          <Field label="Ordem de exibição" htmlFor="sortOrder" error={error("sortOrder")}>
            <Input {...fieldProps(state, "sortOrder", meter.sortOrder)} type="number" min={0} />
          </Field>
        </div>
      </fieldset>

      <SwitchField
        name="active"
        label="Medidor ativo"
        description="Medidores inativos não aparecem nas telas do cliente."
        defaultChecked={meter.active}
      />
      <FormMessage state={state} />
      <SubmitButton className="w-fit">Salvar alterações</SubmitButton>
    </form>
  );
}
