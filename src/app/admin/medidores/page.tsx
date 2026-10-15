import type { Metadata } from "next";
import Link from "next/link";
import { GaugeIcon } from "lucide-react";
import { z } from "zod";
import { FilterForm } from "@/components/admin/filter-form";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listMeters } from "@/server/admin/meters";
import { siteOptions } from "@/server/admin/sites";
import { tenantOptions } from "@/server/admin/tenants";
import { requirePlatformAdmin } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Medidores" };

export default async function AdminMetersPage({ searchParams }: PageProps<"/admin/medidores">) {
  await requirePlatformAdmin();
  const { cliente, unidade } = await searchParams;
  const tenantId = z.uuid().safeParse(cliente).data;
  const siteId = z.uuid().safeParse(unidade).data;
  const [meters, tenants, sites] = await Promise.all([listMeters({ tenantId, siteId }), tenantOptions(), siteOptions()]);

  return (
    <PageContainer>
      <PageHeader
        title="Medidores"
        description="Criados pelo gateway de cada unidade, a partir dos equipamentos de energia dele."
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
          {
            name: "unidade",
            label: "Filtrar por unidade",
            value: siteId ?? "",
            allLabel: "Todas as unidades",
            options: sites
              .filter((s) => !tenantId || s.tenant.id === tenantId)
              .map((s) => ({ value: s.id, label: tenantId ? s.name : `${s.tenant.name} — ${s.name}` })),
          },
        ]}
      />
      {meters.length === 0 ? (
        <EmptyState icon={<GaugeIcon />} title="Nenhum medidor encontrado" />
      ) : (
        <div className="surface overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medidor</TableHead>
                <TableHead>Cliente / unidade</TableHead>
                <TableHead className="hidden md:table-cell">No gateway</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meters.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link href={`/admin/medidores/${m.id}`} className="group block">
                      <span className="font-mono text-xs text-muted-foreground">{m.tag}</span>
                      <span className="block font-medium group-hover:text-primary">{m.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="block">{m.site.tenant.name}</span>
                    <span className="block text-xs text-muted-foreground">{m.site.name}</span>
                  </TableCell>
                  <TableCell className="hidden text-xs md:table-cell">
                    <span className="font-mono">{m.externalId ?? "—"}</span>
                    {(m.isMain || m.breakerAmps) && (
                      <span className="block text-muted-foreground">
                        {[m.isMain && "entrada geral", m.breakerAmps && `disjuntor ${m.breakerAmps} A`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.active ? "secondary" : "outline"}>{m.active ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  );
}
