import type { Metadata } from "next";
import { AccountPage } from "@/components/account/account-page";
import { requireTenant } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Minha conta" };

export default async function TenantAccountPage({ params }: PageProps<"/app/[tenant]/conta">) {
  const { tenant } = await params;
  const { user } = await requireTenant(tenant);
  return <AccountPage user={user} />;
}
