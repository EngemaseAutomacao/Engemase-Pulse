import type { Metadata } from "next";
import { HelpCenter } from "@/components/help/help-center";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { FAQ, HELP_SECTIONS } from "@/content/help";
import { requirePlatformAdmin } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Ajuda" };

/** Ajuda para a equipe da plataforma: o manual do cliente mais a parte da administração. */
export default async function AdminHelpPage() {
  await requirePlatformAdmin();
  const sections = [...HELP_SECTIONS.filter((s) => s.adminOnly), ...HELP_SECTIONS.filter((s) => !s.adminOnly)];
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        title="Ajuda"
        description="Administração da plataforma e o manual que os clientes veem (abra a Ajuda dentro de um cliente para os links das telas)."
      />
      <HelpCenter sections={sections} faq={FAQ} base={null} tvHref={null} />
    </PageContainer>
  );
}
