import { Suspense } from "react";
import {
  ArrowLeftRightIcon,
  BellIcon,
  ChartColumnIcon,
  GaugeIcon,
  GitCompareArrowsIcon,
  LayoutDashboardIcon,
  NetworkIcon,
  ReceiptTextIcon,
  ShieldIcon,
  UsersIcon,
} from "lucide-react";
import { AppShell, type NavSection } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import { BRAND_THEME_CLASS, brandThemeStyle } from "@/lib/color";
import { BrandRootStyle } from "@/components/shell/brand-root-style";
import { requireTenant } from "@/server/auth/dal";
import { ROLE_LABEL } from "@/server/auth/permissions";
import { tenantLogoUrl } from "@/server/branding";
import { countActiveAlarms } from "@/server/queries/alarms";

/** Área do cliente: barra lateral com a marca e as cores dele. */
export default function TenantLayout({ children, params }: LayoutProps<"/app/[tenant]">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <TenantShell params={params}>{children}</TenantShell>
    </Suspense>
  );
}

async function TenantShell({
  params,
  children,
}: {
  params: LayoutProps<"/app/[tenant]">["params"];
  children: React.ReactNode;
}) {
  const { tenant: slug } = await params;
  const { tenant, user, role } = await requireTenant(slug);
  const base = `/app/${tenant.slug}`;
  const activeAlarms = await countActiveAlarms(tenant.id);

  const sections: NavSection[] = [
    {
      label: "Monitoramento",
      items: [
        { label: "Visão geral", href: base, icon: <LayoutDashboardIcon />, exact: true },
        { label: "Medidores", href: `${base}/medidores`, icon: <GaugeIcon /> },
        { label: "Unifilar", href: `${base}/unifilar`, icon: <NetworkIcon /> },
        { label: "Consumo", href: `${base}/consumo`, icon: <ChartColumnIcon /> },
        { label: "Fatura", href: `${base}/fatura`, icon: <ReceiptTextIcon /> },
        { label: "Comparar", href: `${base}/comparar`, icon: <GitCompareArrowsIcon /> },
        { label: "Alarmes", href: `${base}/alarmes`, icon: <BellIcon />, badge: activeAlarms },
      ],
    },
  ];
  if (role === "ADMIN") {
    sections.push({
      label: "Gestão",
      items: [{ label: "Usuários", href: `${base}/usuarios`, icon: <UsersIcon /> }],
    });
  }
  if (user.isPlatformAdmin) {
    sections.push({
      label: "Plataforma",
      items: [{ label: "Administração", href: "/admin", icon: <ShieldIcon /> }],
    });
  }

  const canSwitchTenant = user.isPlatformAdmin || user.memberships.length > 1;

  return (
    <div className={BRAND_THEME_CLASS} style={brandThemeStyle(tenant.primaryColor, tenant.accentColor)}>
      <BrandRootStyle primary={tenant.primaryColor} accent={tenant.accentColor} />
      <AppShell
        brand={{
          name: tenant.name,
          logoUrl: tenantLogoUrl(tenant.slug, tenant.logoVersion),
          href: base,
          subtitle: "Monitoramento de energia",
        }}
        sections={sections}
        user={{
          name: user.name,
          email: user.email,
          subtitle: user.isPlatformAdmin ? "Equipe da plataforma" : ROLE_LABEL[role],
        }}
        accountHref={`${base}/conta`}
        extraMenu={
          canSwitchTenant ? [{ label: "Trocar de cliente", href: "/app", icon: <ArrowLeftRightIcon /> }] : undefined
        }
      >
        {children}
      </AppShell>
    </div>
  );
}
