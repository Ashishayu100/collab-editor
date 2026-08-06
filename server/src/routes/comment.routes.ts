import { Router } from 'express';
import { z } from 'zod';
import {
  createCommentHandler,
  deleteCommentHandler,
  editCommentHandler,
  listCommentsHandler,
  replyToCommentHandler,
  resolveCommentHandler,
  unresolveCommentHandler,
} from '../controllers/comment.controller';
import { DOCUMENT_LIMITS } from '../config/limits';
import { requireAuth } from '../middleware/auth';
import { validateCommentQuota } from '../middleware/quotaLimits';
import { commentLimiter } from '../middleware/rateLimiter';
import { requireDocumentAccess } from '../middleware/requireDocumentAccess';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router({ mergeParams: true });

const listCommentsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    resolved: z.enum(['true', 'false']).optional(),
  }),
});

const commentIdParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1), commentId: z.string().min(1) }),
});

const commentContentLength = (message: string) =>
  z
    .string()
    .min(1, message)
    .max(DOCUMENT_LIMITS.MAX_COMMENT_LENGTH, `Comment must be under ${DOCUMENT_LIMITS.MAX_COMMENT_LENGTH} characters`);

const createCommentSchema = z.object({
  body: z.object({
    content: commentContentLength('Comment content is required'),
    anchorText: z.string().optional(),
    anchorOffset: z.number().int().nonnegative().optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1) }),
});

const replySchema = z.object({
  body: z.object({
    content: commentContentLength('Reply content is required'),
  }),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1), commentId: z.string().min(1) }),
});

const editCommentSchema = z.object({
  body: z.object({
    content: commentContentLength('Comment content is required'),
  }),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1), commentId: z.string().min(1) }),
});

router.use(requireAuth);

router.get('/', validate(listCommentsSchema), requireDocumentAccess('VIEWER'), asyncHandler(listCommentsHandler));
router.post(
  '/',
  commentLimiter,
  validate(createCommentSchema),
  requireDocumentAccess('EDITOR'),
  validateCommentQuota,
  asyncHandler(createCommentHandler)
);
router.post(
  '/:commentId/reply',
  commentLimiter,
  validate(replySchema),
  requireDocumentAccess('EDITOR'),
  validateCommentQuota,
  asyncHandler(replyToCommentHandler)
);
router.patch(
  '/:commentId',
  validate(editCommentSchema),
  requireDocumentAccess('VIEWER'),
  asyncHandler(editCommentHandler)
);
router.delete(
  '/:commentId',
  validate(commentIdParamSchema),
  requireDocumentAccess('VIEWER'),
  asyncHandler(deleteCommentHandler)
);
router.patch(
  '/:commentId/resolve',
  validate(commentIdParamSchema),
  requireDocumentAccess('EDITOR'),
  asyncHandler(resolveCommentHandler)
);
router.patch(
  '/:commentId/unresolve',
  validate(commentIdParamSchema),
  requireDocumentAccess('EDITOR'),
  asyncHandler(unresolveCommentHandler)
);

export default router;
