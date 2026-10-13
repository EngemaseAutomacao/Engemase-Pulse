"use client";

import { useTransition } from "react";
import { CheckCheckIcon, CheckIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Botão "Reconhecer" de um alarme (a action já vem com slug e id). */
export function AcknowledgeButton({ action }: { action: () => Promise<{ error: string } | void> }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await action();
          if (result?.error) toast.error(result.error);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
      Reconhecer
    </Button>
  );
}

export function AcknowledgeAllButton({ action }: { action: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" disabled={pending} onClick={() => startTransition(() => action())}>
      {pending ? <Loader2Icon className="animate-spin" /> : <CheckCheckIcon />}
      Reconhecer todos
    </Button>
  );
}

export function EvaluateNowButton({ action }: { action: () => Promise<{ message: string }> }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const { message } = await action();
          toast.success(message);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
      Verificar agora
    </Button>
  );
}
