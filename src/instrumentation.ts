import type { Instrumentation } from "next";

/** Erros do servidor (páginas, rotas e ações) vão para a tela "Saúde do sistema". */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("./server/errors");
  await recordError({
    source: "servidor",
    message: error instanceof Error ? error.message : String(error),
    path: context.routePath || request.path,
    digest: typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : null,
    detail: error instanceof Error ? error.stack : null,
  });
};
