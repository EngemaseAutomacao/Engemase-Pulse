import type { Metadata } from "next";
import { HelpCenter } from "@/components/help/help-center";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { FAQ, HELP_SECTIONS } from "@/content/help";
import { requireTenant } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Ajuda" };

export default async function HelpPage({ params }: PageProps<"/app/[tenant]/ajuda">) {
  const { tenant: slug } = await params;
  const { tenant, user } = await requireTenant(slug);
  const admin = user.isPlatformAdmin;
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Ajuda" description="Manual do usuário e perguntas frequentes sobre cada tela do sistema." />
      <HelpCenter
        sections={HELP_SECTIONS.filter((s) => admin || !s.adminOnly)}
        faq={FAQ.filter((f) => admin || !f.adminOnly)}
        base={`/app/${tenant.slug}`}
        tvHref={`/tv/${tenant.slug}`}
      />
    </PageContainer>
  );
}
