import type { Metadata } from "next";
import { Suspense } from "react";
import { TvBoard } from "@/components/tv/tv-board";
import { BrandRootStyle } from "@/components/shell/brand-root-style";
import { BRAND_THEME_CLASS, brandThemeStyle } from "@/lib/color";
import { requireTenant } from "@/server/auth/dal";
import { tenantLogoUrl } from "@/server/branding";
import { listTenantMeters } from "@/server/queries/meters";

export const metadata: Metadata = { title: "Tela de TV" };

/**
 * Tela de TV / sala de controle: sem menu, números grandes e telas que
 * alternam sozinhas. Parâmetros: ?tempo=20 (segundos por tela).
 */
export default function TvPage(props: PageProps<"/tv/[tenant]">) {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center text-muted-foreground">Carregando…</div>}>
      <Tv {...props} />
    </Suspense>
  );
}

async function Tv({ params, searchParams }: PageProps<"/tv/[tenant]">) {
  const { tenant: slug } = await params;
  const { tempo } = await searchParams;
  const { tenant } = await requireTenant(slug);
  const { sites, meters } = await listTenantMeters(tenant.id);
  const seconds = Math.min(300, Math.max(5, Number(tempo) || 20));
  return (
    <div className={BRAND_THEME_CLASS} style={brandThemeStyle(tenant.primaryColor, tenant.accentColor)}>
      <BrandRootStyle primary={tenant.primaryColor} accent={tenant.accentColor} />
      <TvBoard
        tenant={{ slug: tenant.slug, name: tenant.name, logoUrl: tenantLogoUrl(tenant.slug, tenant.logoVersion) }}
        sites={sites}
        meters={meters}
        seconds={seconds}
      />
    </div>
  );
}
