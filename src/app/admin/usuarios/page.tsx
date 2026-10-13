import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, UsersIcon } from "lucide-react";
import { z } from "zod";
import { FilterForm } from "@/components/admin/filter-form";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { tenantOptions } from "@/server/admin/tenants";
import { listUsers } from "@/server/admin/users";
import { requirePlatformAdmin } from "@/server/auth/dal";
import { ROLE_LABEL } from "@/server/auth/permissions";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/usuarios">) {
  await requirePlatformAdmin();
  const { cliente } = await searchParams;
  const tenantId = z.uuid().safeParse(cliente).data;
  const [users, tenants] = await Promise.all([listUsers(tenantId), tenantOptions()]);

  return (
    <PageContainer>
      <PageHeader
        title="Usuários"
        description="Quem acessa o sistema e o que pode ver em cada cliente."
        actions={
          <Button asChild>
            <Link href="/admin/usuarios/novo">
              <PlusIcon />
              Novo usuário
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
      {users.length === 0 ? (
        <EmptyState icon={<UsersIcon />} title="Nenhum usuário encontrado" />
      ) : (
        <div className="surface overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead className="hidden sm:table-cell">Acesso</TableHead>
                <TableHead className="hidden md:table-cell">Último acesso</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Link href={`/admin/usuarios/${u.id}`} className="group block">
                      <span className="block font-medium group-hover:text-primary">{u.name}</span>
                      <span className="block text-xs text-muted-foreground">{u.email}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden max-w-md sm:table-cell">
                    {u.isPlatformAdmin ? (
                      <Badge>Equipe da plataforma</Badge>
                    ) : u.memberships.length === 0 ? (
                      <span className="text-muted-foreground">Nenhum cliente</span>
                    ) : (
                      <span className="text-sm">
                        {u.memberships.map((m) => `${m.tenant.name} (${ROLE_LABEL[m.role]})`).join(", ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Nunca"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.active ? "secondary" : "outline"}>{u.active ? "Ativo" : "Inativo"}</Badge>
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
