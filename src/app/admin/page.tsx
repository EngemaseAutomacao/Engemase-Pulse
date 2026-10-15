import type { Metadata } from "next";
import Link from "next/link";
import { Building2Icon, ChevronRightIcon, GaugeIcon, HeartPulseIcon, MapPinIcon, TriangleAlertIcon, UsersIcon } from "lucide-react";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requirePlatformAdmin } from "@/server/auth/dal";
import { db } from "@/server/db";
import { getSystemHealth } from "@/server/health";

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
  "utility-equipment": "equipamento",
  user: "usuário",
  "alarm-rule": "regra de alarme",
  membership: "acesso de",
};

export default async function AdminHomePage() {
  await requirePlatformAdmin();
  const [tenants, sites, meters, users, recent, health] = await Promise.all([
    db.tenant.count(),
    db.site.count(),
    db.meter.count({ where: { active: true } }),
    db.user.count({ where: { active: true } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    getSystemHealth(),
  ]);
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

      <HealthSummary problems={health.problems} />

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

/** Atalho para a "Saúde do sistema", em destaque quando há algo a resolver. */
function HealthSummary({ problems }: { problems: number }) {
  return (
    <Link
      href="/admin/saude"
      className={
        problems > 0
          ? "surface flex items-center gap-3 border-warning/40 p-4 hover:border-warning"
          : "surface flex items-center gap-3 p-4 hover:border-primary/40"
      }
    >
      {problems > 0 ? (
        <TriangleAlertIcon className="size-5 shrink-0 text-warning" aria-hidden />
      ) : (
        <HeartPulseIcon className="size-5 shrink-0 text-primary" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Saúde do sistema</span>
        <span className="block text-sm text-muted-foreground">
          {problems > 0
            ? `${problems} ponto(s) de atenção: configuração, unidades sem comunicação ou erros.`
            : "Tudo configurado e funcionando."}
        </span>
      </span>
      <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}
