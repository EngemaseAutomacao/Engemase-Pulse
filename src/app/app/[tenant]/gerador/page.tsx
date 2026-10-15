import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { GeneratorModuleView } from "@/components/utilities/generator-view";
import { requireTenant } from "@/server/auth/dal";
import { visibleModules } from "@/server/utilities/catalog";

export const metadata: Metadata = { title: "Gerador" };

export default async function GeneratorPage({ params }: PageProps<"/app/[tenant]/gerador">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  if (!(await visibleModules(tenant)).includes("gerador")) notFound();

  return (
    <PageContainer>
      <PageHeader
        title="Gerador"
        description="Grupo gerador de cada unidade: se vai partir quando a rede cair, diesel e autonomia, bateria, partidas e falhas."
      />
      <GeneratorModuleView tenantSlug={tenant.slug} />
    </PageContainer>
  );
}
