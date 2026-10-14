import type { Metadata } from "next";
import { z } from "zod";
import { SiteForm } from "@/components/admin/site-form";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { tenantOptions } from "@/server/admin/tenants";
import { requirePlatformAdmin } from "@/server/auth/dal";
import { saveSite } from "../actions";

export const metadata: Metadata = { title: "Nova unidade" };

export default async function NewSitePage({ searchParams }: PageProps<"/admin/unidades/novo">) {
  await requirePlatformAdmin();
  const { cliente } = await searchParams;
  const tenants = await tenantOptions();

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Nova unidade" back={{ href: "/admin/unidades", label: "Unidades" }} />
      <div className="surface p-5">
        <SiteForm
          action={saveSite.bind(null, null)}
          tenants={tenants}
          defaultTenantId={z.uuid().safeParse(cliente).data}
        />
      </div>
    </PageContainer>
  );
}
