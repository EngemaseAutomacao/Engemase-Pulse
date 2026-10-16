import type { Metadata } from "next";
import { NetworkIcon } from "lucide-react";
import { SingleLineView, type SingleLineSite } from "@/components/single-line/single-line-view";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { requireTenant } from "@/server/auth/dal";
import { getTenantTopology } from "@/server/telemetry/topology";
import { getUtilityCatalog, visibleModules } from "@/server/utilities/catalog";

export const metadata: Metadata = { title: "Unifilar" };

export default async function SingleLinePage({ params }: PageProps<"/app/[tenant]/unifilar">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const [topology, catalog, modules] = await Promise.all([
    getTenantTopology(tenant.id),
    getUtilityCatalog(tenant.id),
    visibleModules(tenant),
  ]);
  // Unidades com grupo gerador: o unifilar mostra as duas fontes e o QTA.
  const withGenerator = new Set(
    modules.includes("gerador") ? catalog.equipment.filter((e) => e.kind === "GENERATOR").map((e) => e.siteId) : [],
  );
  const sites: SingleLineSite[] = topology
    .filter((s) => s.meters.length > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      hasGenerator: withGenerator.has(s.id),
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
        description="Entrada (rede e gerador, com o QTA), barramento e setores de cada unidade, com a carga de cada disjuntor ao vivo."
      />
      {sites.length === 0 ? (
        <EmptyState icon={<NetworkIcon />} title="Nenhum medidor cadastrado" />
      ) : (
        <SingleLineView tenantSlug={tenant.slug} sites={sites} />
      )}
    </PageContainer>
  );
}
