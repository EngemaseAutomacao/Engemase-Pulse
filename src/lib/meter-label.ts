/**
 * Nome do medidor nas telas e relatórios. Sem TAG da planta no gateway, a TAG
 * na nuvem é o id interno do configurador ("refrigerados", "ilhas_de_frios"),
 * que só repete o nome: esse fica escondido. A TAG da planta (QD-01, QGBT-01)
 * tem maiúsculas e continua aparecendo.
 */

/** TAG da planta, ou null quando é só o id interno do configurador (tudo minúsculo). */
export function plantTag(tag: string | null | undefined): string | null {
  const t = tag?.trim();
  return t && /[A-Z]/.test(t) ? t : null;
}

/** "QD-01 Câmaras frias", ou só "Refrigerados" quando não há TAG da planta. */
export function meterLabel(meter: { tag: string | null | undefined; name: string }): string {
  const tag = plantTag(meter.tag);
  return tag ? `${tag} ${meter.name}` : meter.name;
}
