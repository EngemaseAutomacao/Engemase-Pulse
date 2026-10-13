import Link from "next/link";
import { ArrowRightIcon, BellRingIcon } from "lucide-react";
import type { AlarmRow } from "@/server/queries/alarms";
import { formatDateTime } from "@/lib/format";
import { SeverityBadge } from "./severity-badge";

/** Faixa no topo do painel com os alarmes ativos (só aparece se houver). */
export function ActiveAlarmsSummary({ alarms, total, href }: { alarms: AlarmRow[]; total: number; href: string }) {
  if (total === 0) return null;
  return (
    <section aria-labelledby="alarms-summary" className="surface space-y-3 border-warning/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="alarms-summary" className="flex items-center gap-2 font-semibold">
          <BellRingIcon className="size-4 text-warning" aria-hidden />
          {total} alarme(s) ativo(s)
        </h2>
        <Link href={href} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          Ver todos <ArrowRightIcon className="size-4" />
        </Link>
      </div>
      <ul className="divide-y">
        {alarms.map((alarm) => (
          <li key={alarm.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-3">
            <SeverityBadge severity={alarm.severity} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{alarm.title}</span>
            <span className="text-xs text-muted-foreground">{formatDateTime(alarm.startedAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
