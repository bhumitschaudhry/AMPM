-- AlterTable
ALTER TABLE "images" ADD COLUMN "content_hash" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "images_content_hash_idx" ON "images"("content_hash");
