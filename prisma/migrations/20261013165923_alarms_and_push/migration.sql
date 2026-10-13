-- CreateEnum
CREATE TYPE "AlarmSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlarmRuleKind" AS ENUM ('THRESHOLD', 'OFFLINE');

-- CreateEnum
CREATE TYPE "Comparison" AS ENUM ('ABOVE', 'BELOW');

-- CreateTable
CREATE TABLE "alarm_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "meter_id" UUID,
    "name" TEXT NOT NULL,
    "kind" "AlarmRuleKind" NOT NULL,
    "field" TEXT,
    "comparison" "Comparison",
    "threshold" DOUBLE PRECISION NOT NULL,
    "severity" "AlarmSeverity" NOT NULL DEFAULT 'WARNING',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alarm_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarms" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "meter_id" UUID NOT NULL,
    "rule_id" UUID,
    "severity" "AlarmSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleared_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_id" UUID,

    CONSTRAINT "alarms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alarm_rules_tenant_id_idx" ON "alarm_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "alarms_tenant_id_cleared_at_idx" ON "alarms"("tenant_id", "cleared_at");

-- CreateIndex
CREATE INDEX "alarms_tenant_id_started_at_idx" ON "alarms"("tenant_id", "started_at");

-- CreateIndex
CREATE INDEX "alarms_rule_id_meter_id_cleared_at_idx" ON "alarms"("rule_id", "meter_id", "cleared_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- AddForeignKey
ALTER TABLE "alarm_rules" ADD CONSTRAINT "alarm_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarm_rules" ADD CONSTRAINT "alarm_rules_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "alarm_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
