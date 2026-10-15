import type { CSSProperties } from "react";

const DARK_TEXT = "#0c2340";
const LIGHT_TEXT = "#ffffff";

const HEX = /^#[0-9a-f]{6}$/i;

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: number, b: number): number {
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/** Texto (escuro ou branco) com melhor contraste sobre a cor informada. */
export function readableTextOn(hex: string): string {
  if (!HEX.test(hex)) return DARK_TEXT;
  const background = relativeLuminance(hex);
  return contrastRatio(background, relativeLuminance(DARK_TEXT)) >= contrastRatio(background, 1)
    ? DARK_TEXT
    : LIGHT_TEXT;
}

// ---------------------------------------------------------------------------
// OKLCH (Björn Ottosson): escurecer sem mudar o tom da cor.
// ---------------------------------------------------------------------------

function hexToOklch(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** Cor OKLCH em sRGB linear; null se ela não existe em sRGB (fora da gama). */
function oklchToLinearRgb(L: number, C: number, h: number): [number, number, number] | null {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb: [number, number, number] = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4) ? rgb : null;
}

function linearRgbToHex(rgb: [number, number, number]): string {
  return `#${rgb
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, fromLinear(c))) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * Luminância máxima da cor principal no tema claro: com ela, texto na cor
 * passa de 4,5:1 tanto no branco dos cartões quanto no fundo cinza-claro
 * (#f3f6f9), e o texto branco sobre botões também.
 */
const LIGHT_THEME_MAX_LUMINANCE = 0.165;

/**
 * Versão da cor do cliente para o tema claro. Turquesa, amarelo e outras
 * cores claras somem como texto sobre branco: aqui a cor é escurecida em
 * OKLCH (mesmo tom, menos luminosidade, menos croma só se precisar para
 * caber em sRGB) até ter contraste de leitura. Cores já escuras não mudam.
 */
export function primaryForLightTheme(hex: string): string {
  if (!HEX.test(hex)) return hex;
  if (relativeLuminance(hex) <= LIGHT_THEME_MAX_LUMINANCE) return hex.toLowerCase();
  const [L0, C0, h] = hexToOklch(hex);
  for (let L = L0; L > 0; L -= 0.005) {
    // Maior croma que ainda cabe em sRGB nesta luminosidade.
    let low = 0;
    let high = C0;
    let rgb = oklchToLinearRgb(L, 0, h);
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      const candidate = oklchToLinearRgb(L, mid, h);
      if (candidate) {
        low = mid;
        rgb = candidate;
      } else {
        high = mid;
      }
    }
    if (!rgb) continue;
    const out = linearRgbToHex(rgb);
    if (relativeLuminance(out) <= LIGHT_THEME_MAX_LUMINANCE) return out;
  }
  return DARK_TEXT;
}

/** Classe que recalcula as cores derivadas da marca no elemento (ver globals.css). */
export const BRAND_THEME_CLASS = "brand-theme";

/** As variáveis --brand-* de um cliente (cores inválidas voltam para o padrão do CSS). */
function brandVariables(primary: string, accent: string): Record<string, string> {
  const vars: Record<string, string> = {};
  if (HEX.test(primary)) {
    const light = primaryForLightTheme(primary);
    vars["--brand-primary"] = primary.toLowerCase();
    vars["--brand-on-primary"] = readableTextOn(primary);
    vars["--brand-primary-light"] = light;
    vars["--brand-on-primary-light"] = readableTextOn(light);
  }
  if (HEX.test(accent)) {
    // Mesmo ajuste da principal: destaque claro some sobre o branco.
    vars["--brand-accent"] = accent.toLowerCase();
    vars["--brand-accent-light"] = primaryForLightTheme(accent);
  }
  return vars;
}

/**
 * Variáveis CSS com as cores de um cliente. Vão no `style` de um elemento que
 * também tenha a classe BRAND_THEME_CLASS: o CSS escolhe a versão escura ou
 * clara de cada cor conforme o tema e deriva botões, foco e destaques dela.
 */
export function brandThemeStyle(primary: string, accent: string): CSSProperties {
  return brandVariables(primary, accent) as CSSProperties;
}

/**
 * As mesmas variáveis para a página inteira (`html:root`). Menus, listas,
 * janelas e a gaveta do celular abrem fora da árvore da página (portal no
 * <body>) e só herdam a cor do cliente se ela estiver na raiz.
 */
export function brandRootCss(primary: string, accent: string): string {
  const declarations = Object.entries(brandVariables(primary, accent))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  return declarations ? `html:root{${declarations}}` : "";
}
