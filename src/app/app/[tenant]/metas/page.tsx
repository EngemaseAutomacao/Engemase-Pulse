import type { Metadata } from "next";
import { TargetIcon } from "lucide-react";
import { TargetsTable } from "@/components/targets/targets-table";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { requireTenant } from "@/server/auth/dal";
import { hasTenantRole } from "@/server/auth/permissions";
import { getSiteTargets } from "@/server/targets";
import { setTargetAction } from "./actions";

export const metadata: Metadata = { title: "Metas" };

export default async function TargetsPage({ params }: PageProps<"/app/[tenant]/metas">) {
  const { tenant: slug } = await params;
  const { tenant, user } = await requireTenant(slug);
  const sites = await getSiteTargets(tenant.id);
  const canEdit = hasTenantRole(user, tenant.id, "ADMIN");

  return (
    <PageContainer>
      <PageHeader
        title="Metas"
        description="Meta de consumo (kWh) e de custo (R$) por mês para cada unidade e setor, com a projeção do mês em andamento. Passou da meta, abre um alarme."
      />
      {sites.length === 0 ? (
        <EmptyState icon={<TargetIcon />} title="Nenhum medidor cadastrado" />
      ) : (
        sites.map((site) => (
          <TargetsTable
            key={site.siteId}
            site={site}
            canEdit={canEdit}
            action={setTargetAction.bind(null, tenant.slug)}
          />
        ))
      )}
    </PageContainer>
  );
}
