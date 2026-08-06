import { Router } from 'express';
import { z } from 'zod';
import { exportHtmlHandler, exportMarkdownHandler, exportPdfHandler } from '../controllers/export.controller';
import { requireAuth } from '../middleware/auth';
import { exportLimiter } from '../middleware/rateLimiter';
import { requireDocumentAccess } from '../middleware/requireDocumentAccess';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router({ mergeParams: true });

const exportSchema = z.object({
  body: z.object({
    html: z.string().min(1, 'html is required'),
  }),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1) }),
});

router.use(requireAuth);
router.use(exportLimiter);

router.post('/pdf', validate(exportSchema), requireDocumentAccess('VIEWER'), asyncHandler(exportPdfHandler));
router.post('/markdown', validate(exportSchema), requireDocumentAccess('VIEWER'), asyncHandler(exportMarkdownHandler));
router.post('/html', validate(exportSchema), requireDocumentAccess('VIEWER'), asyncHandler(exportHtmlHandler));

export default router;
