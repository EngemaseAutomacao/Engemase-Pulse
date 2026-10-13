import { cn } from "@/lib/utils";

/** Indicador numérico: rótulo, valor com unidade e uma linha de contexto. */
export function StatTile({
  label,
  value,
  unit,
  detail,
  icon,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("surface flex min-w-0 flex-col gap-2 p-3 sm:p-4", className)}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground sm:text-sm">
        <span>{label}</span>
        {icon && <span className="text-primary [&_svg]:size-4">{icon}</span>}
      </div>
      <p className="flex items-baseline gap-1.5">
        <span className="font-heading text-2xl font-semibold sm:text-3xl">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
