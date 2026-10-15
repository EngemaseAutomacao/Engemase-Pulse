"use client";

import { DropletsIcon, FuelIcon, TriangleAlertIcon } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { DAYS_WITHOUT_RUN_WARN } from "@/lib/utilities";
import type { GeneratorView, UtilityView, WaterView } from "@/lib/utility-types";
import { cn } from "@/lib/utils";
import { readinessOf } from "./generator-view";
import { TankFigure } from "./tank-figure";

/** Tela "Água e gerador" da Tela de TV: números grandes, um bloco por equipamento. */
export function UtilitiesTvScreen({ equipment }: { equipment: UtilityView[] }) {
  return (
    <div className={cn("grid gap-6", equipment.length > 1 && "xl:grid-cols-2", equipment.length > 2 && "2xl:grid-cols-3")}>
      {equipment.map((e) => (e.kind === "WATER" ? <WaterTv key={e.id} tank={e} /> : <GeneratorTv key={e.id} gen={e} />))}
    </div>
  );
}

function Title({ icon, name, site }: { icon: React.ReactNode; name: string; site: string }) {
  return (
    <div className="flex items-center gap-3 [&_svg]:size-7 [&_svg]:text-primary">
      {icon}
      <div className="min-w-0">
        <p className="truncate text-2xl font-semibold">{name}</p>
        <p className="truncate text-lg text-muted-foreground">{site}</p>
      </div>
    </div>
  );
}

function WaterTv({ tank }: { tank: WaterView }) {
  return (
    <div className="surface space-y-5 p-6">
      <Title icon={<DropletsIcon />} name={tank.name} site={tank.siteName} />
      <div className="flex items-center gap-6">
        <TankFigure levelPct={tank.levelPct} label={`Nível de ${tank.name}`} low={20} className="h-48 2xl:h-56" />
        <div className="min-w-0 space-y-3">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-heading text-5xl font-semibold tabular">
              {tank.volumeL === null ? "—" : formatNumber(tank.volumeL, 0)}
            </span>
            <span className="text-2xl text-muted-foreground">L</span>
          </p>
          <p className="text-xl text-muted-foreground">
            Autonomia {tank.autonomyH === null ? "—" : `${formatNumber(tank.autonomyH, 1)} h`}
          </p>
          <p className="text-xl text-muted-foreground">
            Hoje {tank.days.at(-1) ? `${formatNumber(tank.days.at(-1)!.liters / 1000, 1)} m³` : "—"}
          </p>
        </div>
      </div>
      {tank.leak.suspect && (
        <p className="flex items-center gap-2 text-xl font-medium text-warning">
          <TriangleAlertIcon className="size-6" aria-hidden />
          Possível vazamento na madrugada
        </p>
      )}
    </div>
  );
}

function GeneratorTv({ gen }: { gen: GeneratorView }) {
  const readiness = readinessOf(gen);
  const tone = { ok: "text-success", info: "text-info", warn: "text-warning", critical: "text-destructive", muted: "text-muted-foreground" }[
    readiness.tone
  ];
  const late = gen.daysSinceRun !== null && gen.daysSinceRun >= DAYS_WITHOUT_RUN_WARN;
  return (
    <div className="surface space-y-5 p-6">
      <Title icon={<FuelIcon />} name={gen.name} site={gen.siteName} />
      <p className={cn("flex items-center gap-3 text-4xl font-semibold [&_svg]:size-10", tone)}>
        {readiness.icon}
        <span className="text-foreground">{readiness.label}</span>
      </p>
      <dl className="grid grid-cols-3 gap-4">
        <div>
          <dt className="text-lg text-muted-foreground">Diesel</dt>
          <dd className="font-heading text-4xl font-semibold tabular">
            {gen.dieselPct === null ? "—" : `${formatNumber(gen.dieselPct, 0)}%`}
          </dd>
        </div>
        <div>
          <dt className="text-lg text-muted-foreground">Autonomia</dt>
          <dd className="font-heading text-4xl font-semibold tabular">
            {gen.autonomyH === null ? "—" : `${formatNumber(gen.autonomyH, 1)} h`}
          </dd>
        </div>
        <div>
          <dt className="text-lg text-muted-foreground">Última partida</dt>
          <dd className={cn("font-heading text-4xl font-semibold tabular", late && "text-warning")}>
            {gen.daysSinceRun === null ? "—" : `${formatNumber(gen.daysSinceRun, 0)} d`}
          </dd>
        </div>
      </dl>
    </div>
  );
}
