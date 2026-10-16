"use client";

import { useState, useTransition } from "react";
import { ExternalLinkIcon, KeyRoundIcon, Loader2Icon, NetworkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton, CopyField } from "@/components/forms/copy-field";
import { RelativeTime } from "@/components/meters/relative-time";
import type { AgentTokenResult } from "@/app/admin/unidades/actions";
import { configuratorUrl, type AgentVpn } from "@/lib/agent-vpn";

export type AgentStatus = {
  hasToken: boolean;
  lastSeenAt: string | null;
  version: string | null;
  plant: string | null;
  /** Endereço do gateway na VPN de manutenção (gateway que não está na VPN: null). */
  vpn: AgentVpn | null;
};

/**
 * Ligação com o gateway: último envio recebido e o token que vai no
 * config.json do gateway. O token aparece uma única vez, logo depois de gerado.
 */
export function AgentConnection({
  status,
  rotateToken,
}: {
  status: AgentStatus | null;
  /** Ausente enquanto a unidade não foi criada. */
  rotateToken?: () => Promise<AgentTokenResult>;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!rotateToken) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        Crie a unidade para gerar o token do gateway.
      </p>
    );
  }

  const generate = () => {
    if (status?.hasToken && !token) {
      const ok = window.confirm(
        "Gerar um novo token? O gateway que usa o token atual para de enviar até receber o novo.",
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await rotateToken();
      if (result.ok) {
        setToken(result.token);
        setError(null);
      } else {
        setError(result.message);
      }
    });
  };

  const config = token ? JSON.stringify({ nuvem: { url: window.location.origin, token } }, null, 2) : null;

  return (
    <div className="grid gap-4 rounded-xl border p-4">
      <div className="grid gap-1 text-sm">
        <p>
          <span className="text-muted-foreground">Último envio: </span>
          {status?.lastSeenAt ? <RelativeTime value={status.lastSeenAt} className="font-medium" /> : "nenhum ainda"}
        </p>
        {(status?.plant || status?.version) && (
          <p className="text-muted-foreground">
            {[status.plant, status.version && `versão ${status.version}`].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Os medidores são criados sozinhos a partir dos equipamentos de energia cadastrados no gateway.
        </p>
      </div>

      {status?.vpn && <VpnAccess vpn={status.vpn} />}


      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={generate} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
          {status?.hasToken || token ? "Gerar novo token" : "Gerar token"}
        </Button>
        {status?.hasToken && !token && (
          <span className="text-xs text-muted-foreground">Já existe um token. Ele só é mostrado quando é gerado.</span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {token && config && (
        <div className="grid gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="text-sm font-medium">Copie agora: este token não será mostrado de novo.</p>
          <CopyField label="Token" value={token} />
          <div className="grid gap-1.5">
            <p className="text-xs text-muted-foreground">
              No <code>config.json</code> do gateway da unidade, acrescente:
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{config}</pre>
            <CopyButton value={config} label="Copiar trecho" />
          </div>
        </div>
      )}
    </div>
  );
}

/** SSH e configurador do gateway pela VPN de manutenção (com o túnel do técnico ligado). */
function VpnAccess({ vpn }: { vpn: AgentVpn }) {
  const url = configuratorUrl(vpn);
  return (
    <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <NetworkIcon className="size-4 text-muted-foreground" aria-hidden />
        Na VPN de manutenção: <span className="font-mono">{vpn.ip}</span>
      </p>
      <CopyField label="SSH" value={`ssh usuario@${vpn.ip}`} />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
      >
        Abrir o Pulse Configurador ({url.replace(/\/$/, "")})
        <ExternalLinkIcon className="size-3.5" aria-hidden />
      </a>
      <p className="text-xs text-muted-foreground">
        Só abre com o túnel do WireGuard do técnico ligado. Troque <code>usuario</code> pelo usuário da placa.
      </p>
    </div>
  );
}
