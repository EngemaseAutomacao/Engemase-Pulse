"use client";

import { NativeSelect } from "@/components/forms/native-select";

export type FilterOption = { value: string; label: string };

/**
 * Filtros de listagem via GET (?cliente=…&unidade=…): a URL pode ser
 * compartilhada e funciona sem JS; com JS, envia ao trocar a opção.
 */
export function FilterForm({
  filters,
}: {
  filters: { name: string; label: string; value: string; allLabel: string; options: FilterOption[] }[];
}) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <div key={f.name} className="w-full sm:w-64">
          <NativeSelect
            name={f.name}
            defaultValue={f.value}
            aria-label={f.label}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            <option value="">{f.allLabel}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      ))}
      <noscript>
        <button type="submit" className="text-sm underline">
          Filtrar
        </button>
      </noscript>
    </form>
  );
}
