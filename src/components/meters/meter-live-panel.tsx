"use client";

import { TriangleAlertIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLive } from "@/hooks/use-live";
import { formatField } from "@/lib/format";
import { FIELD_BY_KEY, isFieldOutOfRange } from "@/lib/meter-fields";
import { cn } from "@/lib/utils";
import { PhaseLoads } from "./breaker-load";
import { RelativeTime } from "./relative-time";
import { StatusBadge } from "./status-badge";

/** Colunas da tabela por fase e o campo de cada linha (L1, L2, L3, total/média). */
const PHASE_COLUMNS = [
  { label: "Tensão F-N", fields: ["V1N", "V2N", "V3N", "VN_AVG"] },
  { label: "Tensão F-F", fields: ["V12", "V23", "V31", "VLL_AVG"] },
  { label: "Corrente", fields: ["I1", "I2", "I3", "I_AVG"] },
  { label: "Ativa", fields: ["kW1", "kW2", "kW3", "Total_kW"] },
  { label: "Aparente", fields: ["kVA1", "kVA2", "kVA3", "Total_kVA"] },
  { label: "Reativa", fields: ["kVAr1", "kVAr2", "kVAr3", "Total_kVAr"] },
  { label: "FP", fields: ["PF1", "PF2", "PF3", "PF_AVG"] },
] as const;

const PHASE_ROWS = ["L1", "L2", "L3", "Total / média"] as const;

const HEADLINE_FIELDS = ["Total_kW", "PF_AVG", "Frequencia", "Total_net_kWh", "Total_kVAhr", "Total_kVAh"] as const;

/** Qualidade e demanda: nem todo medidor envia; o bloco só aparece com os que vierem. */
const QUALITY_FIELDS = ["THD_V1", "THD_V2", "THD_V3", "THD_I1", "THD_I2", "THD_I3", "I_N", "Demand_kW"] as const;

export function MeterLivePanel({
  tenantSlug,
  meterId,
  breakerAmps,
}: {
  tenantSlug: string;
  meterId: string;
  /** Disjuntor do circuito (A), para mostrar a carga por fase. */
  breakerAmps: number | null;
}) {
  const { data, isLoading } = useLive(tenantSlug, { meterId });
  const live = data?.meters[meterId];
  const values = live?.values ?? {};
  const qualityFields = QUALITY_FIELDS.filter((key) => values[key] !== undefined);

  return (
    <section aria-labelledby="live-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="live-title" className="text-lg font-semibold">
          Leituras atuais
        </h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <StatusBadge status={isLoading && !live ? "loading" : (live?.status ?? "no-data")} />
          <span>
            Última leitura: <RelativeTime value={live?.time ?? null} />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {HEADLINE_FIELDS.map((key) => (
          <div key={key} className="surface p-3">
            <p className="truncate text-xs text-muted-foreground">{FIELD_BY_KEY.get(key)?.label}</p>
            <Value fieldKey={key} value={values[key]} className="mt-1 text-lg font-semibold" />
          </div>
        ))}
      </div>

      {breakerAmps && live?.status === "online" && <PhaseLoads values={values} ratedAmps={breakerAmps} />}

      {qualityFields.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {qualityFields.map((key) => (
            <div key={key} className="surface p-3">
              <p className="truncate text-xs text-muted-foreground">{FIELD_BY_KEY.get(key)?.label}</p>
              <Value fieldKey={key} value={values[key]} className="mt-1 font-semibold" />
            </div>
          ))}
        </div>
      )}

      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fase</TableHead>
              {PHASE_COLUMNS.map((c) => (
                <TableHead key={c.label} className="text-right">
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PHASE_ROWS.map((row, i) => (
              <TableRow key={row} className={cn(i === 3 && "bg-muted/50 font-medium")}>
                <TableCell className="whitespace-nowrap">{row}</TableCell>
                {PHASE_COLUMNS.map((c) => (
                  <TableCell key={c.label} className="text-right whitespace-nowrap">
                    <Value fieldKey={c.fields[i]} value={values[c.fields[i]]} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

/** Valor formatado; fora da faixa normal ganha ícone e cor de alerta. */
function Value({ fieldKey, value, className }: { fieldKey: string; value: number | undefined; className?: string }) {
  const field = FIELD_BY_KEY.get(fieldKey);
  const outOfRange = field !== undefined && value !== undefined && isFieldOutOfRange(field, value);
  return (
    <span
      className={cn("tabular inline-flex items-center gap-1", outOfRange && "text-warning", className)}
      title={outOfRange ? "Fora da faixa esperada" : undefined}
    >
      {outOfRange && <TriangleAlertIcon className="size-3.5" aria-label="Fora da faixa esperada" />}
      {formatField(fieldKey, value)}
    </span>
  );
}
