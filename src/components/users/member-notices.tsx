"use client";

import { useState, useTransition } from "react";
import { SendIcon } from "lucide-react";
import { toast } from "sonner";
import { InstantSwitch } from "@/components/forms/instant-switch";
import { NativeSelect } from "@/components/forms/native-select";
import type { MemberNotice } from "@/app/app/[tenant]/usuarios/actions";

/** Avisos de uma pessoa: alarmes por e-mail, resumo do mês e escalonamento. */
export function MemberNotices({
  notices,
  telegram,
  action,
}: {
  notices: Record<MemberNotice, boolean>;
  telegram: boolean;
  action: (notice: MemberNotice, value: boolean) => Promise<{ error?: string }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <InstantSwitch compact label="Alarmes por e-mail" checked={notices.alarmEmail} action={(v) => action("alarmEmail", v)} />
      <InstantSwitch compact label="Resumo do mês" checked={notices.monthlyReport} action={(v) => action("monthlyReport", v)} />
      <InstantSwitch compact label="Escalonamento" checked={notices.escalation} action={(v) => action("escalation", v)} />
      {telegram && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Recebe os alarmes pelo Telegram">
          <SendIcon className="size-3" aria-hidden />
          Telegram
        </span>
      )}
    </div>
  );
}

const ESCALATION_OPTIONS = [0, 5, 10, 15, 30, 60, 120];

/** Prazo para avisar o escalonamento quando ninguém reconhece um alarme. */
export function EscalationSetting({
  minutes,
  action,
}: {
  minutes: number | null;
  action: (minutes: number) => Promise<{ error?: string }>;
}) {
  const [value, setValue] = useState(minutes ?? 0);
  const [pending, startTransition] = useTransition();
  return (
    <NativeSelect
      aria-label="Prazo do escalonamento"
      className="h-8 w-full sm:w-72"
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = Number(e.target.value);
        const previous = value;
        setValue(next);
        startTransition(async () => {
          const result = await action(next);
          if (result.error) {
            setValue(previous);
            toast.error(result.error);
          } else {
            toast.success(next === 0 ? "Escalonamento desligado." : `Escalonamento após ${next} min sem reconhecimento.`);
          }
        });
      }}
    >
      {ESCALATION_OPTIONS.map((m) => (
        <option key={m} value={m}>
          {m === 0 ? "Desligado" : m < 60 ? `Após ${m} min sem reconhecimento` : `Após ${m / 60} h sem reconhecimento`}
        </option>
      ))}
    </NativeSelect>
  );
}
