import { Router } from 'express';
import { z } from 'zod';
import {
  createFolderHandler,
  deleteFolderHandler,
  listFoldersHandler,
  renameFolderHandler,
} from '../controllers/folder.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const idParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1) }),
});

const createFolderSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Folder name is required').max(255),
    parentId: z.string().min(1).optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const renameFolderSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Folder name is required').max(255),
  }),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1) }),
});

router.use(requireAuth);

router.get('/', asyncHandler(listFoldersHandler));
router.post('/', validate(createFolderSchema), asyncHandler(createFolderHandler));
router.patch('/:id', validate(renameFolderSchema), asyncHandler(renameFolderHandler));
router.delete('/:id', validate(idParamSchema), asyncHandler(deleteFolderHandler));

export default router;
