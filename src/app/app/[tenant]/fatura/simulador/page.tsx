import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, CalculatorIcon } from "lucide-react";
import { TariffSimulator } from "@/components/billing/tariff-simulator";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireTenant } from "@/server/auth/dal";
import { getSimulationData } from "@/server/queries/tariff-sim";
import { getTenantTopology } from "@/server/telemetry/topology";

export const metadata: Metadata = { title: "Simulador de tarifa" };

export default async function TariffSimulatorPage({
  params,
  searchParams,
}: PageProps<"/app/[tenant]/fatura/simulador">) {
  const { tenant: slug } = await params;
  const { unidade } = await searchParams;
  const { tenant } = await requireTenant(slug);
  const sites = (await getTenantTopology(tenant.id)).filter((s) => s.meters.length > 0);
  const site = sites.find((s) => s.id === unidade) ?? sites[0];
  const data = site ? await getSimulationData(tenant.id, site.id) : null;

  return (
    <PageContainer>
      <PageHeader
        title="Simulador de tarifa"
        description="Quanto a unidade pagaria em cada modalidade e qual demanda contratada sai mais barata, com os últimos 12 meses medidos."
        actions={
          <Button asChild variant="outline">
            <Link href={`/app/${tenant.slug}/fatura`}>
              <ArrowLeftIcon />
              Fatura
            </Link>
          </Button>
        }
      />
      {sites.length > 1 && (
        <nav aria-label="Unidade" className="flex flex-wrap gap-2">
          {sites.map((s) => (
            <Link
              key={s.id}
              href={`/app/${tenant.slug}/fatura/simulador?unidade=${s.id}`}
              aria-current={s.id === site?.id ? "page" : undefined}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground",
                s.id === site?.id && "border-primary bg-accent font-medium text-foreground",
              )}
            >
              {s.name}
            </Link>
          ))}
        </nav>
      )}
      {!data ? (
        <EmptyState icon={<CalculatorIcon />} title="Nenhum medidor cadastrado" />
      ) : (
        <TariffSimulator key={data.siteId} data={data} />
      )}
    </PageContainer>
  );
}
