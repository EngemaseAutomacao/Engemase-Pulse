import type { Metadata } from "next";
import { ChartColumnIcon } from "lucide-react";
import { ConsumptionView } from "@/components/consumption/consumption-view";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { requireTenant } from "@/server/auth/dal";
import { getTenantTopology } from "@/server/telemetry/topology";

export const metadata: Metadata = { title: "Consumo" };

export default async function ConsumptionPage({ params }: PageProps<"/app/[tenant]/consumo">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const sites = (await getTenantTopology(tenant.id))
    .filter((s) => s.meters.length > 0)
    .map((s) => ({ id: s.id, name: s.name, timezone: s.timezone }));

  return (
    <PageContainer>
      <PageHeader
        title="Consumo de energia"
        description="Consumo do dia por setor, hora a hora, no horário da unidade."
      />
      {sites.length === 0 ? (
        <EmptyState icon={<ChartColumnIcon />} title="Nenhum medidor cadastrado" />
      ) : (
        <ConsumptionView tenantSlug={tenant.slug} sites={sites} />
      )}
    </PageContainer>
  );
}
