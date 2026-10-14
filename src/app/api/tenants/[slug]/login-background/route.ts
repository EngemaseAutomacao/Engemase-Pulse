import type { NextRequest } from "next/server";
import { db } from "@/server/db";

/**
 * Imagem de fundo da tela de login do cliente (pública, como o logo).
 * Com `?v=<versão>` a resposta é imutável e pode ficar em cache por um ano.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tenants/[slug]/login-background">) {
  const { slug } = await ctx.params;
  const image = await db.tenantLoginBackground.findFirst({
    where: { tenant: { slug, active: true } },
    select: { data: true, mimeType: true },
  });
  if (!image) return new Response("Não encontrado", { status: 404 });

  const versioned = request.nextUrl.searchParams.has("v");
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
