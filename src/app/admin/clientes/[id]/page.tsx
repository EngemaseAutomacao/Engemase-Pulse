import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ExternalLinkIcon, LogInIcon, PlusIcon } from "lucide-react";
import { DeleteButton } from "@/components/admin/delete-button";
import { LogoForm } from "@/components/admin/logo-form";
import { TenantForm } from "@/components/admin/tenant-form";
import { RelativeTime } from "@/components/meters/relative-time";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTenant } from "@/server/admin/tenants";
import { requirePlatformAdmin } from "@/server/auth/dal";
import { ROLE_LABEL } from "@/server/auth/permissions";
import { tenantLogoUrl } from "@/server/branding";
import { removeTenant, saveTenant, uploadTenantLogo } from "../actions";

export const metadata: Metadata = { title: "Cliente" };

export default async function TenantPage({ params }: PageProps<"/admin/clientes/[id]">) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const tenant = await getTenant(id);
  if (!tenant) notFound();

  const meterCount = tenant.sites.reduce((sum, s) => sum + s._count.meters, 0);

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        back={{ href: "/admin/clientes", label: "Clientes" }}
        title={tenant.name}
        description={`${tenant.sites.length} unidade(s) · ${meterCount} medidor(es) · ${tenant.memberships.length} usuário(s)`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/login/${tenant.slug}`} target="_blank">
                <LogInIcon />
                Página de login
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/app/${tenant.slug}`}>
                <ExternalLinkIcon />
                Abrir painel
              </Link>
            </Button>
          </>
        }
      />

      <section className="surface space-y-4 p-5">
        <h2 className="font-semibold">Dados e identidade visual</h2>
        <TenantForm
          action={saveTenant.bind(null, tenant.id)}
          tenant={{
            name: tenant.name,
            slug: tenant.slug,
            document: tenant.document,
            primaryColor: tenant.primaryColor,
            accentColor: tenant.accentColor,
            loginTagline: tenant.loginTagline,
            active: tenant.active,
          }}
        />
      </section>

      <section className="surface space-y-4 p-5">
        <h2 className="font-semibold">Logo</h2>
        <LogoForm
          action={uploadTenantLogo.bind(null, tenant.id)}
          logoUrl={tenantLogoUrl(tenant.slug, tenant.logo?.updatedAt.getTime() ?? null)}
          hasLogo={tenant.logo !== null}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Unidades</h2>
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/unidades/novo?cliente=${tenant.id}`}>
                <PlusIcon />
                Nova unidade
              </Link>
            </Button>
          </div>
          {tenant.sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma unidade ainda.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {tenant.sites.map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/unidades/${s.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {s._count.meters} medidor(es) ·{" "}
                      {s.agentLastSeenAt ? <>último envio <RelativeTime value={s.agentLastSeenAt.toISOString()} /></> : "sem envio do Painel"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Usuários</h2>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/usuarios/novo">
                <PlusIcon />
                Novo usuário
              </Link>
            </Button>
          </div>
          {tenant.memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum usuário vinculado.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {tenant.memberships.map((m) => (
                <li key={m.user.id}>
                  <Link href={`/admin/usuarios/${m.user.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.user.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{m.user.email}</span>
                    </span>
                    <Badge variant="secondary">{ROLE_LABEL[m.role]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-3 rounded-xl border border-destructive/30 p-5">
        <h2 className="font-semibold text-destructive">Excluir cliente</h2>
        <p className="text-sm text-muted-foreground">
          Remove o cliente, todas as unidades e medidores cadastrados, com o histórico guardado na nuvem.
          Para só bloquear o acesso, desative o cliente.
        </p>
        <DeleteButton
          action={removeTenant.bind(null, tenant.id)}
          label="Excluir cliente"
          title={`Excluir “${tenant.name}”?`}
          description={`Serão excluídos ${tenant.sites.length} unidade(s) e ${meterCount} medidor(es). Esta ação não pode ser desfeita.`}
        />
      </section>
    </PageContainer>
  );
}
