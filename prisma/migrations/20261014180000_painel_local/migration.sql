-- CreateEnum
CREATE TYPE "EnergyQuantity" AS ENUM ('ACTIVE', 'APPARENT');

-- CreateEnum
CREATE TYPE "EnergySource" AS ENUM ('COUNTER', 'POWER');

-- AlterEnum
ALTER TYPE "TelemetrySource" ADD VALUE 'AGENT';

-- AlterTable
ALTER TABLE "meters" ADD COLUMN     "breaker_amps" DOUBLE PRECISION,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "is_main" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "agent_info" JSONB,
ADD COLUMN     "agent_last_seen_at" TIMESTAMP(3),
ADD COLUMN     "agent_token_hash" TEXT;

-- CreateTable
CREATE TABLE "site_live_snapshots" (
    "site_id" UUID NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "readings" JSONB NOT NULL,

    CONSTRAINT "site_live_snapshots_pkey" PRIMARY KEY ("site_id")
);

-- CreateTable
CREATE TABLE "meter_readings_5m" (
    "meter_id" UUID NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "values" JSONB NOT NULL,

    CONSTRAINT "meter_readings_5m_pkey" PRIMARY KEY ("meter_id","ts")
);

-- CreateTable
CREATE TABLE "meter_energy_hours" (
    "meter_id" UUID NOT NULL,
    "quantity" "EnergyQuantity" NOT NULL DEFAULT 'ACTIVE',
    "hour" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "source" "EnergySource" NOT NULL,

    CONSTRAINT "meter_energy_hours_pkey" PRIMARY KEY ("meter_id","quantity","hour")
);

-- CreateIndex
CREATE INDEX "meter_readings_5m_ts_idx" ON "meter_readings_5m"("ts");

-- CreateIndex
CREATE UNIQUE INDEX "meters_site_id_external_id_key" ON "meters"("site_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "sites_agent_token_hash_key" ON "sites"("agent_token_hash");

-- AddForeignKey
ALTER TABLE "site_live_snapshots" ADD CONSTRAINT "site_live_snapshots_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings_5m" ADD CONSTRAINT "meter_readings_5m_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_energy_hours" ADD CONSTRAINT "meter_energy_hours_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

