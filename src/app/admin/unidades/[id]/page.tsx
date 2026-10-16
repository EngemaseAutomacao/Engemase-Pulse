import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DeleteButton } from "@/components/admin/delete-button";
import { SiteForm } from "@/components/admin/site-form";
import { TariffForm } from "@/components/admin/tariff-form";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { getSiteForEdit, getSiteTariff } from "@/server/admin/sites";
import { tenantOptions } from "@/server/admin/tenants";
import { agentVpn } from "@/lib/agent-vpn";
import { MODULE_INFO, type UtilityModule } from "@/lib/utilities";
import { requirePlatformAdmin } from "@/server/auth/dal";
import { removeSite, rotateAgentToken, saveSite, saveSiteTariff } from "../actions";

export const metadata: Metadata = { title: "Unidade" };

function agentStatus(site: { hasAgentToken: boolean; agentLastSeenAt: Date | null; agentInfo: unknown }) {
  const info = (site.agentInfo ?? {}) as { versao?: unknown; planta?: unknown };
  return {
    hasToken: site.hasAgentToken,
    lastSeenAt: site.agentLastSeenAt?.toISOString() ?? null,
    version: typeof info.versao === "string" ? info.versao : null,
    plant: typeof info.planta === "string" ? info.planta : null,
    vpn: agentVpn(site.agentInfo),
  };
}

export default async function SitePage({ params }: PageProps<"/admin/unidades/[id]">) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [site, tenants, tariff] = await Promise.all([getSiteForEdit(id), tenantOptions(), getSiteTariff(id)]);
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
          rotateAgentToken={rotateAgentToken.bind(null, site.id)}
          tenants={tenants}
          site={{
            tenantId: site.tenantId,
            name: site.name,
            address: site.address,
            city: site.city,
            state: site.state,
            timezone: site.timezone,
            areaM2: site.areaM2,
            agent: agentStatus(site),
          }}
        />
      </section>

      <section className="space-y-4 surface p-5">
        <div>
          <h2 className="font-semibold">Tarifa e contrato de energia</h2>
          <p className="text-sm text-muted-foreground">
            Com a tarifa, o cliente vê o custo em R$ por setor e a fatura estimada do mês (demanda, ultrapassagem e
            reativo). Os valores estão na fatura da distribuidora.
          </p>
        </div>
        <TariffForm action={saveSiteTariff.bind(null, site.id)} tariff={tariff} />
      </section>

      <section className="space-y-3 surface p-5">
        <h2 className="font-semibold">Medidores desta unidade</h2>
        {site.meters.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum medidor ainda. Eles aparecem sozinhos no primeiro envio do gateway, a partir dos equipamentos de
            energia cadastrados nele.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {site.meters.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/admin/medidores/${m.id}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                >
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

      <section className="space-y-3 surface p-5">
        <div>
          <h2 className="font-semibold">Módulos e equipamentos de água e gerador</h2>
          <p className="text-sm text-muted-foreground">
            Vêm do Pulse Configurador (gateway) da unidade: os módulos que ele declara e os equipamentos dos grupos água e gerador.
          </p>
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Módulos declarados:</span>
          {site.modules.length === 0 ? (
            <span>nenhum (configurador antigo: o módulo aparece quando chega o equipamento)</span>
          ) : (
            site.modules.map((m) => (
              <Badge key={m} variant="secondary">
                {m === "energia" ? "Energia" : (MODULE_INFO[m as UtilityModule]?.label ?? m)}
              </Badge>
            ))
          )}
        </p>
        {site.utilities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum reservatório ou gerador recebido ainda.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {site.utilities.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  {u.tag && <span className="mr-2 font-mono text-xs text-muted-foreground">{u.tag}</span>}
                  {u.name}
                  <span className="ml-2 text-xs text-muted-foreground">{u.kind === "WATER" ? "Água" : "Gerador"}</span>
                </span>
                <span className="text-xs text-muted-foreground">{settingsText(u.settings)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-destructive/30 p-5">
        <h2 className="font-semibold text-destructive">Excluir unidade</h2>
        <p className="text-sm text-muted-foreground">
          Remove a unidade e os {site.meters.length} medidor(es) dela, com o histórico guardado na nuvem. O histórico da
          unidade continua no gateway.
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

const SETTING_LABEL: Record<string, string> = {
  capacidade_litros: "reservatório (L)",
  capacidade_tanque_litros: "tanque (L)",
  consumo_litros_hora: "consumo (L/h)",
  potencia_nominal_kw: "potência (kW)",
};

/** Parâmetros que o configurador enviou, em texto curto. */
function settingsText(settings: unknown): string {
  const entries = Object.entries((settings ?? {}) as Record<string, unknown>).filter(
    ([k, v]) => k in SETTING_LABEL && typeof v === "number",
  );
  if (entries.length === 0) return "sem parâmetros";
  return entries.map(([k, v]) => `${SETTING_LABEL[k]}: ${(v as number).toLocaleString("pt-BR")}`).join(" · ");
}
