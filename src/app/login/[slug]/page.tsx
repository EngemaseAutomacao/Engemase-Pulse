import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { DEFAULT_LOGIN_BRAND, LoginScreen } from "@/components/auth/login-screen";
import { getTenantBranding } from "@/server/branding";

export const metadata: Metadata = { title: "Entrar" };

/** Login com a identidade visual do cliente: /login/<slug>. */
export default function TenantLoginPage({ params }: PageProps<"/login/[slug]">) {
  return (
    <Suspense fallback={<LoginScreen brand={DEFAULT_LOGIN_BRAND}>{null}</LoginScreen>}>
      <TenantLogin params={params} />
    </Suspense>
  );
}

async function TenantLogin({ params }: { params: PageProps<"/login/[slug]">["params"] }) {
  const { slug } = await params;
  const branding = await getTenantBranding(slug);
  if (!branding) notFound();

  return (
    <LoginScreen
      brand={{
        name: branding.name,
        logoUrl: branding.logoUrl,
        tagline: branding.loginTagline ?? DEFAULT_LOGIN_BRAND.tagline,
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
      }}
    >
      <Suspense>
        <LoginForm defaultNext={`/app/${branding.slug}`} />
      </Suspense>
    </LoginScreen>
  );
}
