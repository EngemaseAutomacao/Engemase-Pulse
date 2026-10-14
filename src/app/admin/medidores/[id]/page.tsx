import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ExternalLinkIcon } from "lucide-react";
import { DeleteButton } from "@/components/admin/delete-button";
import { MeterForm } from "@/components/admin/meter-form";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { getMeter } from "@/server/admin/meters";
import { siteOptions } from "@/server/admin/sites";
import { requirePlatformAdmin } from "@/server/auth/dal";
import { listSiteMeasurements, removeMeter, saveMeter } from "../actions";

export const metadata: Metadata = { title: "Medidor" };

export default async function AdminMeterPage({ params }: PageProps<"/admin/medidores/[id]">) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [meter, sites] = await Promise.all([getMeter(id), siteOptions()]);
  if (!meter) notFound();

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        back={{ href: `/admin/medidores?unidade=${meter.site.id}`, label: "Medidores" }}
        title={
          <>
            <span className="mr-3 font-mono text-base text-muted-foreground">{meter.tag}</span>
            {meter.name}
          </>
        }
        description={`${meter.site.tenant.name} · ${meter.site.name}`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/app/${meter.site.tenant.slug}/medidores/${meter.id}`}>
              <ExternalLinkIcon />
              Ver leituras
            </Link>
          </Button>
        }
      />

      <section className="surface p-5">
        <MeterForm
          action={saveMeter.bind(null, meter.id)}
          findMeasurements={listSiteMeasurements}
          sites={sites.map((s) => ({ id: s.id, name: s.name, tenantName: s.tenant.name }))}
          meter={{
            siteId: meter.siteId,
            tag: meter.tag,
            name: meter.name,
            location: meter.location,
            manufacturer: meter.manufacturer,
            model: meter.model,
            serialNumber: meter.serialNumber,
            modbusAddress: meter.modbusAddress,
            ctRatio: meter.ctRatio,
            ptRatio: meter.ptRatio,
            influxMeasurement: meter.influxMeasurement,
            influxTagKey: meter.influxTagKey,
            influxTagValue: meter.influxTagValue,
            sortOrder: meter.sortOrder,
            active: meter.active,
          }}
        />
      </section>

      <section className="space-y-3 rounded-xl border border-destructive/30 p-5">
        <h2 className="font-semibold text-destructive">Excluir medidor</h2>
        <p className="text-sm text-muted-foreground">
          {meter.site.telemetrySource === "AGENT"
            ? "Remove o cadastro e o histórico dele na nuvem. O Painel local cria o medidor de novo quando o cadastro da loja mudar. Para só esconder do painel, desative o medidor."
            : "Remove o cadastro. As leituras no InfluxDB não são apagadas. Para só esconder do painel, desative o medidor."}
        </p>
        <DeleteButton
          action={removeMeter.bind(null, meter.id)}
          label="Excluir medidor"
          title={`Excluir “${meter.tag} — ${meter.name}”?`}
          description="Esta ação não pode ser desfeita."
        />
      </section>
    </PageContainer>
  );
}
