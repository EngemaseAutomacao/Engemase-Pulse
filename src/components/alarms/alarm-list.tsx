import Link from "next/link";
import { BellOffIcon, CheckIcon, StoreIcon } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { AlarmRow } from "@/server/queries/alarms";
import { cn } from "@/lib/utils";
import { AcknowledgeButton } from "./alarm-actions";
import { SeverityBadge } from "./severity-badge";

/** Lista de alarmes em cartões (funciona bem do celular ao desktop). */
export function AlarmList({
  alarms,
  tenantSlug,
  acknowledge,
  emptyText,
}: {
  alarms: AlarmRow[];
  tenantSlug: string;
  /** Ação de reconhecer, ou undefined se o usuário não pode. */
  acknowledge?: (alarmId: string) => () => Promise<{ error: string } | void>;
  emptyText: string;
}) {
  if (alarms.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
        <BellOffIcon className="size-5" />
        {emptyText}
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {alarms.map((alarm) => (
        <li
          key={alarm.id}
          className={cn(
            "surface flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between",
            !alarm.clearedAt && !alarm.acknowledgedAt && alarm.severity === "CRITICAL" && "border-destructive/40",
          )}
        >
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={alarm.severity} />
              {alarm.clearedAt ? (
                <span className="text-xs text-success">Normalizado</span>
              ) : (
                <span className="text-xs font-medium text-foreground">Ativo</span>
              )}
              {alarm.source === "PAINEL" && (
                <span
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                  title="Alarme configurado e detectado no gateway da unidade"
                >
                  <StoreIcon className="size-3.5" aria-hidden />
                  Gateway da unidade
                </span>
              )}
            </div>
            <p className="font-medium">
              {alarm.meter ? (
                <Link href={`/app/${tenantSlug}/medidores/${alarm.meter.id}`} className="hover:text-primary">
                  {alarm.title}
                </Link>
              ) : (
                alarm.title
              )}
            </p>
            <p className="text-sm text-muted-foreground">{alarm.message}</p>
            <p className="text-xs text-muted-foreground">
              Início: {formatDateTime(alarm.startedAt)}
              {alarm.clearedAt && ` · Fim: ${formatDateTime(alarm.clearedAt)}`}
              {alarm.acknowledgedAt &&
                ` · Reconhecido ${
                  alarm.acknowledgedBy ? `por ${alarm.acknowledgedBy.name}` : alarm.source === "PAINEL" ? "no gateway" : "por —"
                } em ${formatDateTime(alarm.acknowledgedAt)}`}
            </p>
          </div>
          {!alarm.acknowledgedAt && !alarm.clearedAt && acknowledge ? (
            <AcknowledgeButton action={acknowledge(alarm.id)} />
          ) : alarm.acknowledgedAt && !alarm.clearedAt ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CheckIcon className="size-3.5" /> Reconhecido
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
