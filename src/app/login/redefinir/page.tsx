import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DEFAULT_LOGIN_BRAND, LoginScreen } from "@/components/auth/login-screen";
import { ResetPasswordForm } from "@/components/auth/password-forms";
import { findValidPasswordToken } from "@/server/auth/password-token";

export const metadata: Metadata = { title: "Definir senha", referrer: "no-referrer" };

/** Link de uso único (esqueci a senha ou convite): mostra de quem é e pede a senha nova. */
export default function ResetPasswordPage({ searchParams }: PageProps<"/login/redefinir">) {
  return (
    <Suspense
      fallback={
        <LoginScreen brand={DEFAULT_LOGIN_BRAND} title="Definir senha">
          {null}
        </LoginScreen>
      }
    >
      <ResetPassword searchParams={searchParams} />
    </Suspense>
  );
}

async function ResetPassword({ searchParams }: { searchParams: PageProps<"/login/redefinir">["searchParams"] }) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  const row = await findValidPasswordToken(value);

  if (!row) {
    return (
      <LoginScreen
        brand={DEFAULT_LOGIN_BRAND}
        title="Link inválido"
        subtitle="Este link venceu, já foi usado ou está incompleto."
      >
        <div className="grid gap-3 text-sm">
          <Link href="/login/esqueci" className="font-medium text-primary underline-offset-4 hover:underline">
            Pedir um novo link
          </Link>
          <Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">
            Voltar para o login
          </Link>
        </div>
      </LoginScreen>
    );
  }

  return (
    <LoginScreen
      brand={DEFAULT_LOGIN_BRAND}
      title={row.purpose === "invite" ? "Defina a sua senha" : "Criar nova senha"}
      subtitle={`${row.user.name} · ${row.user.email}`}
    >
      <ResetPasswordForm token={value} />
    </LoginScreen>
  );
}
