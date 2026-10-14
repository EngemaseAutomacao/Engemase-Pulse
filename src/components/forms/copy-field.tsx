"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Campo só de leitura com botão de copiar (token, link de acesso…). */
export function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        readOnly
        aria-label={label}
        className="font-mono text-xs"
        onFocus={(e) => e.target.select()}
      />
      <CopyButton value={value} label="Copiar" />
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-fit"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copiado" : label}
    </Button>
  );
}
