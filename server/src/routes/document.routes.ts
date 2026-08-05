import { Router } from 'express';
import { z } from 'zod';
import {
  createDocumentHandler,
  deleteDocumentHandler,
  getDocumentHandler,
  listDocumentsHandler,
  moveDocumentHandler,
  saveDocumentContentHandler,
  searchDocumentsHandler,
  toggleStarHandler,
  updateDocumentTitleHandler,
} from '../controllers/document.controller';
import { requireAuth } from '../middleware/auth';
import { requireDocumentAccess } from '../middleware/requireDocumentAccess';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import commentRoutes from './comment.routes';
import exportRoutes from './export.routes';
import versionRoutes from './version.routes';

const router = Router();

const idParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1, 'Document id is required') }),
});

const listQuerySchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z.object({
    search: z.string().optional(),
    sort: z.enum(['updatedAt', 'createdAt', 'title']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    filter: z.enum(['owned', 'shared', 'all']).optional(),
    folder: z.string().min(1).optional(),
    starred: z.enum(['true', 'false']).optional(),
    limit: z.string().regex(/^\d+$/, 'limit must be a number').optional(),
  }),
});

const searchQuerySchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z.object({
    q: z.string().optional(),
  }),
});

const moveDocumentSchema = z.object({
  body: z.object({
    folderId: z.string().min(1).nullable(),
  }),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1) }),
});

const createDocumentSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(255).optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const updateTitleSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title must be at least 1 character').max(255, 'Title must be at most 255 characters'),
  }),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1) }),
});

const saveContentSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'content is required'),
  }),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1) }),
});

router.use(requireAuth);

router.get('/', validate(listQuerySchema), asyncHandler(listDocumentsHandler));
router.post('/', validate(createDocumentSchema), asyncHandler(createDocumentHandler));
// Must be registered before /:id — otherwise Express would match "search" as the :id param.
router.get('/search', validate(searchQuerySchema), asyncHandler(searchDocumentsHandler));
router.get('/:id', validate(idParamSchema), requireDocumentAccess('VIEWER'), asyncHandler(getDocumentHandler));
router.patch(
  '/:id',
  validate(updateTitleSchema),
  requireDocumentAccess('EDITOR'),
  asyncHandler(updateDocumentTitleHandler)
);
router.patch(
  '/:id/content',
  validate(saveContentSchema),
  requireDocumentAccess('EDITOR'),
  asyncHandler(saveDocumentContentHandler)
);
router.patch(
  '/:id/star',
  validate(idParamSchema),
  requireDocumentAccess('VIEWER'),
  asyncHandler(toggleStarHandler)
);
router.patch(
  '/:id/move',
  validate(moveDocumentSchema),
  requireDocumentAccess('OWNER'),
  asyncHandler(moveDocumentHandler)
);
router.delete('/:id', validate(idParamSchema), requireDocumentAccess('OWNER'), asyncHandler(deleteDocumentHandler));
router.use('/:id/versions', versionRoutes);
router.use('/:id/comments', commentRoutes);
router.use('/:id/export', exportRoutes);

export default router;
