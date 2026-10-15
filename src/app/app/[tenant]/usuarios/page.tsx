import type { Metadata } from "next";
import { DeleteButton } from "@/components/admin/delete-button";
import { RelativeTime } from "@/components/meters/relative-time";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { AccessLinkButton, InviteMemberForm, RoleSelect } from "@/components/users/member-controls";
import { EscalationSetting, MemberNotices } from "@/components/users/member-notices";
import { db } from "@/server/db";
import { requireTenant } from "@/server/auth/dal";
import { isEmailConfigured } from "@/server/email";
import { listTenantMembers } from "@/server/tenant-users";
import {
  accessLinkAction,
  inviteMemberAction,
  removeMemberAction,
  setEscalationMinutesAction,
  setMemberNoticeAction,
  setMemberRoleAction,
} from "./actions";

export const metadata: Metadata = { title: "Usuários" };

/** Usuários do cliente, geridos pelo administrador do próprio cliente. */
export default async function MembersPage({ params }: PageProps<"/app/[tenant]/usuarios">) {
  const { tenant: slug } = await params;
  const { tenant, user } = await requireTenant(slug, "ADMIN");
  const [members, settings] = await Promise.all([
    listTenantMembers(tenant.id),
    db.tenant.findUnique({ where: { id: tenant.id }, select: { escalationMinutes: true } }),
  ]);
  const email = isEmailConfigured();
  const escalationCount = members.filter((m) => m.escalation).length;

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Usuários" description={`Quem acessa ${tenant.name} e o que cada um pode fazer.`} />

      <section className="space-y-4 surface p-5">
        <div>
          <h2 className="font-semibold">Convidar</h2>
          <p className="text-sm text-muted-foreground">
            {email
              ? "A pessoa recebe um e-mail com um link para definir a senha (vale por 7 dias)."
              : "Aparece um link para você enviar à pessoa (WhatsApp, e-mail); com ele ela define a senha. Vale por 7 dias e só uma vez."}
          </p>
        </div>
        <InviteMemberForm action={inviteMemberAction.bind(null, tenant.slug)} />
      </section>

      <section className="flex flex-col gap-3 surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <h2 className="font-semibold">Escalonamento de alarmes</h2>
          <p className="text-sm text-muted-foreground">
            Alarme de Atenção ou Crítico que ninguém reconhecer no prazo vai para as pessoas marcadas em
            &ldquo;Escalonamento&rdquo; abaixo (push, e-mail e Telegram).{" "}
            {settings?.escalationMinutes && escalationCount === 0 && (
              <span className="text-warning">Ninguém está marcado ainda.</span>
            )}
          </p>
        </div>
        <EscalationSetting
          minutes={settings?.escalationMinutes ?? null}
          action={setEscalationMinutesAction.bind(null, tenant.slug)}
        />
      </section>

      <section className="overflow-hidden surface">
        <h2 className="border-b px-4 py-3 font-semibold">Com acesso ({members.length})</h2>
        <ul className="divide-y">
          {members.map(({ role, user: member, alarmEmail, monthlyReport, escalation }) => {
            const self = member.id === user.id;
            const onlyHere = !member.isPlatformAdmin && member._count.memberships === 1;
            return (
              <li
                key={member.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {member.name}
                    {self && <Badge variant="secondary">Você</Badge>}
                    {!member.active && <Badge variant="outline">Desativado</Badge>}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.lastLoginAt ? (
                      <>
                        Último acesso <RelativeTime value={member.lastLoginAt.toISOString()} />
                      </>
                    ) : (
                      "Ainda não entrou"
                    )}
                  </p>
                  <MemberNotices
                    notices={{ alarmEmail, monthlyReport, escalation }}
                    telegram={Boolean(member.telegramChatId)}
                    action={setMemberNoticeAction.bind(null, tenant.slug, member.id)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <RoleSelect
                    action={setMemberRoleAction.bind(null, tenant.slug, member.id)}
                    role={role}
                    disabled={self}
                  />
                  {!self && onlyHere && member.active && (
                    <AccessLinkButton
                      action={accessLinkAction.bind(null, tenant.slug, member.id)}
                      label={member.lastLoginAt ? "Link de nova senha" : "Reenviar convite"}
                    />
                  )}
                  {!self && (
                    <DeleteButton
                      action={removeMemberAction.bind(null, tenant.slug, member.id)}
                      label="Remover"
                      title={`Remover o acesso de ${member.name}?`}
                      description={`${member.name} deixa de ver ${tenant.name}. A conta continua existindo se tiver acesso a outros clientes.`}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </PageContainer>
  );
}
