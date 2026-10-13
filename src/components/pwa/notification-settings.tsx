"use client";

import { useEffect, useState, useTransition } from "react";
import { BellIcon, BellOffIcon, Loader2Icon, SendIcon, ShareIcon, SquarePlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { removePushSubscription, savePushSubscription, sendTestNotification } from "@/app/actions/push";

type Status =
  | "checking"
  | "unsupported"
  /** iPhone/iPad: push só funciona com o app instalado na Tela de Início. */
  | "ios-install"
  | "not-configured"
  | "denied"
  | "off"
  | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && navigator.standalone === true);
}

async function detectStatus(): Promise<Status> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  }
  if (!VAPID_PUBLIC_KEY) return "not-configured";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) ? "on" : "off";
}

/** Ativa/desativa as notificações push neste aparelho e envia um teste. */
export function NotificationSettings() {
  const [status, setStatus] = useState<Status>("checking");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    detectStatus().then((s) => !cancelled && setStatus(s));
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = () =>
    startTransition(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
          }));
        const result = await savePushSubscription(subscription.toJSON());
        if (!result.ok) throw new Error(result.error);
        setStatus("on");
        toast.success("Notificações ativadas neste aparelho.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível ativar as notificações.");
      }
    });

  const disable = () =>
    startTransition(async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("off");
      toast.success("Notificações desativadas neste aparelho.");
    });

  const test = () =>
    startTransition(async () => {
      const result = await sendTestNotification();
      if (result.ok) toast.success(result.message ?? "Enviada.");
      else toast.error(result.error);
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Receba no celular ou no computador os alarmes de severidade <strong className="text-foreground">Atenção</strong> e{" "}
        <strong className="text-foreground">Crítico</strong> dos clientes a que você tem acesso. A ativação vale para este
        aparelho/navegador.
      </p>

      {status === "checking" && <p className="text-sm text-muted-foreground">Verificando…</p>}

      {status === "unsupported" && (
        <p className="text-sm text-warning">Este navegador não suporta notificações push.</p>
      )}

      {status === "not-configured" && (
        <p className="text-sm text-warning">As notificações ainda não foram configuradas no servidor.</p>
      )}

      {status === "ios-install" && (
        <div className="space-y-2 rounded-lg border p-3 text-sm">
          <p className="font-medium">No iPhone/iPad, instale o app primeiro:</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>
              Toque em <ShareIcon className="inline size-4" aria-label="Compartilhar" /> (Compartilhar) no Safari;
            </li>
            <li>
              Escolha <SquarePlusIcon className="inline size-4" aria-hidden /> <strong>Adicionar à Tela de Início</strong>;
            </li>
            <li>Abra o app pelo ícone e volte a esta página para ativar.</li>
          </ol>
        </div>
      )}

      {status === "denied" && (
        <p className="text-sm text-warning">
          As notificações estão bloqueadas para este site. Libere nas configurações do navegador (ícone de cadeado na barra
          de endereço) e recarregue a página.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {status === "off" && (
          <Button onClick={enable} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <BellIcon />}
            Ativar notificações neste aparelho
          </Button>
        )}
        {status === "on" && (
          <>
            <Button variant="outline" onClick={test} disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              Enviar teste
            </Button>
            <Button variant="ghost" onClick={disable} disabled={pending}>
              <BellOffIcon />
              Desativar neste aparelho
            </Button>
          </>
        )}
      </div>
      {status === "on" && <p className="text-xs text-success">Notificações ativas neste aparelho.</p>}
    </div>
  );
}
