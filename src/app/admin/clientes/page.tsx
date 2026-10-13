import type { Metadata } from "next";
import Link from "next/link";
import { Building2Icon, PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { formatCnpj } from "@/lib/format";
import { listTenants } from "@/server/admin/tenants";
import { requirePlatformAdmin } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Clientes" };

export default async function TenantsPage() {
  await requirePlatformAdmin();
  const tenants = await listTenants();

  return (
    <PageContainer>
      <PageHeader
        title="Clientes"
        description="Cada cliente tem seu login, sua marca e suas unidades."
        actions={
          <Button asChild>
            <Link href="/admin/clientes/novo">
              <PlusIcon />
              Novo cliente
            </Link>
          </Button>
        }
      />
      {tenants.length === 0 ? (
        <EmptyState icon={<Building2Icon />} title="Nenhum cliente cadastrado" description="Comece criando o primeiro cliente." />
      ) : (
        <div className="surface overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">CNPJ</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Unidades</TableHead>
                <TableHead className="text-right">Medidores</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Usuários</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/admin/clientes/${t.id}`} className="group flex items-center gap-2">
                      <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: t.primaryColor }} />
                      <span>
                        <span className="block font-medium group-hover:text-primary">{t.name}</span>
                        <span className="block font-mono text-xs text-muted-foreground">/{t.slug}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatCnpj(t.document)}</TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{t._count.sites}</TableCell>
                  <TableCell className="tabular text-right">
                    {t.sites.reduce((sum, s) => sum + s._count.meters, 0)}
                  </TableCell>
                  <TableCell className="tabular hidden text-right lg:table-cell">{t._count.memberships}</TableCell>
                  <TableCell>
                    <Badge variant={t.active ? "secondary" : "outline"}>{t.active ? "Ativo" : "Inativo"}</Badge>
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
