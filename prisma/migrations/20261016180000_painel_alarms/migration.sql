
-- CreateEnum
CREATE TYPE "AlarmSource" AS ENUM ('CLOUD', 'PAINEL');

-- AlterTable
ALTER TABLE "alarms" ADD COLUMN     "site_id" UUID,
ADD COLUMN     "source" "AlarmSource" NOT NULL DEFAULT 'CLOUD',
ALTER COLUMN "meter_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "alarms_site_id_source_cleared_at_idx" ON "alarms"("site_id", "source", "cleared_at");

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

