import type { CSSProperties } from "react";

const DARK_TEXT = "#0c2340";
const LIGHT_TEXT = "#ffffff";

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: number, b: number): number {
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/** Texto (escuro ou branco) com melhor contraste sobre a cor informada. */
export function readableTextOn(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return DARK_TEXT;
  const background = relativeLuminance(hex);
  return contrastRatio(background, relativeLuminance(DARK_TEXT)) >= contrastRatio(background, 1)
    ? DARK_TEXT
    : LIGHT_TEXT;
}

/**
 * Variáveis CSS que aplicam as cores de um cliente sobre o tema base.
 * Basta colocar o resultado no `style` de um elemento que envolve a área.
 */
export function brandThemeStyle(primary: string, accent: string): CSSProperties {
  const onPrimary = readableTextOn(primary);
  return {
    "--primary": primary,
    "--primary-foreground": onPrimary,
    "--ring": primary,
    "--brand-accent": accent,
    "--accent": `color-mix(in oklab, ${primary} 14%, transparent)`,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": onPrimary,
    "--sidebar-accent": `color-mix(in oklab, ${primary} 14%, transparent)`,
  } as CSSProperties;
}
