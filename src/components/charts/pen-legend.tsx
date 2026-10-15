"use client";

import { CheckIcon, EyeIcon, EyeOffIcon, PipetteIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PEN_PALETTE } from "./pen-settings";

export type Pen = {
  key: string;
  label: string;
  color: string;
  hidden: boolean;
  /** Cor escolhida pela pessoa (não a padrão). */
  custom: boolean;
};

/**
 * Legenda que também comanda as penas: clicar no nome oculta/mostra, a
 * bolinha ao lado troca a cor. O texto fica em cor de texto; a cor da pena
 * vai só no traço.
 */
export function PenLegend({
  pens,
  onToggle,
  onColor,
  onShowAll,
  onResetColors,
}: {
  pens: Pen[];
  onToggle: (key: string) => void;
  onColor: (key: string, color: string | null) => void;
  onShowAll: () => void;
  onResetColors: () => void;
}) {
  const anyHidden = pens.some((p) => p.hidden);
  const anyCustom = pens.some((p) => p.custom);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ul aria-label="Penas" className="flex flex-wrap items-center gap-1.5">
        {pens.map((pen) => (
          <li
            key={pen.key}
            className={cn("flex items-center rounded-full border bg-card text-xs", pen.hidden && "border-dashed")}
          >
            <button
              type="button"
              aria-pressed={!pen.hidden}
              title={pen.hidden ? `Mostrar ${pen.label}` : `Ocultar ${pen.label}`}
              onClick={() => onToggle(pen.key)}
              className="flex min-h-8 items-center gap-1.5 rounded-l-full py-1 pr-2 pl-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <PenSwatch color={pen.color} dashed={pen.hidden} />
              <span className={cn("font-medium", pen.hidden && "text-muted-foreground line-through")}>{pen.label}</span>
              {pen.hidden && <EyeOffIcon aria-hidden className="size-3.5 text-muted-foreground" />}
            </button>
            <PenColorPicker pen={pen} onColor={onColor} />
          </li>
        ))}
      </ul>
      {anyHidden && (
        <Button type="button" variant="ghost" size="sm" onClick={onShowAll}>
          <EyeIcon />
          Mostrar todas
        </Button>
      )}
      {anyCustom && (
        <Button type="button" variant="ghost" size="sm" onClick={onResetColors}>
          <RotateCcwIcon />
          Cores padrão
        </Button>
      )}
    </div>
  );
}

/** Traço da pena: contínuo (atual) ou tracejado (oculta ou período anterior). */
export function PenSwatch({ color, dashed = false, className }: { color: string; dashed?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block w-4 shrink-0", className)}
      style={dashed ? { borderTop: `2px dashed ${color}` } : { height: 2, borderRadius: 999, backgroundColor: color }}
    />
  );
}

function PenColorPicker({ pen, onColor }: { pen: Pen; onColor: (key: string, color: string | null) => void }) {
  const inPalette = PEN_PALETTE.some((option) => option.value === pen.color);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cor de ${pen.label}`}
          title={`Cor de ${pen.label}`}
          className="grid min-h-8 place-items-center rounded-r-full border-l pr-2.5 pl-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="size-3 rounded-full ring-1 ring-foreground/20" style={{ backgroundColor: pen.color }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 space-y-3 p-3">
        <p className="text-sm font-medium">Cor de {pen.label}</p>
        <div role="radiogroup" aria-label={`Cor de ${pen.label}`} className="grid grid-cols-5 gap-1.5">
          {PEN_PALETTE.map((option) => {
            const checked = pen.color === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={option.label}
                title={option.label}
                onClick={() => onColor(pen.key, option.value)}
                className={cn(
                  "grid size-9 place-items-center rounded-md ring-offset-2 ring-offset-popover outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  checked && "ring-2 ring-foreground",
                )}
                style={{ backgroundColor: option.value }}
              >
                {checked && <CheckIcon aria-hidden className="size-4 text-white drop-shadow" />}
              </button>
            );
          })}
          <label
            title="Outra cor"
            className={cn(
              "relative grid size-9 cursor-pointer place-items-center rounded-md border border-dashed text-muted-foreground ring-offset-2 ring-offset-popover focus-within:ring-3 focus-within:ring-ring/50 hover:text-foreground",
              !inPalette && "border-solid ring-2 ring-foreground",
            )}
            style={inPalette ? undefined : { backgroundColor: pen.color }}
          >
            <PipetteIcon aria-hidden className={cn("size-4", !inPalette && "text-white drop-shadow")} />
            <span className="sr-only">Outra cor</span>
            <input
              type="color"
              value={toHex(pen.color)}
              onChange={(e) => onColor(pen.key, e.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          disabled={!pen.custom}
          onClick={() => onColor(pen.key, null)}
        >
          <RotateCcwIcon />
          Usar a cor padrão
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** O seletor nativo só aceita #rrggbb: resolve var(--chart-n) para o valor do tema atual. */
function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const name = /^var\((--[\w-]+)\)$/.exec(color)?.[1];
  if (!name || typeof document === "undefined") return "#808080";
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#808080";
}
