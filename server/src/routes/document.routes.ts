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
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

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
    content: z.string(),
  }),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1) }),
});

router.use(requireAuth);

router.get('/', validate(listQuerySchema), asyncHandler(listDocumentsHandler));
router.post('/', validate(createDocumentSchema), asyncHandler(createDocumentHandler));
router.get('/:id', validate(idParamSchema), asyncHandler(getDocumentHandler));
router.patch('/:id', validate(updateTitleSchema), asyncHandler(updateDocumentTitleHandler));
router.patch('/:id/content', validate(saveContentSchema), asyncHandler(saveDocumentContentHandler));
router.delete('/:id', validate(idParamSchema), asyncHandler(deleteDocumentHandler));

export default router;
