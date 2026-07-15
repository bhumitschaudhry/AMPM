ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "clerk_user_id" TEXT;
CREATE UNIQUE INDEX "users_clerk_user_id_key" ON "users"("clerk_user_id");
