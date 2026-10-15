import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { WaterModuleView } from "@/components/utilities/water-view";
import { requireTenant } from "@/server/auth/dal";
import { visibleModules } from "@/server/utilities/catalog";

export const metadata: Metadata = { title: "Água" };

export default async function WaterPage({ params }: PageProps<"/app/[tenant]/agua">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  if (!(await visibleModules(tenant)).includes("agua")) notFound();

  return (
    <PageContainer>
      <PageHeader
        title="Água"
        description="Reservatórios das unidades: nível ao vivo, consumo por dia, bomba de recalque e aviso de possível vazamento."
      />
      <WaterModuleView tenantSlug={tenant.slug} />
    </PageContainer>
  );
}
