"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { MeterStatus } from "@/lib/telemetry-types";
import type { UtilityLive } from "@/lib/utility-types";
import { cn } from "@/lib/utils";

/** Estado de comunicação do equipamento, no mesmo vocabulário dos medidores. */
export function liveStatus(live: UtilityLive | null): MeterStatus {
  if (!live) return "no-data";
  return live.online ? "online" : "offline";
}

/** Troca de unidade (só aparece com mais de uma). */
export function SitePicker({
  sites,
  value,
  onChange,
}: {
  sites: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  if (sites.length < 2) return <div />;
  return (
    <div role="radiogroup" aria-label="Unidade" className="flex flex-wrap gap-1 rounded-lg border p-0.5">
      {sites.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={value === s.id}
          onClick={() => onChange(s.id)}
          className={cn(
            "min-h-8 rounded-md px-3 text-sm font-medium transition-colors",
            value === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

export function UtilitiesLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-72" />
      <div className="grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <Skeleton className="h-48 rounded-xl" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
      <Skeleton className="h-56 rounded-xl" />
    </div>
  );
}
