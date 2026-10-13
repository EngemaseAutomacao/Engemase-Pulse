"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SiteErrors } from "@/components/dashboard/site-errors";
import { Button } from "@/components/ui/button";
import { useIncrementalList } from "@/hooks/use-incremental-list";
import { useLive } from "@/hooks/use-live";
import { formatField } from "@/lib/format";
import type { MeterSummary } from "./meter-card";
import { RelativeTime } from "./relative-time";
import { StatusBadge } from "./status-badge";

const PAGE_SIZE = 50;

const COLUMNS = [
  { key: "Total_kW", label: "Potência" },
  { key: "I_AVG", label: "Corrente" },
  { key: "VLL_AVG", label: "Tensão L-L" },
  { key: "PF_AVG", label: "FP" },
  { key: "Frequencia", label: "Freq." },
  { key: "Total_net_kWh", label: "Energia" },
] as const;

/** Tabela de todos os medidores com as leituras atuais e busca por TAG/nome/unidade. */
export function MetersTable({ tenantSlug, meters }: { tenantSlug: string; meters: MeterSummary[] }) {
  const [query, setQuery] = useState("");
  const { data, isLoading } = useLive(tenantSlug);
  const siteNames = useMemo(() => new Map(meters.map((m) => [m.siteId, m.siteName])), [meters]);

  const needle = query.trim().toLocaleLowerCase("pt-BR");
  const rows = needle
    ? meters.filter((m) =>
        [m.tag, m.name, m.siteName, m.location ?? ""].some((v) => v.toLocaleLowerCase("pt-BR").includes(needle)),
      )
    : meters;
  const page = useIncrementalList(rows, PAGE_SIZE, needle);

  return (
    <div className="space-y-4">
      <div className="relative w-full sm:max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por TAG, nome ou unidade"
          aria-label="Buscar medidor"
          className="pl-8"
        />
      </div>

      <SiteErrors errors={data?.errors ?? {}} siteNames={siteNames} />

      {/* Celular: cartões compactos. Tablet/desktop: tabela completa. */}
      <ul className="space-y-2 md:hidden">
        {page.items.map((meter) => {
          const live = data?.meters[meter.id];
          return (
            <li key={meter.id}>
              <Link href={`/app/${tenantSlug}/medidores/${meter.id}`} className="surface block space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-muted-foreground">{meter.tag}</span>
                    <span className="block truncate font-medium">{meter.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{meter.siteName}</span>
                  </span>
                  <StatusBadge status={isLoading && !live ? "loading" : (live?.status ?? "no-data")} />
                </div>
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  {COLUMNS.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-muted-foreground">{c.label}</dt>
                      <dd className="tabular truncate font-medium">{formatField(c.key, live?.values[c.key])}</dd>
                    </div>
                  ))}
                </dl>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Nenhum medidor encontrado.</li>}
      </ul>

      <div className="surface hidden overflow-hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medidor</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Estado</TableHead>
              {COLUMNS.map((c) => (
                <TableHead key={c.key} className="text-right">
                  {c.label}
                </TableHead>
              ))}
              <TableHead className="text-right">Última leitura</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((meter) => {
              const live = data?.meters[meter.id];
              return (
                <TableRow key={meter.id}>
                  <TableCell>
                    <Link href={`/app/${tenantSlug}/medidores/${meter.id}`} className="group block">
                      <span className="font-mono text-xs text-muted-foreground">{meter.tag}</span>
                      <span className="block font-medium group-hover:text-primary">{meter.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{meter.siteName}</TableCell>
                  <TableCell>
                    <StatusBadge status={isLoading && !live ? "loading" : (live?.status ?? "no-data")} />
                  </TableCell>
                  {COLUMNS.map((c) => (
                    <TableCell key={c.key} className="tabular text-right whitespace-nowrap">
                      {formatField(c.key, live?.values[c.key])}
                    </TableCell>
                  ))}
                  <TableCell className="text-right text-xs whitespace-nowrap text-muted-foreground">
                    <RelativeTime value={live?.time ?? null} />
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMNS.length + 4} className="py-10 text-center text-muted-foreground">
                  Nenhum medidor encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {page.remaining > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={page.showMore}>
            Mostrar mais ({page.remaining} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}
