"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BellIcon,
  BookOpenIcon,
  ChartColumnIcon,
  CircleUserRoundIcon,
  GaugeIcon,
  GitCompareArrowsIcon,
  LayoutDashboardIcon,
  LightbulbIcon,
  MailIcon,
  NetworkIcon,
  ReceiptTextIcon,
  RocketIcon,
  SearchIcon,
  ShieldIcon,
  StoreIcon,
  TargetIcon,
  TvIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { FaqItem, HelpBlock, HelpIcon, HelpSection } from "@/content/help";
import { cn } from "@/lib/utils";

const ICONS: Record<HelpIcon, LucideIcon> = {
  start: RocketIcon,
  overview: LayoutDashboardIcon,
  meters: GaugeIcon,
  history: GaugeIcon,
  "single-line": NetworkIcon,
  consumption: ChartColumnIcon,
  bill: ReceiptTextIcon,
  targets: TargetIcon,
  stores: StoreIcon,
  compare: GitCompareArrowsIcon,
  alarms: BellIcon,
  notices: MailIcon,
  tv: TvIcon,
  users: UsersIcon,
  account: CircleUserRoundIcon,
  admin: ShieldIcon,
};

/** Sem acento e em minúsculas, para a busca achar "fatura" em "Fatura" e "agua" em "água". */
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const blockText = (block: HelpBlock) => ("text" in block ? block.text : block.items.join(" "));

/** Texto com **negrito**. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-foreground">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * Central de ajuda: busca, atalhos para as seções, perguntas frequentes e o
 * manual de cada tela. A busca filtra perguntas e seções na hora.
 */
export function HelpCenter({
  sections,
  faq,
  base,
  tvHref,
}: {
  sections: HelpSection[];
  faq: FaqItem[];
  /** /app/<cliente>, para os links "Abrir a tela"; null na administração. */
  base: string | null;
  tvHref: string | null;
}) {
  const [query, setQuery] = useState("");
  const needle = normalize(query.trim());
  const matches = (text: string) => !needle || normalize(text).includes(needle);
  const questions = faq.filter((f) => matches(`${f.question} ${f.answer.join(" ")}`));
  const chapters = sections.filter((s) => matches(`${s.title} ${s.summary} ${s.blocks.map(blockText).join(" ")}`));
  const hrefOf = (section: HelpSection) =>
    section.path === undefined ? null : section.path === "@tv" ? tvHref : base === null ? null : `${base}${section.path}`;

  return (
    <div className="space-y-8">
      <div className="relative max-w-xl">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar na ajuda (ex.: demanda, senha, Telegram)"
          aria-label="Buscar na ajuda"
          className="h-10 pl-9"
        />
      </div>

      {!needle && (
        <nav aria-label="Seções do manual" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => {
            const Icon = ICONS[section.icon];
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="surface flex gap-3 p-4 transition-colors hover:border-primary/40"
              >
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium">{section.title}</span>
                  <span className="block text-sm text-muted-foreground">{section.summary}</span>
                </span>
              </a>
            );
          })}
        </nav>
      )}

      <section aria-labelledby="faq-title" className="space-y-3">
        <h2 id="faq-title" className="flex items-center gap-2 text-lg font-semibold">
          <LightbulbIcon className="size-5 text-primary" aria-hidden />
          Perguntas frequentes
          {needle && <span className="text-sm font-normal text-muted-foreground">({questions.length})</span>}
        </h2>
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma pergunta com esse termo.</p>
        ) : (
          <div className="divide-y surface">
            {questions.map((item) => (
              <details key={item.id} id={`faq-${item.id}`} className="group px-4 py-3" open={Boolean(needle) && questions.length <= 3}>
                <summary className="cursor-pointer list-none font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="flex items-start justify-between gap-3">
                    {item.question}
                    <ArrowRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
                  </span>
                </summary>
                <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                  {item.answer.map((paragraph, i) => (
                    <p key={i}>
                      <Rich text={paragraph} />
                    </p>
                  ))}
                  {item.section && sections.some((s) => s.id === item.section) && (
                    <a href={`#${item.section}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      Ver no manual
                      <ArrowRightIcon className="size-3" aria-hidden />
                    </a>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="manual-title" className="space-y-4">
        <h2 id="manual-title" className="flex items-center gap-2 text-lg font-semibold">
          <BookOpenIcon className="size-5 text-primary" aria-hidden />
          Manual do usuário
          {needle && <span className="text-sm font-normal text-muted-foreground">({chapters.length})</span>}
        </h2>
        {chapters.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma seção com esse termo.</p>}
        {chapters.map((section) => {
          const Icon = ICONS[section.icon];
          const href = hrefOf(section);
          return (
            <article key={section.id} id={section.id} className="surface scroll-mt-20 space-y-3 p-5">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <Icon className="size-5 text-primary" aria-hidden />
                  {section.title}
                </h3>
                {href && (
                  <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                    Abrir a tela
                    <ArrowRightIcon className="size-3.5" aria-hidden />
                  </Link>
                )}
              </header>
              {section.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </article>
          );
        })}
      </section>

      <p className="text-sm text-muted-foreground">
        Não achou a resposta? Fale com o administrador da sua empresa ou com a equipe da Engemase.
      </p>
    </div>
  );
}

function Block({ block }: { block: HelpBlock }) {
  if (block.kind === "p") {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        <Rich text={block.text} />
      </p>
    );
  }
  if (block.kind === "tip") {
    return (
      <p className="flex gap-2 rounded-lg border border-primary/20 bg-accent px-3 py-2 text-sm">
        <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          <Rich text={block.text} />
        </span>
      </p>
    );
  }
  const List = block.kind === "steps" ? "ol" : "ul";
  return (
    <List
      className={cn(
        "space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground",
        block.kind === "steps" ? "list-decimal" : "list-disc",
      )}
    >
      {block.items.map((item, i) => (
        <li key={i}>
          <Rich text={item} />
        </li>
      ))}
    </List>
  );
}
