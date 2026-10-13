import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { DEFAULT_LOGIN_BRAND, LoginScreen } from "@/components/auth/login-screen";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <LoginScreen brand={DEFAULT_LOGIN_BRAND}>
      {/* O formulário lê ?next= da URL, então fica atrás de Suspense. */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </LoginScreen>
  );
}
