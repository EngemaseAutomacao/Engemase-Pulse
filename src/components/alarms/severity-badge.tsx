import { CircleAlertIcon, InfoIcon, OctagonAlertIcon } from "lucide-react";
import { SEVERITY_LABEL, type Severity } from "@/lib/alarms";
import { cn } from "@/lib/utils";

const STYLE: Record<Severity, { icon: typeof InfoIcon; className: string }> = {
  INFO: { icon: InfoIcon, className: "border-info/30 bg-info/10 text-info" },
  WARNING: { icon: CircleAlertIcon, className: "border-warning/30 bg-warning/10 text-warning" },
  CRITICAL: { icon: OctagonAlertIcon, className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

/** Severidade sempre com ícone + texto (nunca só cor). */
export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const { icon: Icon, className: tone } = STYLE[severity];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium",
        tone,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}
