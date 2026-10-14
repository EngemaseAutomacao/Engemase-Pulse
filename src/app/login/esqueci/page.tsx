import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { DEFAULT_LOGIN_BRAND, LoginScreen } from "@/components/auth/login-screen";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <LoginScreen
      brand={DEFAULT_LOGIN_BRAND}
      title="Esqueci minha senha"
      subtitle="Informe o seu e-mail para receber um link de nova senha."
    >
      <ForgotPasswordForm />
    </LoginScreen>
  );
}
