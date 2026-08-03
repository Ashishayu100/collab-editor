-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "shareToken" TEXT,
ADD COLUMN     "shareLinkRole" "Role" NOT NULL DEFAULT 'VIEWER',
ADD COLUMN     "shareEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "documents_shareToken_key" ON "documents"("shareToken");
