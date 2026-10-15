"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2Icon, Loader2Icon, SendIcon, UnplugIcon } from "lucide-react";
import { toast } from "sonner";
import { InstantSwitch } from "@/components/forms/instant-switch";
import { Button } from "@/components/ui/button";
import {
  connectTelegramAction,
  disconnectTelegramAction,
  setMyPreference,
  telegramStatusAction,
} from "@/app/actions/notifications";

export type MembershipNotices = { tenantId: string; tenantName: string; alarmEmail: boolean; monthlyReport: boolean };

/** Alarmes e resumo do mês por e-mail (por cliente) e conexão com o Telegram. */
export function AlertPreferences({
  memberships,
  emailConfigured,
  telegram,
}: {
  memberships: MembershipNotices[];
  emailConfigured: boolean;
  telegram: { configured: boolean; connected: boolean };
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Por e-mail</h3>
          {!emailConfigured && (
            <p className="text-xs text-warning">O envio de e-mail ainda não foi configurado no servidor; as escolhas ficam guardadas.</p>
          )}
        </div>
        {memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">Os avisos por e-mail são escolhidos em cada cliente a que você tem acesso.</p>
        ) : (
          memberships.map((m) => (
            <div key={m.tenantId} className="space-y-2">
              {memberships.length > 1 && <p className="text-xs font-medium text-muted-foreground">{m.tenantName}</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                <InstantSwitch
                  label="Alarmes por e-mail"
                  description="Atenção e Crítico, quando abrem."
                  checked={m.alarmEmail}
                  action={(v) => setMyPreference(m.tenantId, "alarmEmail", v)}
                />
                <InstantSwitch
                  label="Resumo do mês"
                  description="No dia 1: consumo, custo, demanda e alarmes do mês anterior."
                  checked={m.monthlyReport}
                  action={(v) => setMyPreference(m.tenantId, "monthlyReport", v)}
                />
              </div>
            </div>
          ))
        )}
      </div>
      <TelegramConnection {...telegram} />
    </div>
  );
}

function TelegramConnection({ configured, connected: initial }: { configured: boolean; connected: boolean }) {
  const [connected, setConnected] = useState(initial);
  const [waiting, setWaiting] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Depois de abrir o link, confere a cada 3 s se o Telegram já avisou (até 5 min).
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = window.setInterval(async () => {
      const status = await telegramStatusAction();
      if (status.connected) {
        setConnected(true);
        setWaiting(false);
        setLink(null);
        toast.success("Telegram conectado.");
      } else if (Date.now() - started > 5 * 60_000) {
        setWaiting(false);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  const connect = () =>
    startTransition(async () => {
      const result = await connectTelegramAction();
      if (result.error || !result.url) {
        toast.error(result.error ?? "Não foi possível gerar o link.");
        return;
      }
      setLink(result.url);
      setWaiting(true);
      window.open(result.url, "_blank", "noopener");
    });

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Telegram</h3>
        <p className="text-xs text-muted-foreground">
          Alarmes de Atenção e Crítico de todos os seus clientes numa conversa com o bot do sistema.
        </p>
      </div>
      {!configured ? (
        <p className="text-sm text-muted-foreground">O Telegram ainda não foi configurado no servidor.</p>
      ) : connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircle2Icon className="size-4" aria-hidden />
            Conectado
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await disconnectTelegramAction();
                setConnected(false);
                toast.success("Telegram desconectado.");
              })
            }
          >
            <UnplugIcon />
            Desconectar
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={connect}>
            {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            Conectar Telegram
          </Button>
          {waiting && link && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
              <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
              No Telegram, toque em <b>Iniciar</b>. Não abriu?{" "}
              <a href={link} target="_blank" rel="noopener" className="font-medium text-primary underline">
                Abrir o link
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
