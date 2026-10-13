import type { Metadata } from "next";
import { AccountPage } from "@/components/account/account-page";
import { requirePlatformAdmin } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AdminAccountPage() {
  const user = await requirePlatformAdmin();
  return <AccountPage user={user} />;
}
