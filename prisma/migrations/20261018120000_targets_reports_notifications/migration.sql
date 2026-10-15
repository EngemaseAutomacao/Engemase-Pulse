-- AlterTable
ALTER TABLE "alarms" ADD COLUMN     "escalated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "alarm_email" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "escalation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monthly_report" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "area_m2" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "escalation_minutes" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "telegram_chat_id" TEXT;

-- CreateTable
CREATE TABLE "energy_targets" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "site_id" UUID NOT NULL,
    "meter_id" UUID,
    "kwh" DOUBLE PRECISION,
    "cost" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "energy_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_report_deliveries" (
    "tenant_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_report_deliveries_pkey" PRIMARY KEY ("tenant_id","month")
);

-- CreateIndex
CREATE UNIQUE INDEX "energy_targets_scope_key" ON "energy_targets"("scope");

-- CreateIndex
CREATE INDEX "energy_targets_site_id_idx" ON "energy_targets"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_chat_id_key" ON "users"("telegram_chat_id");

-- AddForeignKey
ALTER TABLE "energy_targets" ADD CONSTRAINT "energy_targets_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_targets" ADD CONSTRAINT "energy_targets_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_report_deliveries" ADD CONSTRAINT "monthly_report_deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Administradores atuais dos clientes já recebem o resumo do mês por e-mail.
UPDATE "memberships" SET "monthly_report" = true WHERE "role" = 'ADMIN';
