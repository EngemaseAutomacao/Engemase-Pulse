"use client";

import { useState } from "react";

/**
 * Mostra uma lista em blocos ("Mostrar mais"), para telas com centenas de itens
 * não renderizarem tudo de uma vez. Volta ao primeiro bloco quando `resetKey`
 * muda (ex.: filtro ou busca), sem precisar de efeito.
 */
export function useIncrementalList<T>(items: T[], pageSize: number, resetKey: string) {
  const [state, setState] = useState({ key: resetKey, limit: pageSize });
  const limit = state.key === resetKey ? state.limit : pageSize;
  return {
    items: items.slice(0, limit),
    remaining: Math.max(0, items.length - limit),
    showMore: () => setState({ key: resetKey, limit: limit + pageSize }),
  };
}
