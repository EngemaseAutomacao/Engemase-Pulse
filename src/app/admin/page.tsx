import type { Metadata } from "next";
import Link from "next/link";
import { BellRingIcon, Building2Icon, GaugeIcon, MapPinIcon, TriangleAlertIcon, UsersIcon } from "lucide-react";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getEvaluatorHealth, type EvaluatorStatus } from "@/server/alarms/engine";
import { requirePlatformAdmin } from "@/server/auth/dal";
import { getCache } from "@/server/cache";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Administração" };

const ACTION_LABEL: Record<string, string> = {
  create: "criou",
  update: "alterou",
  delete: "excluiu",
  "reset-password": "redefiniu a senha de",
};
const ENTITY_LABEL: Record<string, string> = {
  tenant: "cliente",
  site: "unidade",
  meter: "medidor",
  user: "usuário",
  "alarm-rule": "regra de alarme",
};

export default async function AdminHomePage() {
  await requirePlatformAdmin();
  const [tenants, sites, meters, users, recent, evaluator] = await Promise.all([
    db.tenant.count(),
    db.site.count(),
    db.meter.count({ where: { active: true } }),
    db.user.count({ where: { active: true } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    getEvaluatorHealth(),
  ]);
  const rulesExist = (await db.alarmRule.count({ where: { enabled: true } })) > 0;
  const actorIds = [...new Set(recent.map((r) => r.actorId).filter((id): id is string => Boolean(id)))];
  const actors = new Map(
    (await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );

  return (
    <PageContainer>
      <PageHeader title="Administração" description="Cadastros de clientes, unidades, medidores e usuários." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/admin/clientes">
          <StatTile label="Clientes" value={String(tenants)} icon={<Building2Icon />} className="hover:border-primary/40" />
        </Link>
        <Link href="/admin/unidades">
          <StatTile label="Unidades" value={String(sites)} icon={<MapPinIcon />} className="hover:border-primary/40" />
        </Link>
        <Link href="/admin/medidores">
          <StatTile label="Medidores ativos" value={String(meters)} icon={<GaugeIcon />} className="hover:border-primary/40" />
        </Link>
        <Link href="/admin/usuarios">
          <StatTile label="Usuários ativos" value={String(users)} icon={<UsersIcon />} className="hover:border-primary/40" />
        </Link>
      </div>

      <EvaluatorCard status={evaluator.status} stale={evaluator.stale} rulesExist={rulesExist} sharedCache={getCache().shared} />

      <section className="surface overflow-hidden">
        <h2 className="border-b px-4 py-3 font-semibold">Alterações recentes</h2>
        {recent.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Quem</TableHead>
                <TableHead>O quê</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((entry) => (
                <TableRow key={entry.id.toString()}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell>{(entry.actorId && actors.get(entry.actorId)) ?? "—"}</TableCell>
                  <TableCell>
                    {ACTION_LABEL[entry.action] ?? entry.action} {ENTITY_LABEL[entry.entityType] ?? entry.entityType}{" "}
                    <span className="text-muted-foreground">{describe(entry.details)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </PageContainer>
  );
}

function describe(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  const d = details as Record<string, unknown>;
  const label = d.name ?? d.tag ?? d.email;
  return typeof label === "string" ? `“${label}”` : "";
}

/** "Vigia do vigia": mostra se o avaliador de alarmes está rodando. */
function EvaluatorCard({
  status,
  stale,
  rulesExist,
  sharedCache,
}: {
  status: EvaluatorStatus | null;
  stale: boolean;
  rulesExist: boolean;
  sharedCache: boolean;
}) {
  const warn = rulesExist && stale;
  return (
    <section className={warn ? "surface space-y-2 border-warning/40 p-4" : "surface space-y-2 p-4"}>
      <h2 className="flex items-center gap-2 font-semibold">
        {warn ? <TriangleAlertIcon className="size-4 text-warning" /> : <BellRingIcon className="size-4 text-primary" />}
        Avaliador de alarmes
      </h2>
      {status ? (
        <p className="text-sm text-muted-foreground">
          Última execução: {formatDateTime(status.at)} · {status.evaluated} de {status.tenants} cliente(s) em{" "}
          {formatNumber(status.durationMs / 1000, 1)} s · {status.opened} aberto(s), {status.cleared} normalizado(s)
          {status.deferred > 0 && ` · ${status.deferred} ficaram para a próxima execução`}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Ainda não executou{sharedCache ? "" : " nesta instância"}.</p>
      )}
      {warn && (
        <p className="text-sm text-warning">
          Há regras ativas, mas o avaliador não roda há mais de 20 min. Confira o agendamento (Cron da Vercel, QStash ou
          GitHub Actions) — veja o README.
        </p>
      )}
      {!sharedCache && (
        <p className="text-xs text-muted-foreground">
          Sem Redis configurado: o cache fica na memória de cada instância. Em produção, conecte o Upstash Redis.
        </p>
      )}
    </section>
  );
}
