"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/lib/action-state";

/** Mostra um toast quando a Server Action termina com sucesso. */
export function useActionToast(state: ActionState) {
  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
  }, [state]);
}
