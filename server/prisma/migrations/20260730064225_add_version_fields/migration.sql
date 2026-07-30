-- AlterTable
ALTER TABLE "document_versions" DROP COLUMN "createdBy",
ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "sizeBytes" INTEGER NOT NULL,
ADD COLUMN     "versionNum" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_documentId_versionNum_key" ON "document_versions"("documentId", "versionNum");

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
