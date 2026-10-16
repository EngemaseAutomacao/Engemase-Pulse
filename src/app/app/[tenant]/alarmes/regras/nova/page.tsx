import type { Metadata } from "next";
import { AlarmRuleForm } from "@/components/alarms/alarm-rule-form";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { requireTenant } from "@/server/auth/dal";
import { listTenantMeters } from "@/server/queries/meters";
import { saveAlarmRule } from "../../actions";
import { meterLabel } from "@/lib/meter-label";

export const metadata: Metadata = { title: "Nova regra de alarme" };

export default async function NewAlarmRulePage({ params }: PageProps<"/app/[tenant]/alarmes/regras/nova">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug, "ADMIN");
  const { meters } = await listTenantMeters(tenant.id);

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Nova regra de alarme" back={{ href: `/app/${tenant.slug}/alarmes/regras`, label: "Regras" }} />
      <div className="surface p-5">
        <AlarmRuleForm
          action={saveAlarmRule.bind(null, tenant.slug, null)}
          meters={meters.map((m) => ({ id: m.id, label: `${meterLabel(m)} (${m.siteName})` }))}
        />
      </div>
    </PageContainer>
  );
}
