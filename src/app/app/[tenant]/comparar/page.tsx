import type { Metadata } from "next";
import { GitCompareArrowsIcon } from "lucide-react";
import { CompareView, type CompareSite } from "@/components/compare/compare-view";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { MAX_COMPARED_METERS, parseCompareSearch } from "@/lib/compare";
import { requireTenant } from "@/server/auth/dal";
import { getTenantTopology } from "@/server/telemetry/topology";

export const metadata: Metadata = { title: "Comparar" };

export default async function ComparePage({ params, searchParams }: PageProps<"/app/[tenant]/comparar">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const sites: CompareSite[] = (await getTenantTopology(tenant.id))
    .filter((s) => s.meters.length > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      timezone: s.timezone,
      meters: s.meters.map((m) => ({ id: m.id, tag: m.tag, name: m.name, isMain: m.isMain })),
    }));
  const allowed = new Set(sites.flatMap((s) => s.meters.map((m) => m.id)));
  const initial = parseCompareSearch(await searchParams, allowed);

  return (
    <PageContainer>
      <PageHeader
        title="Comparar medidores"
        description={`Até ${MAX_COMPARED_METERS} medidores lado a lado, da mesma unidade ou de unidades diferentes.`}
      />
      {sites.length === 0 ? (
        <EmptyState icon={<GitCompareArrowsIcon />} title="Nenhum medidor cadastrado" />
      ) : (
        <CompareView tenantSlug={tenant.slug} sites={sites} initial={initial} />
      )}
    </PageContainer>
  );
}
