"use client";

import { WifiOffIcon } from "lucide-react";
import { RelativeTime } from "@/components/meters/relative-time";
import type { LiveMeter } from "@/lib/telemetry-types";

/**
 * Unidades em que nenhum medidor está comunicando, mas já houve leitura:
 * quase sempre é a loja inteira fora (internet ou mini PC do Painel). Os
 * valores na tela são os últimos recebidos.
 */
export function staleSites(
  meters: { id: string; siteId: string }[],
  live: Record<string, LiveMeter> | undefined,
): { siteId: string; lastTime: string }[] {
  if (!live) return [];
  const bySite = new Map<string, string[]>();
  for (const m of meters) bySite.set(m.siteId, [...(bySite.get(m.siteId) ?? []), m.id]);
  return [...bySite].flatMap(([siteId, ids]) => {
    const readings = ids.map((id) => live[id]).filter(Boolean);
    if (readings.length === 0 || readings.some((r) => r.status === "online")) return [];
    const times = readings.map((r) => r.time).filter((t): t is string => t !== null);
    if (times.length === 0) return [];
    return [{ siteId, lastTime: times.reduce((a, b) => (a > b ? a : b)) }];
  });
}

export function StaleSitesNotice({
  sites,
  siteNames,
}: {
  sites: { siteId: string; lastTime: string }[];
  siteNames: Map<string, string>;
}) {
  if (sites.length === 0) return null;
  return (
    <div role="alert" className="space-y-1 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium text-warning">
        <WifiOffIcon className="size-4" aria-hidden />
        {sites.length === 1 ? "Loja sem comunicação" : `${sites.length} lojas sem comunicação`}
      </p>
      <ul className="space-y-0.5 pl-6 text-foreground/80">
        {sites.map((s) => (
          <li key={s.siteId}>
            <span className="font-medium">{siteNames.get(s.siteId) ?? "Unidade"}:</span> último dado{" "}
            <RelativeTime value={s.lastTime} />. Os valores mostrados são os últimos recebidos — verifique a internet e
            o mini PC da loja.
          </li>
        ))}
      </ul>
    </div>
  );
}
