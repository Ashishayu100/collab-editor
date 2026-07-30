import { Router } from 'express';
import { z } from 'zod';
import {
  createVersionHandler,
  getVersionHandler,
  listVersionsHandler,
  restoreVersionHandler,
} from '../controllers/version.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router({ mergeParams: true });

const listVersionsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    limit: z.string().regex(/^\d+$/, 'limit must be a number').optional(),
    cursor: z.string().optional(),
  }),
});

const versionIdParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    id: z.string().min(1),
    versionId: z.string().min(1),
  }),
});

const documentIdParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1) }),
});

router.use(requireAuth);

router.get('/', validate(listVersionsSchema), asyncHandler(listVersionsHandler));
router.get('/:versionId', validate(versionIdParamSchema), asyncHandler(getVersionHandler));
router.post('/', validate(documentIdParamSchema), asyncHandler(createVersionHandler));
router.post('/:versionId/restore', validate(versionIdParamSchema), asyncHandler(restoreVersionHandler));

export default router;
