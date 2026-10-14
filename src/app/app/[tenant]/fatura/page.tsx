import type { Metadata } from "next";
import { ReceiptTextIcon } from "lucide-react";
import { BillingView } from "@/components/billing/billing-view";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { requireTenant } from "@/server/auth/dal";
import { getTenantTopology } from "@/server/telemetry/topology";

export const metadata: Metadata = { title: "Fatura" };

export default async function BillingPage({ params }: PageProps<"/app/[tenant]/fatura">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const sites = (await getTenantTopology(tenant.id))
    .filter((s) => s.meters.length > 0)
    .map((s) => ({ id: s.id, name: s.name, timezone: s.timezone }));

  return (
    <PageContainer>
      <PageHeader
        title="Fatura estimada"
        description="Energia por horário, demanda contra a contratada, ultrapassagem e fator de potência, pela tarifa da unidade."
      />
      {sites.length === 0 ? (
        <EmptyState icon={<ReceiptTextIcon />} title="Nenhum medidor cadastrado" />
      ) : (
        <BillingView tenantSlug={tenant.slug} sites={sites} />
      )}
    </PageContainer>
  );
}
