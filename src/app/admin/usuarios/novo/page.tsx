import type { Metadata } from "next";
import { UserForm } from "@/components/admin/user-form";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { tenantOptions } from "@/server/admin/tenants";
import { requirePlatformAdmin } from "@/server/auth/dal";
import { saveUser } from "../actions";

export const metadata: Metadata = { title: "Novo usuário" };

export default async function NewUserPage() {
  await requirePlatformAdmin();
  const tenants = await tenantOptions();
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Novo usuário" back={{ href: "/admin/usuarios", label: "Usuários" }} />
      <div className="surface p-5">
        <UserForm action={saveUser.bind(null, null)} tenants={tenants} />
      </div>
    </PageContainer>
  );
}
