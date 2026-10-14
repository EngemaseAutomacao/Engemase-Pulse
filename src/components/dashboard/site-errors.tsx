import { TriangleAlertIcon } from "lucide-react";

/** Aviso das unidades cuja leitura falhou. */
export function SiteErrors({ errors, siteNames }: { errors: Record<string, string>; siteNames: Map<string, string> }) {
  const entries = Object.entries(errors);
  if (entries.length === 0) return null;
  return (
    <div role="alert" className="space-y-1 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium text-warning">
        <TriangleAlertIcon className="size-4" />
        Não foi possível ler os dados de {entries.length === 1 ? "uma unidade" : `${entries.length} unidades`}
      </p>
      <ul className="space-y-0.5 pl-6 text-foreground/80">
        {entries.map(([siteId, message]) => (
          <li key={siteId}>
            <span className="font-medium">{siteNames.get(siteId) ?? "Unidade"}:</span> {message}
          </li>
        ))}
      </ul>
    </div>
  );
}
