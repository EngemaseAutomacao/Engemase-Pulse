"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/forms/field";
import { NativeSelect } from "@/components/forms/native-select";
import { useActionToast } from "@/components/forms/use-action-toast";
import { IDLE, type ActionState } from "@/lib/action-state";
import { TARIFF_MODALITIES, TARIFF_MODALITY_LABEL, hasDemand, type TariffModality } from "@/lib/tariff";

export type TariffValues = {
  modality: TariffModality;
  energyOffPeak: number;
  energyPeak: number | null;
  energyIntermediate: number | null;
  flagAdder: number;
  demandPrice: number | null;
  demandPeakPrice: number | null;
  contractedDemand: number | null;
  contractedDemandPeak: number | null;
  peakStartHour: number;
  peakEndHour: number;
  taxRate: number;
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? null : String(v).replace(".", ","));

/**
 * Tarifa e contrato de energia da unidade: base do custo em R$ e da fatura
 * estimada que o cliente vê. Os campos mudam conforme a modalidade.
 */
export function TariffForm({
  action,
  tariff,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  tariff: TariffValues | null;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  useActionToast(state);
  const [modality, setModality] = useState<TariffModality>(
    (state.values?.modality as TariffModality | undefined) ?? tariff?.modality ?? "GREEN",
  );
  const error = (field: string) => state.fieldErrors?.[field];
  const timeOfUse = modality !== "CONVENTIONAL";

  return (
    <form action={formAction} className="grid gap-5">
      <Field label="Modalidade tarifária" htmlFor="modality" error={error("modality")}>
        <NativeSelect
          id="modality"
          name="modality"
          value={modality}
          onChange={(e) => setModality(e.target.value as TariffModality)}
        >
          {TARIFF_MODALITIES.map((m) => (
            <option key={m} value={m}>
              {TARIFF_MODALITY_LABEL[m]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-semibold">Energia (R$/kWh, TUSD + TE)</legend>
        <div className="grid items-start gap-4 sm:grid-cols-3">
          {timeOfUse && (
            <Field label="Ponta" htmlFor="energyPeak" error={error("energyPeak")}>
              <Input
                {...fieldProps(state, "energyPeak", fmt(tariff?.energyPeak))}
                inputMode="decimal"
                placeholder="2,10"
              />
            </Field>
          )}
          {modality === "WHITE" && (
            <Field label="Intermediário" htmlFor="energyIntermediate" error={error("energyIntermediate")}>
              <Input
                {...fieldProps(state, "energyIntermediate", fmt(tariff?.energyIntermediate))}
                inputMode="decimal"
                placeholder="1,20"
              />
            </Field>
          )}
          <Field
            label={timeOfUse ? "Fora ponta" : "Preço do kWh"}
            htmlFor="energyOffPeak"
            error={error("energyOffPeak")}
          >
            <Input
              {...fieldProps(state, "energyOffPeak", fmt(tariff?.energyOffPeak))}
              inputMode="decimal"
              placeholder="0,52"
            />
          </Field>
          <Field
            label="Bandeira (R$/kWh)"
            htmlFor="flagAdder"
            error={error("flagAdder")}
            hint="Adicional da bandeira do mês; 0 na verde."
          >
            <Input
              {...fieldProps(state, "flagAdder", fmt(tariff?.flagAdder ?? 0))}
              inputMode="decimal"
              placeholder="0"
            />
          </Field>
        </div>
      </fieldset>

      {hasDemand(modality) && (
        <fieldset className="grid gap-4">
          <legend className="mb-1 text-sm font-semibold">Demanda</legend>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {modality === "BLUE" && (
              <>
                <Field
                  label="Contratada na ponta (kW)"
                  htmlFor="contractedDemandPeak"
                  error={error("contractedDemandPeak")}
                >
                  <Input
                    {...fieldProps(state, "contractedDemandPeak", fmt(tariff?.contractedDemandPeak))}
                    inputMode="decimal"
                  />
                </Field>
                <Field
                  label="Tarifa de demanda na ponta (R$/kW)"
                  htmlFor="demandPeakPrice"
                  error={error("demandPeakPrice")}
                >
                  <Input {...fieldProps(state, "demandPeakPrice", fmt(tariff?.demandPeakPrice))} inputMode="decimal" />
                </Field>
              </>
            )}
            <Field
              label={modality === "BLUE" ? "Contratada fora ponta (kW)" : "Demanda contratada (kW)"}
              htmlFor="contractedDemand"
              error={error("contractedDemand")}
            >
              <Input {...fieldProps(state, "contractedDemand", fmt(tariff?.contractedDemand))} inputMode="decimal" />
            </Field>
            <Field
              label={modality === "BLUE" ? "Tarifa de demanda fora ponta (R$/kW)" : "Tarifa de demanda (R$/kW)"}
              htmlFor="demandPrice"
              error={error("demandPrice")}
            >
              <Input {...fieldProps(state, "demandPrice", fmt(tariff?.demandPrice))} inputMode="decimal" />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Ultrapassagem: demanda medida acima de 5 % da contratada é cobrada pelo dobro da tarifa no que passar.
          </p>
        </fieldset>
      )}

      <div className="grid items-start gap-4 sm:grid-cols-3">
        {timeOfUse ? (
          <>
            <Field label="Ponta começa" htmlFor="peakStartHour" error={error("peakStartHour")}>
              <NativeSelect {...fieldProps(state, "peakStartHour", tariff?.peakStartHour ?? 18)}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label="Ponta termina"
              htmlFor="peakEndHour"
              error={error("peakEndHour")}
              hint="Dias úteis; sábados, domingos e feriados nacionais são fora ponta."
            >
              <NativeSelect {...fieldProps(state, "peakEndHour", tariff?.peakEndHour ?? 21)}>
                {HOURS.map((h) => (
                  <option key={h + 1} value={h + 1}>
                    {String(h + 1).padStart(2, "0")}:00
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </>
        ) : (
          <>
            <input type="hidden" name="peakStartHour" value={tariff?.peakStartHour ?? 18} />
            <input type="hidden" name="peakEndHour" value={tariff?.peakEndHour ?? 21} />
          </>
        )}
        <Field
          label="Impostos (%)"
          htmlFor="taxRate"
          error={error("taxRate")}
          hint="ICMS + PIS/COFINS. Deixe 0 se os preços já têm impostos."
        >
          <Input {...fieldProps(state, "taxRate", fmt(tariff?.taxRate ?? 0))} inputMode="decimal" placeholder="0" />
        </Field>
      </div>

      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton className="w-fit">Salvar tarifa</SubmitButton>
        {tariff && (
          <Button type="submit" name="remove" value="1" variant="ghost" formNoValidate>
            Remover tarifa
          </Button>
        )}
      </div>
    </form>
  );
}
