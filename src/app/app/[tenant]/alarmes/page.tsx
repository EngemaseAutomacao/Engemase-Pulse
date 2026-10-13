import type { Metadata } from "next";
import Link from "next/link";
import { SettingsIcon } from "lucide-react";
import { AcknowledgeAllButton, EvaluateNowButton } from "@/components/alarms/alarm-actions";
import { AlarmList } from "@/components/alarms/alarm-list";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { requireTenant } from "@/server/auth/dal";
import { hasTenantRole } from "@/server/auth/permissions";
import { listActiveAlarms, listAlarmHistory } from "@/server/queries/alarms";
import { acknowledgeAlarm, acknowledgeAll, evaluateNow } from "./actions";

export const metadata: Metadata = { title: "Alarmes" };

export default async function AlarmsPage({ params }: PageProps<"/app/[tenant]/alarmes">) {
  const { tenant: slug } = await params;
  const { tenant, user } = await requireTenant(slug);
  const [active, history] = await Promise.all([listActiveAlarms(tenant.id), listAlarmHistory(tenant.id)]);
  const canAcknowledge = hasTenantRole(user, tenant.id, "OPERATOR");
  const canManage = hasTenantRole(user, tenant.id, "ADMIN");
  const unacknowledged = active.filter((a) => !a.acknowledgedAt).length;

  return (
    <PageContainer>
      <PageHeader
        title="Alarmes"
        description={
          active.length === 0
            ? "Nenhum alarme ativo no momento."
            : `${active.length} ativo(s), ${unacknowledged} aguardando reconhecimento.`
        }
        actions={
          <>
            {canAcknowledge && unacknowledged > 0 && <AcknowledgeAllButton action={acknowledgeAll.bind(null, tenant.slug)} />}
            {canManage && <EvaluateNowButton action={evaluateNow.bind(null, tenant.slug)} />}
            {canManage && (
              <Button asChild variant="outline">
                <Link href={`/app/${tenant.slug}/alarmes/regras`}>
                  <SettingsIcon />
                  Regras
                </Link>
              </Button>
            )}
          </>
        }
      />

      <section className="space-y-3" aria-labelledby="active-title">
        <h2 id="active-title" className="text-lg font-semibold">
          Ativos
        </h2>
        <AlarmList
          alarms={active}
          tenantSlug={tenant.slug}
          acknowledge={canAcknowledge ? (id) => acknowledgeAlarm.bind(null, tenant.slug, id) : undefined}
          emptyText="Tudo normal: nenhum alarme ativo."
        />
      </section>

      <section className="space-y-3" aria-labelledby="history-title">
        <h2 id="history-title" className="text-lg font-semibold">
          Histórico recente
        </h2>
        <AlarmList alarms={history} tenantSlug={tenant.slug} emptyText="Nenhum alarme encerrado ainda." />
      </section>
    </PageContainer>
  );
}
