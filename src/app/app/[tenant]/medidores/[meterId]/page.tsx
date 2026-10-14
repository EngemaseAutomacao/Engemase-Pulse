import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GitCompareArrowsIcon } from "lucide-react";
import { z } from "zod";
import { EnergyChart } from "@/components/charts/energy-chart";
import { HistoryChart } from "@/components/charts/history-chart";
import { MeterLivePanel } from "@/components/meters/meter-live-panel";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { requireTenant } from "@/server/auth/dal";
import { hasTenantRole } from "@/server/auth/permissions";
import { findTenantMeter } from "@/server/telemetry/service";

export const metadata: Metadata = { title: "Medidor" };

export default async function MeterPage({ params }: PageProps<"/app/[tenant]/medidores/[meterId]">) {
  const { tenant: slug, meterId } = await params;
  const { tenant, user } = await requireTenant(slug);
  if (!z.uuid().safeParse(meterId).success) notFound();
  const meter = await findTenantMeter(tenant.id, meterId);
  if (!meter) notFound();

  const details = [
    meter.site.name,
    meter.location,
    [meter.manufacturer, meter.model].filter(Boolean).join(" "),
  ].filter(Boolean);

  return (
    <PageContainer>
      <PageHeader
        back={{ href: `/app/${tenant.slug}/medidores`, label: "Medidores" }}
        title={
          <>
            <span className="mr-3 rounded-md bg-muted px-2 py-0.5 align-middle font-mono text-base text-muted-foreground">
              {meter.tag}
            </span>
            {meter.name}
          </>
        }
        description={details.join(" · ")}
        actions={
          <Button asChild variant="outline">
            <Link href={`/app/${tenant.slug}/comparar?m=${meter.id}`}>
              <GitCompareArrowsIcon />
              Comparar com outro
            </Link>
          </Button>
        }
      />

      <MeterLivePanel tenantSlug={tenant.slug} meterId={meter.id} breakerAmps={meter.breakerAmps} />

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <HistoryChart
            tenantSlug={tenant.slug}
            meterId={meter.id}
            canExport={hasTenantRole(user, tenant.id, "OPERATOR")}
          />
        </div>
        <div className="xl:col-span-2">
          <EnergyChart tenantSlug={tenant.slug} meterId={meter.id} />
        </div>
      </div>

      <section aria-labelledby="info-title" className="surface p-4">
        <h2 id="info-title" className="mb-3 font-semibold">
          Cadastro
        </h2>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Número de série" value={meter.serialNumber} />
          <Info label="Endereço Modbus" value={meter.modbusAddress?.toString()} />
          <Info label="Relação TC" value={meter.ctRatio} />
          <Info label="Relação TP" value={meter.ptRatio} />
        </dl>
      </section>
    </PageContainer>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  );
}
