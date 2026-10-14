-- As leituras passam a vir só do Painel local: saem a conexão com o InfluxDB
-- (unidade e medidor) e a escolha da fonte de leituras (InfluxDB / simulado / Painel).

-- AlterTable
ALTER TABLE "meters" DROP COLUMN "influx_measurement",
DROP COLUMN "influx_tag_key",
DROP COLUMN "influx_tag_value";

-- AlterTable
ALTER TABLE "sites" DROP COLUMN "influx_bucket",
DROP COLUMN "influx_org",
DROP COLUMN "influx_rollup_bucket",
DROP COLUMN "influx_token_encrypted",
DROP COLUMN "influx_url",
DROP COLUMN "telemetry_source";

-- DropEnum
DROP TYPE "TelemetrySource";

