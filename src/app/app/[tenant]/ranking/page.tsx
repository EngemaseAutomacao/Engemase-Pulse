import type { Metadata } from "next";
import { StoreIcon } from "lucide-react";
import { StoreRanking } from "@/components/ranking/store-ranking";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { requireTenant } from "@/server/auth/dal";
import { getTenantTopology } from "@/server/telemetry/topology";

export const metadata: Metadata = { title: "Ranking de unidades" };

export default async function RankingPage({ params }: PageProps<"/app/[tenant]/ranking">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const sites = (await getTenantTopology(tenant.id)).filter((s) => s.meters.length > 0);

  return (
    <PageContainer>
      <PageHeader
        title="Ranking de unidades"
        description="As unidades lado a lado no mês: consumo, eficiência por m², custo, fator de potência e demanda."
      />
      {sites.length === 0 ? (
        <EmptyState icon={<StoreIcon />} title="Nenhum medidor cadastrado" />
      ) : (
        <StoreRanking tenantSlug={tenant.slug} timeZone={sites[0].timezone} />
      )}
    </PageContainer>
  );
}
