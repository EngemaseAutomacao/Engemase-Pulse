
-- CreateTable
CREATE TABLE "error_logs" (
    "id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "path" TEXT,
    "digest" TEXT,
    "detail" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "error_logs_fingerprint_key" ON "error_logs"("fingerprint");

-- CreateIndex
CREATE INDEX "error_logs_last_seen_at_idx" ON "error_logs"("last_seen_at");

