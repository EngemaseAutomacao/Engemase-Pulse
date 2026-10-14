import type { Metadata } from "next";
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { RelativeTime } from "@/components/meters/relative-time";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requirePlatformAdmin } from "@/server/auth/dal";
import { db } from "@/server/db";
import { getSystemHealth, type StoreState } from "@/server/health";
import { clearErrors } from "./actions";

export const metadata: Metadata = { title: "Saúde do sistema" };

const STORE_STATE: Record<StoreState, { label: string; className: string }> = {
  sending: { label: "Enviando", className: "text-success" },
  late: { label: "Atrasada", className: "text-warning" },
  offline: { label: "Sem comunicação", className: "text-destructive" },
  waiting: { label: "Aguardando o 1º envio", className: "text-muted-foreground" },
};

const SOURCE_LABEL: Record<string, string> = { servidor: "Servidor", navegador: "Tela", tarefa: "Tarefa" };

export default async function HealthPage() {
  await requirePlatformAdmin();
  const [{ checks, stores }, errors] = await Promise.all([
    getSystemHealth(),
    db.errorLog.findMany({ orderBy: { lastSeenAt: "desc" }, take: 50 }),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Saúde do sistema"
        description="O que falta configurar, como estão as lojas e os erros recentes."
      />

      <section aria-labelledby="checks-title" className="divide-y surface">
        <h2 id="checks-title" className="px-4 py-3 font-semibold">
          Configuração e funcionamento
        </h2>
        {checks.map((check) => (
          <div key={check.key} className="flex gap-3 px-4 py-3">
            {check.status === "ok" ? (
              <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-label="OK" />
            ) : (
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Atenção" />
            )}
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-medium">{check.label}</p>
              <p className="text-muted-foreground">{check.detail}</p>
              {check.fix && <p className="text-foreground/80">Como resolver: {withCode(check.fix)}</p>}
            </div>
          </div>
        ))}
      </section>

      <section aria-labelledby="stores-title" className="overflow-hidden surface">
        <h2 id="stores-title" className="border-b px-4 py-3 font-semibold">
          Lojas (Painel local)
        </h2>
        {stores.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhuma unidade com token do Painel ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Cliente / unidade</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Último envio</TableHead>
                <TableHead className="hidden pr-4 sm:table-cell">Versão do Painel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((s) => (
                <TableRow key={s.siteId}>
                  <TableCell className="pl-4">
                    <span className="block">{s.tenantName}</span>
                    <span className="block text-xs text-muted-foreground">{s.siteName}</span>
                  </TableCell>
                  <TableCell className={cn("text-sm font-medium", STORE_STATE[s.state].className)}>
                    {STORE_STATE[s.state].label}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <RelativeTime value={s.lastSeenAt} />
                  </TableCell>
                  <TableCell className="hidden pr-4 font-mono text-xs text-muted-foreground sm:table-cell">
                    {s.version ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="errors-title" className="overflow-hidden surface">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 id="errors-title" className="font-semibold">
            Erros recentes
          </h2>
          {errors.length > 0 && (
            <form action={clearErrors}>
              <Button type="submit" variant="ghost" size="sm">
                Limpar lista
              </Button>
            </form>
          )}
        </div>
        {errors.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum erro registrado nos últimos 30 dias.</p>
        ) : (
          <ul className="divide-y">
            {errors.map((e) => (
              <li key={e.id} className="space-y-1 px-4 py-3 text-sm">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{SOURCE_LABEL[e.source] ?? e.source}</span>
                  {e.path && <span className="font-mono">{e.path}</span>}
                  <span>
                    {e.count}× · última <RelativeTime value={e.lastSeenAt.toISOString()} />
                  </span>
                  {e.digest && <span className="font-mono">código {e.digest}</span>}
                </p>
                <p className="break-words">{e.message}</p>
                {e.detail && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Detalhes técnicos</summary>
                    <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 whitespace-pre-wrap">
                      {e.detail}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}

/** Trechos entre crases viram código (comandos e nomes de variáveis). */
function withCode(text: string) {
  return text.split("`").map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
        {part}
      </code>
    ) : (
      part
    ),
  );
}
