import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ArrowRightIcon, Building2Icon, ShieldIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageContainer, PageSkeleton } from "@/components/shell/page";
import { APP_NAME, BRAND } from "@/config/app";
import { requireUser } from "@/server/auth/dal";
import { ROLE_LABEL } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { logout } from "@/app/login/actions";

export const metadata: Metadata = { title: "Clientes" };

/** Seletor de cliente para quem tem acesso a mais de um. */
export default function TenantPickerPage() {
  return (
    <main className="min-h-dvh">
      <Suspense fallback={<PageSkeleton cards={3} />}>
        <TenantPicker />
      </Suspense>
    </main>
  );
}

async function TenantPicker() {
  const user = await requireUser();

  const tenants = user.isPlatformAdmin
    ? (
        await db.tenant.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { slug: true, name: true } })
      ).map((t) => ({ slug: t.slug, name: t.name, subtitle: "Equipe da plataforma" }))
    : user.memberships.map((m) => ({ slug: m.tenantSlug, name: m.tenantName, subtitle: ROLE_LABEL[m.role] }));

  if (!user.isPlatformAdmin && tenants.length === 1) redirect(`/app/${tenants[0].slug}`);

  return (
    <PageContainer className="max-w-3xl py-12">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem estática da marca */}
        <img src={BRAND.logo} alt="" className="size-10 rounded-full" />
        <div>
          <p className="font-heading text-lg font-bold text-primary">{APP_NAME}</p>
          <p className="text-sm text-muted-foreground">Olá, {user.name.split(" ")[0]}. Escolha o cliente.</p>
        </div>
      </div>

      {tenants.length === 0 ? (
        <EmptyState
          icon={<Building2Icon />}
          title="Nenhum cliente liberado para você"
          description="Peça ao administrador para vincular seu usuário a um cliente."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {tenants.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/app/${t.slug}`}
                className="surface group flex items-center justify-between gap-3 p-4 transition-colors hover:border-primary/40"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">{t.subtitle}</span>
                </span>
                <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {user.isPlatformAdmin && (
          <Button asChild variant="outline">
            <Link href="/admin">
              <ShieldIcon />
              Administração
            </Link>
          </Button>
        )}
        <form action={logout}>
          <Button variant="ghost" type="submit">
            Sair
          </Button>
        </form>
      </div>
    </PageContainer>
  );
}
