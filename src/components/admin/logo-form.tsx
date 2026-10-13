"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage, SubmitButton } from "@/components/forms/field";
import { useActionToast } from "@/components/forms/use-action-toast";
import { IDLE, type ActionState } from "@/lib/action-state";

/** Envio do logo do cliente (PNG/JPG/WEBP até 512 KB). */
export function LogoForm({
  action,
  logoUrl,
  hasLogo,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  logoUrl: string;
  hasLogo: boolean;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  useActionToast(state);

  return (
    <div className="flex flex-wrap items-start gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- logo vem do banco */}
      <img src={logoUrl} alt="Logo atual" className="size-20 rounded-xl border bg-white/5 object-contain p-1" />
      <form action={formAction} className="grid min-w-64 flex-1 gap-3">
        <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Arquivo do logo" />
        <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP, até 512 KB. Prefira imagem quadrada.</p>
        <FormMessage state={state} />
        <div className="flex gap-2">
          <SubmitButton size="sm" pendingText="Enviando…">
            Enviar logo
          </SubmitButton>
          {hasLogo && (
            <Button type="submit" name="remove" value="1" variant="ghost" size="sm" formNoValidate>
              Remover
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
