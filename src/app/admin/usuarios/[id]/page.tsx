import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DeleteButton } from "@/components/admin/delete-button";
import { UserForm } from "@/components/admin/user-form";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { formatDateTime } from "@/lib/format";
import { tenantOptions } from "@/server/admin/tenants";
import { getUser } from "@/server/admin/users";
import { requirePlatformAdmin } from "@/server/auth/dal";
import { removeUser, saveUser } from "../actions";

export const metadata: Metadata = { title: "Usuário" };

export default async function UserPage({ params }: PageProps<"/admin/usuarios/[id]">) {
  const actor = await requirePlatformAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [user, tenants] = await Promise.all([getUser(id), tenantOptions()]);
  if (!user) notFound();
  const isSelf = user.id === actor.id;

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        back={{ href: "/admin/usuarios", label: "Usuários" }}
        title={user.name}
        description={`Criado em ${formatDateTime(user.createdAt)} · último acesso: ${user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "nunca"}`}
      />
      <section className="surface p-5">
        <UserForm
          action={saveUser.bind(null, user.id)}
          tenants={tenants}
          isSelf={isSelf}
          user={{
            name: user.name,
            email: user.email,
            isPlatformAdmin: user.isPlatformAdmin,
            active: user.active,
            memberships: user.memberships,
          }}
        />
      </section>
      {!isSelf && (
        <section className="space-y-3 rounded-xl border border-destructive/30 p-5">
          <h2 className="font-semibold text-destructive">Excluir usuário</h2>
          <p className="text-sm text-muted-foreground">Para só bloquear o acesso, desative o usuário.</p>
          <DeleteButton
            action={removeUser.bind(null, user.id)}
            label="Excluir usuário"
            title={`Excluir “${user.name}”?`}
            description="O usuário perde o acesso imediatamente. Esta ação não pode ser desfeita."
          />
        </section>
      )}
    </PageContainer>
  );
}
