import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { BRAND } from "@/config/app";
import { db } from "@/server/db";

/** Tag de cache da identidade visual pública de um cliente. */
export const brandingTag = (slug: string) => `tenant-branding:${slug}`;

export function tenantLogoUrl(slug: string, version: number | null): string {
  return version ? `/api/tenants/${slug}/logo?v=${version}` : BRAND.logo;
}

export type TenantBranding = {
  slug: string;
  name: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  loginTagline: string | null;
};

/**
 * Identidade visual pública do cliente (tela de login). Em cache por algumas
 * horas; a administração invalida a tag ao salvar o cliente.
 */
export async function getTenantBranding(slug: string): Promise<TenantBranding | null> {
  "use cache";
  cacheTag(brandingTag(slug));
  cacheLife("hours");

  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: {
      slug: true,
      name: true,
      active: true,
      primaryColor: true,
      accentColor: true,
      loginTagline: true,
      logo: { select: { updatedAt: true } },
    },
  });
  if (!tenant?.active) return null;

  return {
    slug: tenant.slug,
    name: tenant.name,
    logoUrl: tenantLogoUrl(tenant.slug, tenant.logo?.updatedAt.getTime() ?? null),
    primaryColor: tenant.primaryColor,
    accentColor: tenant.accentColor,
    loginTagline: tenant.loginTagline,
  };
}
