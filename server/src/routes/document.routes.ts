import { Router } from 'express';
import { z } from 'zod';
import {
  createDocumentHandler,
  deleteDocumentHandler,
  getDocumentHandler,
  listDocumentsHandler,
  saveDocumentContentHandler,
  updateDocumentTitleHandler,
} from '../controllers/document.controller';
import { requireAuth } from '../middleware/auth';
import { requireDocumentAccess } from '../middleware/requireDocumentAccess';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
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
  }),
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
router.delete('/:id', validate(idParamSchema), requireDocumentAccess('OWNER'), asyncHandler(deleteDocumentHandler));
router.use('/:id/versions', versionRoutes);

export default router;
