import type { Metadata } from "next";
import Link from "next/link";
import { GaugeIcon, PlusIcon } from "lucide-react";
import { z } from "zod";
import { FilterForm } from "@/components/admin/filter-form";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  const newHref = siteId ? `/admin/medidores/novo?unidade=${siteId}` : "/admin/medidores/novo";

  return (
    <PageContainer>
      <PageHeader
        title="Medidores"
        description="Multimedidores ligados ao gateway, com o measurement de cada um no InfluxDB."
        actions={
          <Button asChild>
            <Link href={newHref}>
              <PlusIcon />
              Novo medidor
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
                <TableHead className="hidden md:table-cell">InfluxDB</TableHead>
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
                  <TableCell className="hidden font-mono text-xs md:table-cell">
                    {m.influxMeasurement}
                    {m.influxTagKey && (
                      <span className="block text-muted-foreground">
                        {m.influxTagKey} = {m.influxTagValue}
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
