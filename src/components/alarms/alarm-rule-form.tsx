"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/forms/field";
import { NativeSelect } from "@/components/forms/native-select";
import { SwitchField } from "@/components/forms/switch-field";
import { IDLE, type ActionState } from "@/lib/action-state";
import { SEVERITY_LABEL, type Severity } from "@/lib/alarms";
import { FIELD_BY_KEY, FIELD_GROUPS, METER_FIELDS } from "@/lib/meter-fields";

type RuleValues = {
  name: string;
  kind: "THRESHOLD" | "OFFLINE";
  meterId: string | null;
  field: string | null;
  comparison: "ABOVE" | "BELOW" | null;
  threshold: number;
  severity: Severity;
  enabled: boolean;
};

export function AlarmRuleForm({
  action,
  rule,
  meters,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  rule?: RuleValues;
  meters: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState(action, IDLE);
  const [kind, setKind] = useState(state.values?.kind ?? rule?.kind ?? "THRESHOLD");
  const [field, setField] = useState(state.values?.field ?? rule?.field ?? "Total_kW");
  const unit = FIELD_BY_KEY.get(field)?.unit;
  const error = (name: string) => state.fieldErrors?.[name];

  return (
    <form action={formAction} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da regra" htmlFor="name" error={error("name")}>
          <Input {...fieldProps(state, "name", rule?.name)} required placeholder="Ex.: Demanda alta" />
        </Field>
        <Field label="Medidor" htmlFor="meterId" error={error("meterId")}>
          <NativeSelect {...fieldProps(state, "meterId", rule?.meterId)}>
            <option value="">Todos os medidores</option>
            {meters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field label="Tipo" htmlFor="kind" error={error("kind")}>
        <NativeSelect id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as RuleValues["kind"])}>
          <option value="THRESHOLD">Grandeza passou de um limite</option>
          <option value="OFFLINE">Medidor sem comunicação</option>
        </NativeSelect>
      </Field>

      {kind === "THRESHOLD" ? (
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem_10rem]">
          <Field label="Grandeza" htmlFor="field" error={error("field")}>
            <NativeSelect id="field" name="field" value={field} onChange={(e) => setField(e.target.value)}>
              {FIELD_GROUPS.map((group) => (
                <optgroup key={group.key} label={group.label}>
                  {METER_FIELDS.filter((f) => f.group === group.key && !f.cumulative).map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                      {f.unit ? ` (${f.unit})` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Condição" htmlFor="comparison" error={error("comparison")}>
            <NativeSelect {...fieldProps(state, "comparison", rule?.comparison ?? "ABOVE")}>
              <option value="ABOVE">Acima de</option>
              <option value="BELOW">Abaixo de</option>
            </NativeSelect>
          </Field>
          <Field label={unit ? `Limite (${unit})` : "Limite"} htmlFor="threshold" error={error("threshold")}>
            <Input {...fieldProps(state, "threshold", rule?.kind === "THRESHOLD" ? rule.threshold : "")} type="number" step="any" required />
          </Field>
        </div>
      ) : (
        <Field
          label="Minutos sem leitura"
          htmlFor="threshold"
          error={error("threshold")}
          hint="Dispara quando o medidor fica esse tempo sem leitura nova (medidor sem comunicação ou o Painel da loja parado)."
        >
          <Input
            {...fieldProps(state, "threshold", rule?.kind === "OFFLINE" ? rule.threshold : 10)}
            type="number"
            min={1}
            max={1440}
            className="w-40"
          />
        </Field>
      )}

      <Field label="Severidade" htmlFor="severity" error={error("severity")} hint="Atenção e Crítico geram notificação push.">
        <NativeSelect {...fieldProps(state, "severity", rule?.severity ?? "WARNING")} className="sm:w-60">
          {(Object.keys(SEVERITY_LABEL) as Severity[]).map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <SwitchField name="enabled" label="Regra ativa" defaultChecked={rule?.enabled ?? true} />
      <FormMessage state={state} />
      <SubmitButton className="w-fit">{rule ? "Salvar regra" : "Criar regra"}</SubmitButton>
    </form>
  );
}
