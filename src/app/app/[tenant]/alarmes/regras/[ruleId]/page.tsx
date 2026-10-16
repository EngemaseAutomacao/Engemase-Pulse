import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DeleteButton } from "@/components/admin/delete-button";
import { AlarmRuleForm } from "@/components/alarms/alarm-rule-form";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { requireTenant } from "@/server/auth/dal";
import { getAlarmRule } from "@/server/queries/alarms";
import { listTenantMeters } from "@/server/queries/meters";
import { deleteAlarmRule, saveAlarmRule } from "../../actions";
import { meterLabel } from "@/lib/meter-label";

export const metadata: Metadata = { title: "Regra de alarme" };

export default async function AlarmRulePage({ params }: PageProps<"/app/[tenant]/alarmes/regras/[ruleId]">) {
  const { tenant: slug, ruleId } = await params;
  const { tenant } = await requireTenant(slug, "ADMIN");
  if (!z.uuid().safeParse(ruleId).success) notFound();
  const [rule, { meters }] = await Promise.all([getAlarmRule(tenant.id, ruleId), listTenantMeters(tenant.id)]);
  if (!rule) notFound();

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title={rule.name} back={{ href: `/app/${tenant.slug}/alarmes/regras`, label: "Regras" }} />
      <div className="surface p-5">
        <AlarmRuleForm
          action={saveAlarmRule.bind(null, tenant.slug, rule.id)}
          meters={meters.map((m) => ({ id: m.id, label: `${meterLabel(m)} (${m.siteName})` }))}
          rule={rule}
        />
      </div>
      <section className="space-y-3 rounded-xl border border-destructive/30 p-5">
        <h2 className="font-semibold text-destructive">Excluir regra</h2>
        <p className="text-sm text-muted-foreground">O histórico de alarmes gerados por ela é mantido.</p>
        <DeleteButton
          action={deleteAlarmRule.bind(null, tenant.slug, rule.id)}
          label="Excluir regra"
          title={`Excluir a regra “${rule.name}”?`}
          description="Esta ação não pode ser desfeita."
        />
      </section>
    </PageContainer>
  );
}
