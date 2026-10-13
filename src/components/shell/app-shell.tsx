"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDownIcon, DownloadIcon, LogOutIcon, UserRoundIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useInstallPrompt } from "@/components/pwa/pwa-provider";
import { logout } from "@/app/login/actions";
import { initials } from "@/lib/format";

export type NavItem = {
  label: string;
  href: string;
  /** Elemento do ícone (criado no servidor, ex.: <GaugeIcon />). */
  icon: React.ReactNode;
  /** Ativo só quando a URL é exatamente esta (páginas "índice"). */
  exact?: boolean;
  /** Contador ao lado do item (ex.: alarmes ativos). */
  badge?: number;
};

export type NavSection = { label: string; items: NavItem[] };

export type ShellUser = { name: string; email: string; subtitle: string };

export function AppShell({
  brand,
  sections,
  user,
  accountHref,
  extraMenu,
  children,
}: {
  brand: { name: string; logoUrl: string; href: string; subtitle?: string };
  sections: NavSection[];
  user: ShellUser;
  accountHref: string;
  /** Itens extras no menu do usuário (ex.: trocar de cliente). */
  extraMenu?: { label: string; href: string; icon: React.ReactNode }[];
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <ShellLayout brand={brand} sections={sections} user={user} accountHref={accountHref} extraMenu={extraMenu}>
        {children}
      </ShellLayout>
    </SidebarProvider>
  );
}

/** Separado do AppShell para poder usar o contexto da barra lateral (fechar no celular). */
function ShellLayout({
  brand,
  sections,
  user,
  accountHref,
  extraMenu,
  children,
}: React.ComponentProps<typeof AppShell>) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const install = useInstallPrompt();
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-3">
          <Link href={brand.href} className="flex items-center gap-3 rounded-lg p-1 outline-none">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo do cliente vem do banco */}
            <img src={brand.logoUrl} alt="" className="size-9 shrink-0 rounded-full object-contain" />
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate font-heading text-base font-bold text-sidebar-primary">
                {brand.name}
              </span>
              {brand.subtitle && (
                <span className="block truncate text-xs text-sidebar-foreground/50">{brand.subtitle}</span>
              )}
            </span>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          {sections.map((section) => (
            <SidebarGroup key={section.label}>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.label}>
                        <Link href={item.href} onClick={closeMobile}>
                          {item.icon}
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {!!item.badge && (
                        <SidebarMenuBadge className="bg-destructive/15 text-destructive" aria-label={`${item.badge} ativo(s)`}>
                          {item.badge > 99 ? "99+" : item.badge}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                      {initials(user.name)}
                    </span>
                    <span className="grid min-w-0 flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-semibold">{user.name}</span>
                      <span className="truncate text-xs text-sidebar-foreground/50">{user.subtitle}</span>
                    </span>
                    <ChevronsUpDownIcon className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
                  <DropdownMenuLabel className="font-normal">
                    <span className="block truncate text-sm font-medium">{user.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={accountHref} onClick={closeMobile}>
                      <UserRoundIcon />
                      Minha conta
                    </Link>
                  </DropdownMenuItem>
                  {extraMenu?.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href} onClick={closeMobile}>
                        {item.icon}
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  {install && (
                    <DropdownMenuItem onSelect={() => void install()}>
                      <DownloadIcon />
                      Instalar aplicativo
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <form action={logout}>
                    <DropdownMenuItem asChild>
                      <button type="submit" className="w-full">
                        <LogOutIcon />
                        Sair
                      </button>
                    </DropdownMenuItem>
                  </form>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-12 items-center gap-2 border-b bg-background/80 px-3 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <SidebarTrigger />
          <span className="truncate font-heading text-sm font-semibold">{brand.name}</span>
        </header>
        {children}
      </SidebarInset>
    </>
  );
}
