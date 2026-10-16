import { formatNumber } from "@/lib/format";
import type { GeneratorView } from "@/lib/utility-types";

/**
 * QTA (quadro de transferência automática) no unifilar: qual fonte alimenta a
 * carga agora, pelo que o controlador do gerador informa.
 */

export type TransferState = {
  /** Fonte que alimenta a carga agora (null: nenhuma, ou sem leitura para saber). */
  source: "mains" | "generator" | null;
  label: string;
  detail: string;
  tone: "ok" | "info" | "critical" | "muted";
  /** Rede presente: do controlador do gerador ou, sem ele, pela corrente na entrada geral. */
  mainsPresent: boolean | null;
};

type GeneratorLike = Pick<GeneratorView, "live" | "running" | "breakerClosed" | "powerKw" | "mainsPresent">;

/**
 * O gerador alimenta a carga quando roda com o disjuntor fechado (ou entregando
 * potência, se o controlador não informa o disjuntor); senão, a rede, quando
 * presente. `mainEnergized`: corrente na entrada geral (null sem leitura).
 */
export function transferState(gen: GeneratorLike, mainEnergized: boolean | null): TransferState {
  const online = Boolean(gen.live?.online);
  const mainsPresent = online && gen.mainsPresent !== null ? gen.mainsPresent : mainEnergized;
  const generatorFeeding =
    online && gen.running && gen.breakerClosed !== false && (gen.breakerClosed === true || (gen.powerKw ?? 0) > 0.5);

  if (generatorFeeding) {
    const power = gen.powerKw !== null ? `${formatNumber(gen.powerKw, 0)} kW` : "em carga";
    return {
      source: "generator",
      label: "Carga no gerador",
      detail: mainsPresent === false ? `Sem rede · o gerador assumiu, ${power}` : `Gerador em carga, ${power}`,
      tone: "info",
      mainsPresent,
    };
  }
  if (mainsPresent === false) {
    const starting = online && gen.running;
    return {
      source: null,
      label: starting ? "Gerador partindo" : "Sem alimentação",
      detail: starting ? "Sem rede · aguardando o gerador assumir" : "Sem rede e o gerador não assumiu",
      tone: "critical",
      mainsPresent,
    };
  }
  if (mainsPresent === null) {
    return { source: null, label: "Sem leitura", detail: "Sem leitura do gerador nem da entrada geral", tone: "muted", mainsPresent };
  }
  return { source: "mains", label: "Carga na rede", detail: "Rede da concessionária presente", tone: "ok", mainsPresent };
}

/** Situação curta do grupo, para a legenda da fonte no unifilar. */
export function generatorStatusText(gen: Pick<GeneratorView, "live" | "faults" | "state" | "running" | "ready">): string {
  if (!gen.live?.online) return "sem comunicação";
  if (gen.state === "Em falha" || gen.faults.length > 0) return "em falha";
  if (gen.running) return (gen.state ?? "em operação").toLowerCase();
  if (gen.ready === false) return "não está pronto";
  return "pronto para partir";
}
