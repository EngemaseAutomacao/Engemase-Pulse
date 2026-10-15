import { brandRootCss } from "@/lib/color";

/**
 * Cores do cliente na raiz da página. O wrapper com .brand-theme cobre o
 * conteúdo; isto cobre o que abre em portal no <body> (menus, listas,
 * janelas, a gaveta do menu no celular). Sai junto com o layout ao navegar
 * para outra área. Os valores são hexadecimais validados (ver brandRootCss).
 */
export function BrandRootStyle({ primary, accent }: { primary: string; accent: string }) {
  const css = brandRootCss(primary, accent);
  return css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null;
}
