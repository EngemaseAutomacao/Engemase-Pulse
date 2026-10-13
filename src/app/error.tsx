"use client";

import { useEffect } from "react";
import { RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Erro inesperado numa página: mostra mensagem amigável e permite tentar de novo. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-[60dvh] place-items-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Algo deu errado</h1>
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar esta página. Tente de novo; se o problema continuar, informe o código abaixo ao suporte.
        </p>
        {error.digest && <p className="font-mono text-xs text-muted-foreground">Código: {error.digest}</p>}
        <Button onClick={reset}>
          <RotateCwIcon />
          Tentar de novo
        </Button>
      </div>
    </main>
  );
}
