-- AlterTable
ALTER TABLE "alarms" ADD COLUMN     "open_key" TEXT;

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "influx_rollup_bucket" TEXT;

-- Preenche a chave dos alarmes já abertos antes de criar a unicidade
-- (se houver duplicados antigos, só o mais recente fica com a chave).
UPDATE "alarms" a
SET "open_key" = a."rule_id"::text || ':' || a."meter_id"::text
WHERE a."cleared_at" IS NULL
  AND a."rule_id" IS NOT NULL
  AND a."started_at" = (
    SELECT max(b."started_at") FROM "alarms" b
    WHERE b."rule_id" = a."rule_id" AND b."meter_id" = a."meter_id" AND b."cleared_at" IS NULL
  );

-- CreateIndex
CREATE UNIQUE INDEX "alarms_open_key_key" ON "alarms"("open_key");
