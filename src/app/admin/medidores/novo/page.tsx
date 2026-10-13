import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { MeterForm } from "@/components/admin/meter-form";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { siteOptions } from "@/server/admin/sites";
import { requirePlatformAdmin } from "@/server/auth/dal";
import { listSiteMeasurements, saveMeter } from "../actions";

export const metadata: Metadata = { title: "Novo medidor" };

export default async function NewMeterPage({ searchParams }: PageProps<"/admin/medidores/novo">) {
  await requirePlatformAdmin();
  const { unidade, cliente } = await searchParams;
  const tenantId = z.uuid().safeParse(cliente).data;
  const sites = (await siteOptions()).filter((s) => !tenantId || s.tenant.id === tenantId);

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Novo medidor" back={{ href: "/admin/medidores", label: "Medidores" }} />
      {sites.length === 0 ? (
        <EmptyState
          title="Cadastre uma unidade primeiro"
          description="Todo medidor pertence a uma unidade, que define a conexão com o InfluxDB."
          action={
            <Button asChild>
              <Link href={`/admin/unidades/novo${tenantId ? `?cliente=${tenantId}` : ""}`}>Nova unidade</Link>
            </Button>
          }
        />
      ) : (
        <div className="surface p-5">
          <MeterForm
            action={saveMeter.bind(null, null)}
            findMeasurements={listSiteMeasurements}
            sites={sites.map((s) => ({ id: s.id, name: s.name, tenantName: s.tenant.name }))}
            defaultSiteId={z.uuid().safeParse(unidade).data ?? (sites.length === 1 ? sites[0].id : undefined)}
          />
        </div>
      )}
    </PageContainer>
  );
}
