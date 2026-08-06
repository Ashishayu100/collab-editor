-- DropIndex
DROP INDEX "comments_documentId_idx";

-- CreateIndex
CREATE INDEX "collaborators_userId_idx" ON "collaborators"("userId");

-- CreateIndex
CREATE INDEX "comments_documentId_createdAt_idx" ON "comments"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "documents_ownerId_updatedAt_idx" ON "documents"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "documents_title_idx" ON "documents"("title");
