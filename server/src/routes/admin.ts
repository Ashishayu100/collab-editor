import { NextFunction, Request, Response, Router } from 'express';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { MetricsHistoryService } from '../services/MetricsHistoryService';
import { MetricsService } from '../services/MetricsService';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const ADMIN_EMAILS = env.ADMIN_EMAILS.split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Admin gate for everything under /api/admin. No `isAdmin` column exists on User today — that's
 * a reasonable production follow-up — so this uses ADMIN_EMAILS when configured, and falls back
 * to "the first user ever registered" when it's empty, purely so the dashboard is reachable in a
 * fresh local/dev setup with zero configuration.
 */
async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized();
    }

    if (ADMIN_EMAILS.length > 0) {
      if (ADMIN_EMAILS.includes(req.user.email.toLowerCase())) {
        next();
        return;
      }
      throw ApiError.forbidden('Admin access required');
    }

    const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (firstUser?.id === req.user.userId) {
      next();
      return;
    }
    throw ApiError.forbidden('Admin access required');
  } catch (error) {
    next(error);
  }
}

router.use(requireAuth);
router.use(requireAdmin);

/** Cheap admin-status probe — 200 if the caller passed requireAdmin, otherwise it never gets
 *  here. Used by the client to decide whether to show the admin nav link / dashboard route. */
router.get('/check', (_req: Request, res: Response) => {
  res.status(200).json({ isAdmin: true });
});

router.get('/metrics', (_req: Request, res: Response) => {
  res.status(200).json(MetricsService.getInstance().getSnapshot());
});

router.get('/metrics/history', (_req: Request, res: Response) => {
  res.status(200).json(MetricsHistoryService.getInstance().getHistory());
});

router.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    const [totalUsers, totalDocuments, totalComments, totalCollaborators, totalVersions, usersLast24h, documentsLast24h] =
      await Promise.all([
        prisma.user.count(),
        prisma.document.count(),
        prisma.comment.count(),
        prisma.collaborator.count(),
        prisma.documentVersion.count(),
        prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } }),
        prisma.document.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } }),
      ]);

    res.status(200).json({
      totalUsers,
      totalDocuments,
      totalComments,
      totalCollaborators,
      totalVersions,
      usersLast24h,
      documentsLast24h,
    });
  })
);

export default router;
