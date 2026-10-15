import type { Metadata } from "next";
import Link from "next/link";
import { GaugeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActiveAlarmsSummary } from "@/components/alarms/active-alarms-summary";
import { TenantDashboard } from "@/components/dashboard/tenant-dashboard";
import { DemandNow } from "@/components/demand/demand-now";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { UtilitiesOverview } from "@/components/utilities/utilities-overview";
import { requireTenant } from "@/server/auth/dal";
import { countActiveAlarms, listActiveAlarms } from "@/server/queries/alarms";
import { listTenantMeters } from "@/server/queries/meters";
import { visibleModules } from "@/server/utilities/catalog";

export const metadata: Metadata = { title: "Visão geral" };

export default async function TenantOverviewPage({ params }: PageProps<"/app/[tenant]">) {
  const { tenant: slug } = await params;
  const { tenant, user } = await requireTenant(slug);
  const [{ sites, meters }, alarms, alarmCount, modules] = await Promise.all([
    listTenantMeters(tenant.id),
    listActiveAlarms(tenant.id, 5),
    countActiveAlarms(tenant.id),
    visibleModules(tenant),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Visão geral"
        description={`${meters.length} ${meters.length === 1 ? "medidor" : "medidores"} em ${sites.length} ${sites.length === 1 ? "unidade" : "unidades"}`}
      />
      <ActiveAlarmsSummary alarms={alarms} total={alarmCount} href={`/app/${tenant.slug}/alarmes`} />
      <UtilitiesOverview tenantSlug={tenant.slug} modules={modules} />
      {meters.length === 0 && modules.length > 0 ? null : meters.length === 0 ? (
        <EmptyState
          icon={<GaugeIcon />}
          title="Nenhum medidor cadastrado"
          description="Os medidores aparecem sozinhos quando o Painel local da loja envia as primeiras leituras."
          action={
            user.isPlatformAdmin ? (
              <Button asChild>
                <Link href={`/admin/unidades?cliente=${tenant.id}`}>Ver unidades e tokens</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DemandNow tenantSlug={tenant.slug} />
          <TenantDashboard tenantSlug={tenant.slug} sites={sites} meters={meters} />
        </>
      )}
    </PageContainer>
  );
}
