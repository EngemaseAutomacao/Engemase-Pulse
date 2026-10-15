"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { THEME_OPTIONS, isThemePreference, type ThemePreference } from "@/lib/theme";
import { setThemePreference, useTheme } from "./use-theme";

const ICON: Record<ThemePreference, typeof SunIcon> = { system: MonitorIcon, light: SunIcon, dark: MoonIcon };

const THEME_NAME = { light: "claro", dark: "escuro" } as const;

/**
 * O Automático só enxerga o que o navegador informa (prefers-color-scheme).
 * Chrome e Edge têm configuração própria de aparência — e uma opção de forçar
 * escuro nos sites — que passam por cima do Windows; por isso a tela mostra o
 * que o navegador está dizendo e onde mudar.
 */
const BROWSER_FIX =
  "Chrome: ⋮ › Configurações › Aparência › Modo: Dispositivo. Edge: ⋯ › Configurações › Aparência › Aparência geral: Padrão do sistema. Confira também se não há “modo escuro forçado” para sites. No app instalado, feche e abra de novo depois de mudar.";

/** Escolha do tema dentro do menu do usuário. */
export function ThemeMenuItems() {
  const { preference, device } = useTheme();
  return (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Tema</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={preference ?? ""}
        onValueChange={(value) => isThemePreference(value) && setThemePreference(value)}
      >
        {THEME_OPTIONS.map(({ value, label }) => {
          const Icon = ICON[value];
          return (
            <DropdownMenuRadioItem key={value} value={value} onSelect={(e) => e.preventDefault()}>
              <Icon />
              {label}
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
      {preference === "system" && device && (
        <p className="max-w-56 px-2 pt-0.5 pb-1.5 text-xs text-muted-foreground" title={BROWSER_FIX}>
          Seguindo o navegador, que está em modo <span className="font-medium text-foreground">{THEME_NAME[device]}</span>.
          {device === "dark" && " Se o Windows está no claro, veja Minha conta › Aparência."}
        </p>
      )}
    </>
  );
}

/**
 * Seletor Automático / Claro / Escuro em botões. `compact` mostra só os
 * ícones (o nome fica no title e para leitores de tela).
 */
export function ThemeSwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { preference } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={cn("inline-flex flex-wrap rounded-lg border bg-muted/50 p-0.5", className)}
    >
      {THEME_OPTIONS.map(({ value, label, hint }) => {
        const Icon = ICON[value];
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${label}: ${hint}`}
            onClick={() => setThemePreference(value)}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              active && "bg-card text-foreground shadow-sm",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className={cn(compact && "sr-only")}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * O que o Automático está vendo agora. Quando o aparelho diz "claro" mas a
 * pessoa espera escuro, quase sempre é o navegador que força o tema.
 */
export function ThemeStatus() {
  const { preference, theme, device } = useTheme();
  if (!preference || !theme || !device) return <p className="text-sm text-muted-foreground">&nbsp;</p>;
  if (preference === "system") {
    return (
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          Automático segue o que o navegador informa, e agora ele está em modo{" "}
          <span className="font-medium text-foreground">{THEME_NAME[device]}</span>.
        </p>
        <p className="text-xs">
          Se o Windows está em outro tema, o navegador está passando por cima dele. {BROWSER_FIX} Para fixar um
          tema aqui, independente do navegador, escolha Claro ou Escuro.
        </p>
      </div>
    );
  }
  const option = THEME_OPTIONS.find((o) => o.value === preference);
  return (
    <p className="text-sm text-muted-foreground">
      {option?.label}: {option?.hint}. Agora: <span className="font-medium text-foreground">{THEME_NAME[theme]}</span>.
    </p>
  );
}
