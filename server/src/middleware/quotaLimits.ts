import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { DOCUMENT_LIMITS } from '../config/limits';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.userId;
}

/** Caps how many documents a single owner can create — run after `requireAuth`, before the create handler. */
export const validateDocumentQuota = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const userId = requireUserId(req);
  const count = await prisma.document.count({ where: { ownerId: userId } });
  if (count >= DOCUMENT_LIMITS.MAX_DOCUMENTS_PER_USER) {
    throw ApiError.tooManyRequests(
      `Document limit reached (${DOCUMENT_LIMITS.MAX_DOCUMENTS_PER_USER}). Delete some documents to create new ones.`
    );
  }
  next();
});

/** Caps how many folders a single user can create. */
export const validateFolderQuota = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const userId = requireUserId(req);
  const count = await prisma.folder.count({ where: { userId } });
  if (count >= DOCUMENT_LIMITS.MAX_FOLDERS_PER_USER) {
    throw ApiError.tooManyRequests(`Folder limit reached (${DOCUMENT_LIMITS.MAX_FOLDERS_PER_USER}).`);
  }
  next();
});

/** Caps how many collaborators a single document can have — expects `req.params.id`. */
export const validateCollaboratorQuota = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const count = await prisma.collaborator.count({ where: { documentId: req.params.id } });
  if (count >= DOCUMENT_LIMITS.MAX_COLLABORATORS_PER_DOCUMENT) {
    throw ApiError.tooManyRequests(`Collaborator limit reached (${DOCUMENT_LIMITS.MAX_COLLABORATORS_PER_DOCUMENT}).`);
  }
  next();
});

/** Caps how many comments (including replies) a single document can accumulate. */
export const validateCommentQuota = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const count = await prisma.comment.count({ where: { documentId: req.params.id } });
  if (count >= DOCUMENT_LIMITS.MAX_COMMENTS_PER_DOCUMENT) {
    throw ApiError.tooManyRequests(`Comment limit reached (${DOCUMENT_LIMITS.MAX_COMMENTS_PER_DOCUMENT}).`);
  }
  next();
});
