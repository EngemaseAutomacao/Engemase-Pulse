"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

/** Último recurso: erro no layout raiz (sem CSS do app garantido, por isso estilos inline). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error), [error]);
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#000000",
          color: "#f2f2f2",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22 }}>O sistema encontrou um erro</h1>
          <p style={{ opacity: 0.7 }}>Recarregue a página. Se continuar, contate o suporte.</p>
          <button
            onClick={reset}
            style={{ marginTop: 16, padding: "10px 18px", borderRadius: 10, border: 0, background: "#4a9ee0", color: "#0c2340", fontWeight: 600 }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
