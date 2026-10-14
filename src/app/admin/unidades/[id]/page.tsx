import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PlusIcon } from "lucide-react";
import { DeleteButton } from "@/components/admin/delete-button";
import { SiteForm } from "@/components/admin/site-form";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSiteForEdit } from "@/server/admin/sites";
import { tenantOptions } from "@/server/admin/tenants";
import { requirePlatformAdmin } from "@/server/auth/dal";
import { removeSite, rotateAgentToken, saveSite, testSiteConnection } from "../actions";

export const metadata: Metadata = { title: "Unidade" };

function agentStatus(site: { hasAgentToken: boolean; agentLastSeenAt: Date | null; agentInfo: unknown }) {
  const info = (site.agentInfo ?? {}) as { versao?: unknown; planta?: unknown };
  return {
    hasToken: site.hasAgentToken,
    lastSeenAt: site.agentLastSeenAt?.toISOString() ?? null,
    version: typeof info.versao === "string" ? info.versao : null,
    plant: typeof info.planta === "string" ? info.planta : null,
  };
}

export default async function SitePage({ params }: PageProps<"/admin/unidades/[id]">) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [site, tenants] = await Promise.all([getSiteForEdit(id), tenantOptions()]);
  if (!site) notFound();

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        back={{ href: `/admin/unidades?cliente=${site.tenant.id}`, label: "Unidades" }}
        title={site.name}
        description={
          <>
            Cliente:{" "}
            <Link href={`/admin/clientes/${site.tenant.id}`} className="underline-offset-4 hover:underline">
              {site.tenant.name}
            </Link>
          </>
        }
      />

      <section className="surface p-5">
        <SiteForm
          action={saveSite.bind(null, site.id)}
          testConnection={testSiteConnection.bind(null, site.id)}
          rotateAgentToken={rotateAgentToken.bind(null, site.id)}
          tenants={tenants}
          site={{
            tenantId: site.tenantId,
            name: site.name,
            address: site.address,
            city: site.city,
            state: site.state,
            timezone: site.timezone,
            telemetrySource: site.telemetrySource,
            influxUrl: site.influxUrl,
            influxOrg: site.influxOrg,
            influxBucket: site.influxBucket,
            influxRollupBucket: site.influxRollupBucket,
            hasInfluxToken: site.hasInfluxToken,
            agent: agentStatus(site),
          }}
        />
      </section>

      <section className="surface space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Medidores desta unidade</h2>
          <Button asChild size="sm" variant="outline">
            <Link href={`/admin/medidores/novo?unidade=${site.id}`}>
              <PlusIcon />
              Novo medidor
            </Link>
          </Button>
        </div>
        {site.meters.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum medidor cadastrado.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {site.meters.map((m) => (
              <li key={m.id}>
                <Link href={`/admin/medidores/${m.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                  <span>
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{m.tag}</span>
                    {m.name}
                  </span>
                  {!m.active && <Badge variant="outline">Inativo</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-destructive/30 p-5">
        <h2 className="font-semibold text-destructive">Excluir unidade</h2>
        <p className="text-sm text-muted-foreground">
          Remove a unidade e os {site.meters.length} medidor(es) dela.{" "}
          {site.telemetrySource === "AGENT"
            ? "O histórico enviado pelo Painel local é apagado junto; o da loja continua no Painel."
            : "As leituras no InfluxDB não são apagadas."}
        </p>
        <DeleteButton
          action={removeSite.bind(null, site.id)}
          label="Excluir unidade"
          title={`Excluir “${site.name}”?`}
          description="Esta ação não pode ser desfeita."
        />
      </section>
    </PageContainer>
  );
}
