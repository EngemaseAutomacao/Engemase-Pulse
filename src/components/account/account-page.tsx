import { PageContainer, PageHeader } from "@/components/shell/page";
import { ROLE_LABEL, type AuthUser } from "@/server/auth/permissions";
import { NotificationSettings } from "@/components/pwa/notification-settings";
import { ChangePasswordForm } from "./change-password-form";

/** Conteúdo de "Minha conta", usado na área do cliente e na administração. */
export function AccountPage({ user }: { user: AuthUser }) {
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Minha conta" description="Seus dados de acesso." />
      <section className="surface grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Nome</p>
          <p className="font-medium">{user.name}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">E-mail</p>
          <p className="font-medium">{user.email}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs text-muted-foreground">Acessos</p>
          <p className="font-medium">
            {user.isPlatformAdmin
              ? "Equipe da plataforma — todos os clientes"
              : user.memberships.map((m) => `${m.tenantName} (${ROLE_LABEL[m.role]})`).join(", ") || "—"}
          </p>
        </div>
      </section>
      <section className="surface space-y-4 p-5" id="notificacoes">
        <h2 className="font-semibold">Notificações no celular e no computador</h2>
        <NotificationSettings />
      </section>
      <section className="surface space-y-4 p-5">
        <h2 className="font-semibold">Alterar senha</h2>
        <ChangePasswordForm />
      </section>
    </PageContainer>
  );
}
