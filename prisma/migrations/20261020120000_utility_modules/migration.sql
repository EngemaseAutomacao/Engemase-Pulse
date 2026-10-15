-- Módulos Água e Gerador: equipamentos do Painel que não são medidores de energia,
-- o resumo de 5 min deles, as corridas do grupo gerador, os módulos que o
-- configurador da loja declara e os que a administração desliga por cliente.

CREATE TYPE "UtilityKind" AS ENUM ('WATER', 'GENERATOR');

ALTER TABLE "tenants" ADD COLUMN "modules_off" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "sites" ADD COLUMN "modules" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "site_live_snapshots" ADD COLUMN "utilities" JSONB;

CREATE TABLE "utility_equipment" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "kind" "UtilityKind" NOT NULL,
    "external_id" TEXT NOT NULL,
    "tag" TEXT,
    "name" TEXT NOT NULL,
    "profile" TEXT,
    "settings" JSONB,
    "tag_info" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utility_equipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "utility_readings_5m" (
    "equipment_id" UUID NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "values" JSONB NOT NULL,

    CONSTRAINT "utility_readings_5m_pkey" PRIMARY KEY ("equipment_id","ts")
);

CREATE TABLE "generator_runs" (
    "equipment_id" UUID NOT NULL,
    "external_id" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "reason" TEXT,
    "result" TEXT,
    "battery_rest" DOUBLE PRECISION,
    "battery_min" DOUBLE PRECISION,
    "start_seconds" DOUBLE PRECISION,
    "duration_seconds" DOUBLE PRECISION,
    "kwh" DOUBLE PRECISION,
    "liters" DOUBLE PRECISION,
    "peak_kw" DOUBLE PRECISION,
    "level_start" DOUBLE PRECISION,
    "level_end" DOUBLE PRECISION,

    CONSTRAINT "generator_runs_pkey" PRIMARY KEY ("equipment_id","external_id")
);

CREATE UNIQUE INDEX "utility_equipment_site_id_external_id_key" ON "utility_equipment"("site_id", "external_id");
CREATE INDEX "utility_equipment_site_id_idx" ON "utility_equipment"("site_id");
CREATE INDEX "utility_readings_5m_ts_idx" ON "utility_readings_5m"("ts");
CREATE INDEX "generator_runs_equipment_id_started_at_idx" ON "generator_runs"("equipment_id", "started_at");

ALTER TABLE "utility_equipment" ADD CONSTRAINT "utility_equipment_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "utility_readings_5m" ADD CONSTRAINT "utility_readings_5m_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "utility_equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generator_runs" ADD CONSTRAINT "generator_runs_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "utility_equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
