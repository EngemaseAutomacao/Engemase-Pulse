import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/config/app";

/**
 * Checagem otimista: sem cookie de sessão nem adianta renderizar as áreas
 * logadas — manda direto para o login, guardando o destino em ?next=.
 * A validação de verdade (sessão no banco, permissões) acontece no DAL.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/", "/app/:path*", "/admin/:path*"],
};
