DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "password_hash" IS NULL) THEN
    RAISE EXCEPTION 'Cannot remove Clerk identity support while passwordless users exist. Assign passwords or remove those users, then rerun this migration.';
  END IF;
END $$;

DROP INDEX IF EXISTS "users_clerk_user_id_key";
ALTER TABLE "users" DROP COLUMN IF EXISTS "clerk_user_id";
ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;
