-- AlterTable
ALTER TABLE "alarms" ADD COLUMN     "external_id" TEXT;

-- Alarmes do Painel ainda abertos: o id do Painel está na chave "painel:<unidade>:<id>".
UPDATE "alarms" SET "external_id" = split_part("open_key", ':', 3)
 WHERE "source" = 'PAINEL' AND "open_key" LIKE 'painel:%';

-- CreateIndex
CREATE UNIQUE INDEX "alarms_site_id_external_id_key" ON "alarms"("site_id", "external_id");
