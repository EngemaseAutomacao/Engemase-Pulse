"use client";

import { useState, useTransition } from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/meters/relative-time";
import type { AgentTokenResult } from "@/app/admin/unidades/actions";

export type AgentStatus = {
  hasToken: boolean;
  lastSeenAt: string | null;
  version: string | null;
  plant: string | null;
};

/**
 * Ligação com o Painel local: último envio recebido e o token que vai no
 * config.json do Painel. O token aparece uma única vez, logo depois de gerado.
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
        Crie a unidade para gerar o token do Painel local.
      </p>
    );
  }

  const generate = () => {
    if (status?.hasToken && !token) {
      const ok = window.confirm(
        "Gerar um novo token? O Painel que usa o token atual para de enviar até receber o novo.",
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
            {[status.plant, status.version && `Painel ${status.version}`].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Os medidores são criados sozinhos a partir dos equipamentos de energia cadastrados no Painel.
        </p>
      </div>


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
              No <code>config.json</code> do Painel da loja, acrescente:
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{config}</pre>
            <CopyButton value={config} label="Copiar trecho" />
          </div>
        </div>
      )}
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        readOnly
        aria-label={label}
        className="font-mono text-xs"
        onFocus={(e) => e.target.select()}
      />
      <CopyButton value={value} label="Copiar" />
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-fit"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copiado" : label}
    </Button>
  );
}
