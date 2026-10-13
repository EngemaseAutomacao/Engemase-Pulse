import type { Metadata } from "next";
import { GaugeIcon } from "lucide-react";
import { MetersTable } from "@/components/meters/meters-table";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { requireTenant } from "@/server/auth/dal";
import { listTenantMeters } from "@/server/queries/meters";

export const metadata: Metadata = { title: "Medidores" };

export default async function MetersPage({ params }: PageProps<"/app/[tenant]/medidores">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const { meters } = await listTenantMeters(tenant.id);

  return (
    <PageContainer>
      <PageHeader title="Medidores" description="Leituras atuais de todos os multimedidores." />
      {meters.length === 0 ? (
        <EmptyState icon={<GaugeIcon />} title="Nenhum medidor cadastrado" />
      ) : (
        <MetersTable tenantSlug={tenant.slug} meters={meters} />
      )}
    </PageContainer>
  );
}
