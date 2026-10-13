import type { NextRequest } from "next/server";
import { db } from "@/server/db";

/**
 * Logo do cliente (público: aparece na tela de login personalizada).
 * Com `?v=<versão>` a resposta é imutável e pode ficar em cache por um ano.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tenants/[slug]/logo">) {
  const { slug } = await ctx.params;
  const logo = await db.tenantLogo.findFirst({
    where: { tenant: { slug, active: true } },
    select: { data: true, mimeType: true },
  });
  if (!logo) return new Response("Não encontrado", { status: 404 });

  const versioned = request.nextUrl.searchParams.has("v");
  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.mimeType,
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
