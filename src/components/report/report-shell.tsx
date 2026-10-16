import Link from "next/link";
import { PrintButton } from "@/components/report/print-button";
import { Button } from "@/components/ui/button";
import { BRAND_THEME_CLASS, brandThemeStyle } from "@/lib/color";
import { formatDateTimeIn } from "@/lib/format";
import { REPORTS, formatSpan, reportHref, type ReportKind } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { tenantLogoUrl } from "@/server/branding";

type ShellTenant = {
  slug: string;
  name: string;
  logoVersion: number | null;
  primaryColor: string;
  accentColor: string;
};

/**
 * Moldura comum dos relatórios: barra (fora da impressão) com a troca de
 * relatório, unidade e mês e o botão de PDF; cabeçalho com o logo do cliente.
 * Sempre no tema claro (é para papel).
 */
export function ReportShell({
  tenant,
  kind,
  available,
  sites,
  siteId,
  subtitle,
  month,
  maxMonth,
  title,
  inProgress,
  timeZone,
  footer,
  children,
}: {
  tenant: ShellTenant;
  kind: ReportKind;
  available: ReportKind[];
  /** Unidades que este relatório pode mostrar (sem a lista: relatório do cliente todo). */
  sites?: { id: string; name: string }[];
  siteId?: string;
  subtitle: string;
  month: string;
  maxMonth: string;
  title: string;
  inProgress: boolean;
  timeZone: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const action = reportHref(tenant.slug, kind).split("?")[0];
  return (
    <div
      className={cn("light min-h-dvh bg-background text-foreground print:bg-white", BRAND_THEME_CLASS)}
      style={brandThemeStyle(tenant.primaryColor, tenant.accentColor)}
    >
      <style>{`@page { size: A4; margin: 14mm; } @media print { .no-print { display: none !important; } .report-card { break-inside: avoid; } }`}</style>

      <div className="no-print sticky top-0 z-10 border-b bg-card/90 backdrop-blur">
        {available.length > 1 && (
          <nav aria-label="Relatórios" className="mx-auto flex max-w-4xl flex-wrap gap-1 px-4 pt-3">
            {REPORTS.filter((r) => available.includes(r.id)).map((r) => (
              <Link
                key={r.id}
                href={reportHref(tenant.slug, r.id, month, siteId)}
                aria-current={r.id === kind ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                  r.id === kind && "bg-secondary text-foreground",
                )}
              >
                {r.label}
              </Link>
            ))}
          </nav>
        )}
        <form method="get" action={action} className="mx-auto flex max-w-4xl flex-wrap items-end gap-3 px-4 py-3">
          {sites && sites.length > 1 && (
            <label className="grid gap-1 text-xs text-muted-foreground">
              Unidade
              <select
                name="unidade"
                defaultValue={siteId}
                className="h-8 rounded-lg border bg-background px-2 text-sm text-foreground"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {sites && sites.length === 1 && <input type="hidden" name="unidade" value={sites[0].id} />}
          <label className="grid gap-1 text-xs text-muted-foreground">
            Mês
            <input
              type="month"
              name="mes"
              defaultValue={month}
              max={maxMonth}
              className="h-8 rounded-lg border bg-background px-2 text-sm text-foreground"
            />
          </label>
          <Button type="submit" variant="outline">
            Ver
          </Button>
          <span className="flex-1" />
          <PrintButton />
        </form>
      </div>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-sm print:max-w-none print:p-0">
        <header className="flex items-start justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo do cliente vem do banco */}
            <img
              src={tenantLogoUrl(tenant.slug, tenant.logoVersion)}
              alt=""
              className="size-12 rounded-full object-contain"
            />
            <div>
              <p className="font-heading text-lg font-bold text-primary">{tenant.name}</p>
              <p className="text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-semibold first-letter:uppercase">{title}</h1>
            <p className="text-xs text-muted-foreground">
              {inProgress ? "Mês em andamento · " : ""}Gerado em {formatDateTimeIn(new Date(), timeZone)}
            </p>
          </div>
        </header>

        {children}

        {footer && <footer className="border-t pt-3 text-xs text-muted-foreground">{footer}</footer>}
      </main>
    </div>
  );
}

/** Indicador do topo do relatório. */
export function Kpi({
  label,
  value,
  detail,
  alert,
}: {
  label: string;
  value: string;
  detail?: string;
  alert?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border p-3", alert && "border-destructive/50")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", alert && "text-destructive")}>{value}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

/** Bloco do relatório que não quebra entre páginas na impressão. */
export function ReportSection({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="report-card space-y-2">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const SEVERITY_LABEL = { CRITICAL: "Crítico", WARNING: "Atenção", INFO: "Informativo" } as const;

/** Tabela dos alarmes do período, com a contagem por nível. */
export function AlarmsTable({
  alarms,
  timeZone,
  empty,
  limit = 20,
}: {
  alarms: {
    id: string;
    severity: "CRITICAL" | "WARNING" | "INFO";
    title: string;
    startedAt: Date;
    clearedAt: Date | null;
  }[];
  timeZone: string;
  empty: string;
  limit?: number;
}) {
  if (alarms.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  const counts = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  for (const a of alarms) counts[a.severity] += 1;
  return (
    <>
      <p className="text-muted-foreground">
        {alarms.length} alarme(s): {counts.CRITICAL} crítico(s), {counts.WARNING} de atenção, {counts.INFO}{" "}
        informativo(s).
      </p>
      <table className="w-full border-collapse text-left">
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            <th className="py-1.5 font-medium">Nível</th>
            <th className="py-1.5 font-medium">Alarme</th>
            <th className="py-1.5 font-medium">Início</th>
            <th className="py-1.5 text-right font-medium">Duração</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {alarms.slice(0, limit).map((a) => (
            <tr key={a.id}>
              <td className="py-1.5">{SEVERITY_LABEL[a.severity]}</td>
              <td className="py-1.5">{a.title}</td>
              <td className="py-1.5 whitespace-nowrap text-muted-foreground">
                {formatDateTimeIn(a.startedAt, timeZone)}
              </td>
              <td className="py-1.5 text-right whitespace-nowrap text-muted-foreground">
                {a.clearedAt ? formatSpan(a.clearedAt.getTime() - a.startedAt.getTime()) : "em aberto"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {alarms.length > limit && (
        <p className="text-xs text-muted-foreground">E mais {alarms.length - limit} — veja a tela de alarmes.</p>
      )}
    </>
  );
}
