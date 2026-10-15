"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * Liga/desliga que salva na hora (sem botão salvar). Muda na tela já no
 * clique e volta ao valor anterior se o servidor recusar.
 */
export function InstantSwitch({
  label,
  description,
  checked: initial,
  disabled,
  action,
  successMessage,
  className,
  compact = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  action: (value: boolean) => Promise<{ error?: string } | void>;
  successMessage?: (value: boolean) => string;
  className?: string;
  /** Só o rótulo ao lado, sem caixa (listas). */
  compact?: boolean;
}) {
  const id = useId();
  const [checked, setChecked] = useState(initial);
  const [pending, startTransition] = useTransition();
  const onChange = (value: boolean) => {
    setChecked(value);
    startTransition(async () => {
      const result = await action(value);
      if (result?.error) {
        setChecked(!value);
        toast.error(result.error);
      } else if (successMessage) {
        toast.success(successMessage(value));
      }
    });
  };
  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Switch id={id} size="sm" checked={checked} onCheckedChange={onChange} disabled={disabled || pending} />
        <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
          {label}
        </Label>
      </div>
    );
  }
  return (
    <div className={cn("flex items-start justify-between gap-4 rounded-lg border p-3", className)}>
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled || pending} />
    </div>
  );
}
