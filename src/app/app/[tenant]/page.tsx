import type { Metadata } from "next";
import Link from "next/link";
import { GaugeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActiveAlarmsSummary } from "@/components/alarms/active-alarms-summary";
import { TenantDashboard } from "@/components/dashboard/tenant-dashboard";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { requireTenant } from "@/server/auth/dal";
import { countActiveAlarms, listActiveAlarms } from "@/server/queries/alarms";
import { listTenantMeters } from "@/server/queries/meters";

export const metadata: Metadata = { title: "Visão geral" };

export default async function TenantOverviewPage({ params }: PageProps<"/app/[tenant]">) {
  const { tenant: slug } = await params;
  const { tenant, user } = await requireTenant(slug);
  const [{ sites, meters }, alarms, alarmCount] = await Promise.all([
    listTenantMeters(tenant.id),
    listActiveAlarms(tenant.id, 5),
    countActiveAlarms(tenant.id),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Visão geral"
        description={`${meters.length} ${meters.length === 1 ? "medidor" : "medidores"} em ${sites.length} ${sites.length === 1 ? "unidade" : "unidades"}`}
      />
      <ActiveAlarmsSummary alarms={alarms} total={alarmCount} href={`/app/${tenant.slug}/alarmes`} />
      {meters.length === 0 ? (
        <EmptyState
          icon={<GaugeIcon />}
          title="Nenhum medidor cadastrado"
          description="Assim que os multimedidores forem cadastrados, as leituras aparecem aqui em tempo real."
          action={
            user.isPlatformAdmin ? (
              <Button asChild>
                <Link href={`/admin/medidores/novo?cliente=${tenant.id}`}>Cadastrar medidor</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TenantDashboard tenantSlug={tenant.slug} sites={sites} meters={meters} />
      )}
    </PageContainer>
  );
}
