import type { Metadata } from "next";
import Link from "next/link";
import { BellRingIcon, PlusIcon } from "lucide-react";
import { SeverityBadge } from "@/components/alarms/severity-badge";
import { EmptyState, PageContainer, PageHeader } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeRule } from "@/lib/alarms";
import { requireTenant } from "@/server/auth/dal";
import { listAlarmRules } from "@/server/queries/alarms";
import { meterLabel } from "@/lib/meter-label";

export const metadata: Metadata = { title: "Regras de alarme" };

export default async function AlarmRulesPage({ params }: PageProps<"/app/[tenant]/alarmes/regras">) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug, "ADMIN");
  const rules = await listAlarmRules(tenant.id);
  const base = `/app/${tenant.slug}/alarmes/regras`;

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        back={{ href: `/app/${tenant.slug}/alarmes`, label: "Alarmes" }}
        title="Regras de alarme"
        description="Quando uma regra dispara, o alarme aparece no sistema e quem ativou as notificações recebe um aviso no celular."
        actions={
          <Button asChild>
            <Link href={`${base}/nova`}>
              <PlusIcon />
              Nova regra
            </Link>
          </Button>
        }
      />
      {rules.length === 0 ? (
        <EmptyState
          icon={<BellRingIcon />}
          title="Nenhuma regra cadastrada"
          description="Sugestão: comece com “Sem comunicação por 10 min” para todos os medidores e um limite de demanda na entrada geral."
        />
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li key={rule.id}>
              <Link
                href={`${base}/${rule.id}`}
                className="surface flex flex-col gap-2 p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{rule.name}</span>
                    <SeverityBadge severity={rule.severity} />
                    {!rule.enabled && <Badge variant="outline">Desativada</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {describeRule(rule)} · {rule.meter ? meterLabel(rule.meter) : "Todos os medidores"}
                  </p>
                </div>
                {rule._count.alarms > 0 && (
                  <span className="text-xs font-medium text-warning">{rule._count.alarms} alarme(s) ativo(s)</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
