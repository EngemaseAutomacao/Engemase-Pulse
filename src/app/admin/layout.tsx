import { Suspense } from "react";
import {
  Building2Icon,
  GaugeIcon,
  LayoutDashboardIcon,
  MapPinIcon,
  MonitorIcon,
  UsersIcon,
} from "lucide-react";
import { AppShell, type NavSection } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import { APP_NAME, BRAND } from "@/config/app";
import { requirePlatformAdmin } from "@/server/auth/dal";

const SECTIONS: NavSection[] = [
  {
    label: "Administração",
    items: [
      { label: "Visão geral", href: "/admin", icon: <LayoutDashboardIcon />, exact: true },
      { label: "Clientes", href: "/admin/clientes", icon: <Building2Icon /> },
      { label: "Unidades", href: "/admin/unidades", icon: <MapPinIcon /> },
      { label: "Medidores", href: "/admin/medidores", icon: <GaugeIcon /> },
      { label: "Usuários", href: "/admin/usuarios", icon: <UsersIcon /> },
    ],
  },
  {
    label: "Monitoramento",
    items: [{ label: "Painéis dos clientes", href: "/app", icon: <MonitorIcon /> }],
  },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  return (
    <AppShell
      brand={{ name: APP_NAME, logoUrl: BRAND.logo, href: "/admin", subtitle: "Administração" }}
      sections={SECTIONS}
      user={{ name: user.name, email: user.email, subtitle: "Equipe da plataforma" }}
      accountHref="/admin/conta"
    >
      {children}
    </AppShell>
  );
}
