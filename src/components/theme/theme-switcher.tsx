"use client";

import { MonitorIcon, MoonIcon, SunIcon, SunMoonIcon } from "lucide-react";
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { THEME_OPTIONS, isThemePreference, type ThemePreference } from "@/lib/theme";
import { setThemePreference, useTheme } from "./use-theme";

const ICON: Record<ThemePreference, typeof SunIcon> = {
  system: MonitorIcon,
  schedule: SunMoonIcon,
  light: SunIcon,
  dark: MoonIcon,
};

const THEME_NAME = { light: "claro", dark: "escuro" } as const;

/** Escolha do tema dentro do menu do usuário. */
export function ThemeMenuItems() {
  const { preference } = useTheme();
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
    </>
  );
}

/**
 * Seletor Automático / Pelo horário / Claro / Escuro em botões. `compact`
 * mostra só os ícones (o nome fica no title e para leitores de tela).
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
          Automático acompanha o aparelho, que agora informa tema{" "}
          <span className="font-medium text-foreground">{THEME_NAME[device]}</span>.
        </p>
        <p className="text-xs">
          Se não trocar sozinho, confira o tema do navegador (no Chrome: Configurações › Aparência › Modo deve
          estar em &ldquo;Dispositivo&rdquo;) e o do sistema. Para trocar pela hora do dia, use &ldquo;Pelo
          horário&rdquo;.
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
