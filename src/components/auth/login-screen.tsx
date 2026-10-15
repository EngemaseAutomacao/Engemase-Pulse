import Image from "next/image";
import { ActivityIcon, BarChart3Icon, Building2Icon } from "lucide-react";
import { APP_NAME, APP_TAGLINE, BRAND } from "@/config/app";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { BRAND_THEME_CLASS, brandThemeStyle } from "@/lib/color";
import { BrandRootStyle } from "@/components/shell/brand-root-style";
import { cn } from "@/lib/utils";

export type LoginBrand = {
  name: string;
  logoUrl: string;
  /** Foto do lado esquerdo; sem ela fica o fundo padrão com a marca d'água. */
  backgroundUrl?: string | null;
  tagline: string;
  primaryColor: string;
  accentColor: string;
};

export const DEFAULT_LOGIN_BRAND: LoginBrand = {
  name: APP_NAME,
  logoUrl: BRAND.logo,
  tagline: "Acompanhe tensão, corrente, potência e consumo dos seus multimedidores em tempo real.",
  primaryColor: BRAND.primaryColor,
  accentColor: BRAND.accentColor,
};

const FEATURES = [
  { icon: ActivityIcon, text: "Leituras ao vivo de cada multimedidor" },
  { icon: BarChart3Icon, text: "Histórico e consumo por hora, dia e mês" },
  { icon: Building2Icon, text: "Todas as unidades em um só lugar" },
];

/** Tela de login em duas colunas: marca à esquerda, formulário à direita. */
export function LoginScreen({
  brand,
  children,
  title = "Entrar",
  subtitle = "Use o e-mail e a senha cadastrados para você.",
}: {
  brand: LoginBrand;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  return (
    <main
      className={cn("grid min-h-dvh lg:grid-cols-[1.1fr_1fr]", BRAND_THEME_CLASS)}
      style={brandThemeStyle(brand.primaryColor, brand.accentColor)}
    >
      <BrandRootStyle primary={brand.primaryColor} accent={brand.accentColor} />
      <section className="relative hidden overflow-hidden bg-sidebar p-12 lg:flex lg:flex-col lg:justify-between">
        {brand.backgroundUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- imagem do cliente vem do banco */}
            <img
              src={brand.backgroundUrl}
              alt=""
              aria-hidden
              fetchPriority="high"
              className="pointer-events-none absolute inset-0 size-full object-cover"
            />
            {/* Escurece mais embaixo, onde fica o texto, e deixa a foto aparecer em cima. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, var(--sidebar) 0%, color-mix(in oklab, var(--sidebar) 90%, transparent) 50%, color-mix(in oklab, var(--sidebar) 78%, transparent) 75%, color-mix(in oklab, var(--sidebar) 50%, transparent) 100%)",
              }}
            />
          </>
        ) : (
          <Image
            src={BRAND.watermark}
            alt=""
            width={373}
            height={252}
            loading="eager"
            aria-hidden
            className="pointer-events-none absolute -right-24 bottom-10 w-[34rem] max-w-none opacity-[0.07]"
          />
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 10%, color-mix(in oklab, var(--primary) 28%, transparent), transparent 70%), radial-gradient(50% 45% at 90% 90%, color-mix(in oklab, var(--brand-accent) 22%, transparent), transparent 70%)",
          }}
        />

        <div className="relative flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo do cliente vem do banco */}
          <img src={brand.logoUrl} alt="" className="size-12 rounded-full bg-white/5 object-contain" />
          <span className="font-heading text-2xl font-bold tracking-tight text-primary">{brand.name}</span>
        </div>

        <div className="relative max-w-md space-y-8">
          <h1 className="text-4xl leading-tight font-bold">Sua instalação sob controle, em tempo real.</h1>
          <p className="text-lg text-muted-foreground">{brand.tagline}</p>
          <ul className="space-y-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-foreground/80">
                <span className="grid size-8 place-items-center rounded-lg bg-accent text-primary">
                  <Icon className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          {APP_NAME} · {APP_TAGLINE}
        </p>
      </section>

      <section className="relative flex items-center justify-center px-4 py-12 sm:px-8">
        <ThemeSwitcher compact className="absolute top-4 right-4" />
        <div className="w-full max-w-sm space-y-8">
          <div className="flex items-center gap-3 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo do cliente vem do banco */}
            <img src={brand.logoUrl} alt="" className="size-10 rounded-full object-contain" />
            <span className="font-heading text-xl font-bold text-primary">{brand.name}</span>
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
