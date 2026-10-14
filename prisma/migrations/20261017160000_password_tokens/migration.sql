
-- CreateTable
CREATE TABLE "password_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_tokens_token_hash_key" ON "password_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_tokens_user_id_idx" ON "password_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "password_tokens" ADD CONSTRAINT "password_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

