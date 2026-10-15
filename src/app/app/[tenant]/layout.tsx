import { Suspense } from "react";
import {
  ArrowLeftRightIcon,
  BellIcon,
  ChartColumnIcon,
  DropletsIcon,
  FuelIcon,
  GaugeIcon,
  GitCompareArrowsIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  NetworkIcon,
  ReceiptTextIcon,
  ShieldIcon,
  StoreIcon,
  TargetIcon,
  TvIcon,
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
import { getTenantTopology } from "@/server/telemetry/topology";
import { getUtilityCatalog, visibleModules } from "@/server/utilities/catalog";

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
  const [activeAlarms, topology, modules, catalog] = await Promise.all([
    countActiveAlarms(tenant.id),
    getTenantTopology(tenant.id),
    visibleModules(tenant),
    getUtilityCatalog(tenant.id),
  ]);
  const multiSite = topology.filter((s) => s.meters.length > 0).length > 1;
  // Energia some só quando nenhuma unidade tem medidor nem declara o módulo, mas há outro módulo (unidade só de água, p. ex.).
  const hasEnergy =
    topology.some((s) => s.meters.length > 0) || catalog.sites.some((s) => s.declared.includes("energia")) || modules.length === 0;

  const sections: NavSection[] = [
    {
      label: "Monitoramento",
      items: [
        { label: "Visão geral", href: base, icon: <LayoutDashboardIcon />, exact: true },
        { label: "Alarmes", href: `${base}/alarmes`, icon: <BellIcon />, badge: activeAlarms },
        { label: "Tela de TV", href: `/tv/${tenant.slug}`, icon: <TvIcon /> },
      ],
    },
  ];
  if (hasEnergy) {
    sections.push({
      label: "Energia",
      items: [
        { label: "Medidores", href: `${base}/medidores`, icon: <GaugeIcon /> },
        { label: "Unifilar", href: `${base}/unifilar`, icon: <NetworkIcon /> },
        { label: "Consumo", href: `${base}/consumo`, icon: <ChartColumnIcon /> },
        { label: "Fatura", href: `${base}/fatura`, icon: <ReceiptTextIcon /> },
        { label: "Metas", href: `${base}/metas`, icon: <TargetIcon /> },
        ...(multiSite ? [{ label: "Ranking", href: `${base}/ranking`, icon: <StoreIcon /> }] : []),
        { label: "Comparar", href: `${base}/comparar`, icon: <GitCompareArrowsIcon /> },
      ],
    });
  }
  if (modules.length > 0) {
    sections.push({
      label: "Utilidades",
      items: [
        ...(modules.includes("agua") ? [{ label: "Água", href: `${base}/agua`, icon: <DropletsIcon /> }] : []),
        ...(modules.includes("gerador") ? [{ label: "Gerador", href: `${base}/gerador`, icon: <FuelIcon /> }] : []),
      ],
    });
  }
  if (role === "ADMIN") {
    sections.push({
      label: "Gestão",
      items: [{ label: "Usuários", href: `${base}/usuarios`, icon: <UsersIcon /> }],
    });
  }
  sections.push({
    label: "Suporte",
    items: [{ label: "Ajuda", href: `${base}/ajuda`, icon: <LifeBuoyIcon /> }],
  });
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
          subtitle: "Supervisório de utilidades",
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
