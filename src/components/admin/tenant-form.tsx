"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/forms/field";
import { SwitchField } from "@/components/forms/switch-field";
import { useActionToast } from "@/components/forms/use-action-toast";
import { BRAND } from "@/config/app";
import { IDLE, type ActionState } from "@/lib/action-state";
import { BRAND_THEME_CLASS, brandThemeStyle } from "@/lib/color";
import { cn } from "@/lib/utils";
import { formatCnpj } from "@/lib/format";
import { MODULE_INFO, UTILITY_MODULES } from "@/lib/utilities";

type TenantFormValues = {
  name: string;
  slug: string;
  document: string | null;
  primaryColor: string;
  accentColor: string;
  loginTagline: string | null;
  active: boolean;
  modulesOff: string[];
};

/** Gera um slug a partir do nome: "Indústria Acme S.A." → "industria-acme-s-a". */
function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function TenantForm({
  action,
  tenant,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  tenant?: TenantFormValues;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  useActionToast(state);

  const [name, setName] = useState(state.values?.name ?? tenant?.name ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? tenant?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(tenant));
  const [primary, setPrimary] = useState(tenant?.primaryColor ?? BRAND.primaryColor);
  const [accent, setAccent] = useState(tenant?.accentColor ?? BRAND.accentColor);
  const error = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do cliente" htmlFor="name" error={error("name")}>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              required
              aria-invalid={error("name") ? true : undefined}
            />
          </Field>
          <Field
            label="Endereço (slug)"
            htmlFor="slug"
            error={error("slug")}
            hint={slug ? `Login: /login/${slug}` : "Letras minúsculas, números e hífen."}
          >
            <Input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              required
              aria-invalid={error("slug") ? true : undefined}
            />
          </Field>
        </div>
        <Field label="CNPJ" htmlFor="document" error={error("document")} hint="Opcional.">
          <Input
            {...fieldProps(state, "document", tenant?.document ? formatCnpj(tenant.document) : "")}
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField label="Cor principal" name="primaryColor" value={primary} onChange={setPrimary} error={error("primaryColor")} />
          <ColorField label="Cor de destaque" name="accentColor" value={accent} onChange={setAccent} error={error("accentColor")} />
        </div>
        <Field label="Frase da tela de login" htmlFor="loginTagline" error={error("loginTagline")} hint="Opcional, até 160 caracteres.">
          <Textarea {...fieldProps(state, "loginTagline", tenant?.loginTagline)} rows={2} maxLength={160} />
        </Field>
        <SwitchField
          name="active"
          label="Cliente ativo"
          description="Clientes inativos não conseguem entrar no sistema."
          defaultChecked={tenant?.active ?? true}
        />
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Módulos</legend>
          <p className="text-xs text-muted-foreground">
            Energia está sempre incluída. Água e Gerador aparecem para o cliente quando o configurador da loja declara o
            módulo (ou envia o equipamento). Desligue o que o cliente não contratou.
          </p>
          {UTILITY_MODULES.map((m) => (
            <SwitchField
              key={m}
              name={`module_${m}`}
              label={MODULE_INFO[m].label}
              description={MODULE_INFO[m].description}
              defaultChecked={!(tenant?.modulesOff ?? []).includes(m)}
            />
          ))}
        </fieldset>
        <FormMessage state={state} />
        <SubmitButton className="w-fit">{tenant ? "Salvar alterações" : "Criar cliente"}</SubmitButton>
      </div>

      <BrandPreview name={name || "Nome do cliente"} primary={primary} accent={accent} />
    </form>
  );
}

function ColorField({
  label,
  name,
  value,
  onChange,
  error,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <Field label={label} htmlFor={name} error={error}>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={`${label} (seletor)`}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-0.5"
        />
        <Input id={name} name={name} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      </div>
    </Field>
  );
}

/** Prévia de como o menu e os botões ficam com as cores escolhidas, nos dois temas. */
function BrandPreview({ name, primary, accent }: { name: string; primary: string; accent: string }) {
  const valid = /^#[0-9a-f]{6}$/i.test(primary) && /^#[0-9a-f]{6}$/i.test(accent);
  return (
    <aside className="space-y-2">
      <p className="text-sm font-medium">Prévia</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {(["dark", "light"] as const).map((theme) => (
          <div
            key={theme}
            className={cn("space-y-3 rounded-xl border bg-sidebar p-4 text-foreground", theme, BRAND_THEME_CLASS)}
            style={valid ? brandThemeStyle(primary, accent) : undefined}
          >
            <p className="text-xs text-muted-foreground">
              Tema {theme === "dark" ? "escuro" : "claro"}
            </p>
            <p className="truncate font-heading font-bold text-primary">{name}</p>
            <div className="h-1 rounded-full bg-linear-to-r from-primary to-brand-accent" aria-hidden />
            <div className="relative rounded-lg bg-accent px-3 py-2 text-sm font-medium before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-accent">
              Visão geral
            </div>
            <div className="px-3 text-sm text-muted-foreground">Medidores</div>
            <div className="flex gap-2 pt-2">
              <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Botão</span>
              <span className="rounded-lg border border-brand-accent px-3 py-1.5 text-xs text-brand-accent">Destaque</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        A principal vai nos botões, links, nome do cliente e item aberto do menu; a de destaque, na faixa da marca e
        no marcador do item aberto. No tema claro, cores claras são escurecidas automaticamente para continuarem
        legíveis.
      </p>
    </aside>
  );
}
