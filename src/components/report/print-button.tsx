"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Abre a impressão do navegador (onde dá para "Salvar como PDF"). */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <PrinterIcon />
      Imprimir ou salvar PDF
    </Button>
  );
}
