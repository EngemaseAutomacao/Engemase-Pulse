
-- CreateEnum
CREATE TYPE "TariffModality" AS ENUM ('CONVENTIONAL', 'WHITE', 'GREEN', 'BLUE');

-- CreateTable
CREATE TABLE "site_tariffs" (
    "site_id" UUID NOT NULL,
    "modality" "TariffModality" NOT NULL,
    "energy_off_peak" DOUBLE PRECISION NOT NULL,
    "energy_peak" DOUBLE PRECISION,
    "energy_intermediate" DOUBLE PRECISION,
    "flag_adder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "demand_price" DOUBLE PRECISION,
    "demand_peak_price" DOUBLE PRECISION,
    "contracted_demand" DOUBLE PRECISION,
    "contracted_demand_peak" DOUBLE PRECISION,
    "peak_start_hour" INTEGER NOT NULL DEFAULT 18,
    "peak_end_hour" INTEGER NOT NULL DEFAULT 21,
    "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_tariffs_pkey" PRIMARY KEY ("site_id")
);

-- AddForeignKey
ALTER TABLE "site_tariffs" ADD CONSTRAINT "site_tariffs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

