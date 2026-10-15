import type { Metadata } from "next";
import Link from "next/link";
import { MapPinIcon, PlusIcon } from "lucide-react";
import { z } from "zod";
import { FilterForm } from "@/components/admin/filter-form";
import { RelativeTime } from "@/components/meters/relative-time";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
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
        description="Locais de cada cliente. Cada unidade recebe as leituras do gateway instalado nela."
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
        <div className="overflow-hidden surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidade</TableHead>
                <TableHead className="hidden sm:table-cell">Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Cidade</TableHead>
                <TableHead>Gateway</TableHead>
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
                  <TableCell className="text-sm">
                    {s.agentLastSeenAt ? (
                      <RelativeTime value={s.agentLastSeenAt.toISOString()} />
                    ) : (
                      <span className="text-muted-foreground">
                        {s.agentTokenHash ? "Aguardando o 1º envio" : "Sem token"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular">{s._count.meters}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  );
}
