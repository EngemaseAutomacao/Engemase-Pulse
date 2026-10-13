import type { Metadata } from "next";
import { TenantForm } from "@/components/admin/tenant-form";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { requirePlatformAdmin } from "@/server/auth/dal";
import { saveTenant } from "../actions";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NewTenantPage() {
  await requirePlatformAdmin();
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Novo cliente" back={{ href: "/admin/clientes", label: "Clientes" }} />
      <div className="surface p-5">
        <TenantForm action={saveTenant.bind(null, null)} />
      </div>
    </PageContainer>
  );
}
