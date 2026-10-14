import type { Metadata } from "next";
import { NetworkIcon } from "lucide-react";
import { SingleLineView, type SingleLineSite } from "@/components/single-line/single-line-view";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { requireTenant } from "@/server/auth/dal";
import { getTenantTopology } from "@/server/telemetry/topology";

export const metadata: Metadata = { title: "Unifilar" };

export default async function SingleLinePage({ params }: PageProps<"/app/[tenant]/unifilar">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const sites: SingleLineSite[] = (await getTenantTopology(tenant.id))
    .filter((s) => s.meters.length > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      meters: s.meters.map((m) => ({
        id: m.id,
        tag: m.tag,
        name: m.name,
        isMain: m.isMain,
        breakerAmps: m.breakerAmps,
      })),
    }));

  return (
    <PageContainer>
      <PageHeader
        title="Diagrama unifilar"
        description="Entrada, barramento e setores de cada unidade, com a carga de cada disjuntor ao vivo."
      />
      {sites.length === 0 ? (
        <EmptyState icon={<NetworkIcon />} title="Nenhum medidor cadastrado" />
      ) : (
        <SingleLineView tenantSlug={tenant.slug} sites={sites} />
      )}
    </PageContainer>
  );
}
