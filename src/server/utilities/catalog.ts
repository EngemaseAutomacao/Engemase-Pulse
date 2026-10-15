import "server-only";
import {
  resolveModules,
  siteHasModule,
  type SiteModuleInfo,
  type TagInfo,
  type UtilityKind,
  type UtilityModule,
} from "@/lib/utilities";
import { cached, configTtlMs, getCache } from "@/server/cache";
import { db } from "@/server/db";

/**
 * Equipamentos de água e gerador de um cliente e os módulos que cada unidade
 * declara. Lido a cada atualização das telas, então fica em cache; o envio do
 * Painel que muda a lista (ou os módulos) invalida.
 */

export type UtilityEquipmentRef = {
  id: string;
  siteId: string;
  siteName: string;
  timeZone: string;
  kind: UtilityKind;
  name: string;
  tag: string | null;
  profile: string | null;
  /** Parâmetros do Painel: capacidade_litros, capacidade_tanque_litros, potencia_nominal_kw… */
  settings: Record<string, number | string | boolean | null>;
  tagInfo: Record<string, TagInfo> | null;
};

export type UtilitySite = SiteModuleInfo & { id: string; name: string; timeZone: string };

export type UtilityCatalog = { equipment: UtilityEquipmentRef[]; sites: UtilitySite[] };

const catalogKey = (tenantId: string) => `utilities:v1:${tenantId}`;

export function getUtilityCatalog(tenantId: string): Promise<UtilityCatalog> {
  return cached(catalogKey(tenantId), configTtlMs(), async () => {
    const sites = await db.site.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        timezone: true,
        modules: true,
        utilities: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, kind: true, name: true, tag: true, profile: true, settings: true, tagInfo: true },
        },
      },
    });
    return {
      sites: sites.map((s) => ({
        id: s.id,
        name: s.name,
        timeZone: s.timezone,
        declared: s.modules,
        kinds: [...new Set(s.utilities.map((u) => u.kind))],
      })),
      equipment: sites.flatMap((s) =>
        s.utilities.map((u) => ({
          id: u.id,
          siteId: s.id,
          siteName: s.name,
          timeZone: s.timezone,
          kind: u.kind,
          name: u.name,
          tag: u.tag,
          profile: u.profile,
          settings: (u.settings ?? {}) as UtilityEquipmentRef["settings"],
          tagInfo: (u.tagInfo ?? null) as UtilityEquipmentRef["tagInfo"],
        })),
      ),
    };
  });
}

export async function invalidateUtilities(...tenantIds: string[]): Promise<void> {
  if (tenantIds.length > 0) await getCache().del(...tenantIds.map(catalogKey));
}

/** Módulos de água e gerador que aparecem para o cliente. */
export async function visibleModules(tenant: { id: string; modulesOff: readonly string[] }): Promise<UtilityModule[]> {
  return resolveModules((await getUtilityCatalog(tenant.id)).sites, tenant.modulesOff);
}

/** Unidades onde o módulo vale (para a tela do módulo). */
export function sitesWithModule(catalog: UtilityCatalog, module: UtilityModule): UtilitySite[] {
  return catalog.sites.filter((s) => siteHasModule(s, module));
}

/** Número do parâmetro do Painel (null se ausente ou inválido). */
export function numericSetting(ref: Pick<UtilityEquipmentRef, "settings">, name: string): number | null {
  const v = ref.settings[name];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}
