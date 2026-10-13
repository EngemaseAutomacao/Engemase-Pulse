"use client";

import { useNow } from "@/hooks/use-now";
import { formatDateTime, formatRelative } from "@/lib/format";

/** "há 12 segundos" que se atualiza sozinho; data completa no title. */
export function RelativeTime({ value, className }: { value: string | null; className?: string }) {
  const now = useNow();
  if (!value) return <span className={className}>—</span>;
  return (
    <time dateTime={value} title={formatDateTime(value)} className={className}>
      {/* Antes de hidratar mostra a data fixa (o servidor não sabe o "agora" do navegador). */}
      {now === null ? formatDateTime(value) : formatRelative(value, Math.max(now, Date.parse(value)))}
    </time>
  );
}
