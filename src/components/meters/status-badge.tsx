import { CircleCheckIcon, CircleDashedIcon, CircleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MeterStatus } from "@/lib/telemetry-types";

const STATUS = {
  online: { label: "Online", icon: CircleCheckIcon, className: "border-success/30 bg-success/10 text-success" },
  offline: { label: "Sem comunicação", icon: CircleAlertIcon, className: "border-warning/30 bg-warning/10 text-warning" },
  "no-data": { label: "Sem leituras", icon: CircleDashedIcon, className: "border-border bg-muted text-muted-foreground" },
} as const;

/** Estado de comunicação do medidor: sempre ícone + texto, nunca só a cor. */
export function StatusBadge({ status, className }: { status: MeterStatus | "loading"; className?: string }) {
  if (status === "loading") {
    return <span className={cn("h-5 w-20 animate-pulse rounded-full bg-muted", className)} />;
  }
  const { label, icon: Icon, className: tone } = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium",
        tone,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}
