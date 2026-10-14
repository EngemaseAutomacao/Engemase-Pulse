import type { Metadata } from "next";
import Link from "next/link";
import { MapPinIcon, PlusIcon } from "lucide-react";
import { z } from "zod";
import { FilterForm } from "@/components/admin/filter-form";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listSites } from "@/server/admin/sites";
import { tenantOptions } from "@/server/admin/tenants";
import { requirePlatformAdmin } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Unidades" };

export default async function SitesPage({ searchParams }: PageProps<"/admin/unidades">) {
  await requirePlatformAdmin();
  const { cliente } = await searchParams;
  const tenantId = z.uuid().safeParse(cliente).data;
  const [sites, tenants] = await Promise.all([listSites(tenantId), tenantOptions()]);

  return (
    <PageContainer>
      <PageHeader
        title="Unidades"
        description="Locais de cada cliente. Cada unidade tem sua própria conexão com o InfluxDB."
        actions={
          <Button asChild>
            <Link href={`/admin/unidades/novo${tenantId ? `?cliente=${tenantId}` : ""}`}>
              <PlusIcon />
              Nova unidade
            </Link>
          </Button>
        }
      />
      <FilterForm
        filters={[
          {
            name: "cliente",
            label: "Filtrar por cliente",
            value: tenantId ?? "",
            allLabel: "Todos os clientes",
            options: tenants.map((t) => ({ value: t.id, label: t.name })),
          },
        ]}
      />
      {sites.length === 0 ? (
        <EmptyState icon={<MapPinIcon />} title="Nenhuma unidade encontrada" />
      ) : (
        <div className="surface overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidade</TableHead>
                <TableHead className="hidden sm:table-cell">Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Cidade</TableHead>
                <TableHead>Fonte de dados</TableHead>
                <TableHead className="text-right">Medidores</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/admin/unidades/${s.id}`} className="font-medium hover:text-primary">
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{s.tenant.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {[s.city, s.state].filter(Boolean).join(" / ") || "—"}
                  </TableCell>
                  <TableCell>
                    {s.telemetrySource === "SIMULATED" ? (
                      <Badge variant="outline">Simulado</Badge>
                    ) : s.telemetrySource === "AGENT" ? (
                      <span className="text-sm">Painel local</span>
                    ) : (
                      <span className="text-sm">
                        InfluxDB <span className="font-mono text-xs text-muted-foreground">{s.influxBucket ?? "—"}</span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular text-right">{s._count.meters}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  );
}
