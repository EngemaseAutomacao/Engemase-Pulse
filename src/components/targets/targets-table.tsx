"use client";

import { useState, useTransition } from "react";
import { CircleCheckIcon, Loader2Icon, OctagonAlertIcon, SaveIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, formatNumber } from "@/lib/format";
import { targetStatus, type SiteTargets, type TargetRow, type TargetStatus } from "@/lib/targets";
import { cn } from "@/lib/utils";

const STATUS: Record<
  Exclude<TargetStatus, "none">,
  { label: string; icon: typeof CircleCheckIcon; text: string; bar: string }
> = {
  ok: { label: "Dentro da meta", icon: CircleCheckIcon, text: "text-success", bar: "bg-success" },
  near: { label: "Perto da meta", icon: TriangleAlertIcon, text: "text-warning", bar: "bg-warning" },
  over: { label: "Acima da meta", icon: OctagonAlertIcon, text: "text-destructive", bar: "bg-destructive" },
};

/** Metas de uma unidade: andamento do mês contra a meta, com edição para o administrador. */
export function TargetsTable({
  site,
  canEdit,
  action,
}: {
  site: SiteTargets;
  canEdit: boolean;
  action: (scope: string, formData: FormData) => Promise<{ error?: string }>;
}) {
  const monthName = new Date(`${site.month}-15T12:00:00Z`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <section aria-labelledby={`targets-${site.siteId}`} className="overflow-hidden surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
        <h2 id={`targets-${site.siteId}`} className="font-semibold">
          {site.siteName}
        </h2>
        <p className="text-xs text-muted-foreground">
          {monthName} · projeção pelo consumo até agora{site.hasTariff ? "" : " · sem tarifa: só kWh"}
        </p>
      </div>
      <ul className="divide-y">
        {site.rows.map((row) => (
          <TargetLine key={row.scope} row={row} canEdit={canEdit} hasTariff={site.hasTariff} action={action} />
        ))}
      </ul>
    </section>
  );
}

function TargetLine({
  row,
  canEdit,
  hasTariff,
  action,
}: {
  row: TargetRow;
  canEdit: boolean;
  hasTariff: boolean;
  action: (scope: string, formData: FormData) => Promise<{ error?: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const kwhState = targetStatus(row.kwhProjected, row.targetKwh);
  const costState = targetStatus(row.costProjected, row.targetCost);
  const worst = [kwhState, costState].includes("over")
    ? "over"
    : [kwhState, costState].includes("near")
      ? "near"
      : kwhState === "ok" || costState === "ok"
        ? "ok"
        : "none";

  return (
    <li className="grid gap-3 px-4 py-3 lg:grid-cols-[1.2fr_1fr_1fr_1.3fr] lg:items-center">
      <div className="min-w-0">
        <p className={cn("font-medium", !row.meterId && "text-primary")}>{row.label}</p>
        <p className="text-xs text-muted-foreground">{row.detail}</p>
        {worst !== "none" && <StatusText status={worst} />}
      </div>
      <Progress
        label="kWh"
        soFar={formatNumber(row.kwhSoFar, 0)}
        projected={row.kwhProjected === null ? "—" : formatNumber(row.kwhProjected, 0)}
        projectedValue={row.kwhProjected}
        target={row.targetKwh}
        targetText={row.targetKwh === null ? null : `${formatNumber(row.targetKwh, 0)} kWh`}
        unit="kWh"
      />
      {!hasTariff ? (
        <p className="text-xs text-muted-foreground">Sem tarifa cadastrada: meta só em kWh.</p>
      ) : (
        <Progress
          label="R$"
          soFar={row.costSoFar === null ? "—" : formatMoney(row.costSoFar, true)}
          projected={row.costProjected === null ? "—" : formatMoney(row.costProjected, true)}
          projectedValue={row.costProjected}
          target={row.targetCost}
          targetText={row.targetCost === null ? null : formatMoney(row.targetCost, true)}
        />
      )}
      {canEdit ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onChange={() => setDirty(true)}
          action={(formData) =>
            startTransition(async () => {
              const result = await action(row.scope, formData);
              if (result.error) toast.error(result.error);
              else {
                toast.success(`Meta de ${row.label} salva.`);
                setDirty(false);
              }
            })
          }
        >
          <label className="grid gap-1 text-xs text-muted-foreground">
            Meta kWh/mês
            <Input
              name="kwh"
              inputMode="decimal"
              defaultValue={row.targetKwh === null ? "" : formatNumber(row.targetKwh, 0)}
              className="h-8 w-28 tabular"
              placeholder="—"
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Meta R$/mês
            <Input
              name="cost"
              inputMode="decimal"
              defaultValue={row.targetCost === null ? "" : formatNumber(row.targetCost, 2)}
              className="h-8 w-28 tabular"
              placeholder={hasTariff ? "—" : "sem tarifa"}
              disabled={!hasTariff}
            />
          </label>
          <Button type="submit" size="sm" variant={dirty ? "default" : "outline"} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            Salvar
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">
          {row.targetKwh === null && row.targetCost === null ? "Sem meta" : "Meta definida pelo administrador"}
        </p>
      )}
    </li>
  );
}

function StatusText({ status }: { status: Exclude<TargetStatus, "none"> }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <p className={cn("mt-1 flex items-center gap-1 text-xs font-medium", s.text)}>
      <Icon className="size-3.5" aria-hidden />
      {s.label}
    </p>
  );
}

function Progress({
  label,
  soFar,
  projected,
  projectedValue,
  target,
  targetText,
  unit,
}: {
  label: string;
  soFar: string;
  projected: string;
  projectedValue: number | null;
  target: number | null;
  targetText: string | null;
  unit?: string;
}) {
  const status = targetStatus(projectedValue, target);
  const scale = target ? Math.max(target * 1.2, projectedValue ?? 0) : 0;
  return (
    <div className="space-y-1.5 text-xs">
      <p className="text-muted-foreground">
        <span className="sr-only">{label}: </span>
        Até agora <span className="font-medium text-foreground tabular">{soFar}</span>
        {unit ? ` ${unit}` : ""} · projeção <span className="font-medium text-foreground tabular">{projected}</span>
        {unit && projected !== "—" ? ` ${unit}` : ""}
      </p>
      {target && status !== "none" ? (
        <>
          <div className="relative h-2 rounded-full bg-muted" role="presentation">
            <div
              className={cn("absolute inset-y-0 left-0 rounded-full", STATUS[status].bar)}
              style={{ width: `${Math.min(100, ((projectedValue ?? 0) / scale) * 100)}%` }}
            />
            <div className="absolute -inset-y-1 w-0.5 bg-foreground" style={{ left: `${(target / scale) * 100}%` }} />
          </div>
          <p className="text-muted-foreground">Meta {targetText}</p>
        </>
      ) : (
        <p className="text-muted-foreground">{targetText ? `Meta ${targetText}` : "Sem meta"}</p>
      )}
    </div>
  );
}
