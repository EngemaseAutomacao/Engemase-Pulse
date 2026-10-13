import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/dal";
import { homePathFor } from "@/server/auth/permissions";

/** Raiz: leva cada usuário para a sua área (administração, cliente ou seletor). */
export default function HomePage() {
  return (
    <Suspense>
      <RedirectHome />
    </Suspense>
  );
}

async function RedirectHome(): Promise<never> {
  const user = await requireUser();
  redirect(homePathFor(user));
}
