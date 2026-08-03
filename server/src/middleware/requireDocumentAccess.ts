import { Role } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { checkDocumentAccess } from '../services/document.service';
import { ApiError } from '../utils/ApiError';

declare global {
  namespace Express {
    interface Request {
      /** The requesting user's resolved role on `req.params.id`, set by requireDocumentAccess. */
      documentRole?: Role;
    }
  }
}

/**
 * Route-level access gate for any endpoint nested under `/:id`. Resolves the caller's role via
 * the same `checkDocumentAccess` the service layer already uses, attaches it to `req.documentRole`
 * for handlers that need it, and rejects with 403 if it doesn't meet `minRole` (omit for "any
 * role is fine, just needs SOME access"). Individual service functions may still re-check access
 * themselves — that's intentional defense in depth, not redundant dead code.
 */
export function requireDocumentAccess(minRole?: Role) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    const documentId = req.params.id;
    if (!documentId) {
      next(ApiError.badRequest('Document id is required'));
      return;
    }

    try {
      const { role } = await checkDocumentAccess(req.user.userId, documentId, minRole);
      req.documentRole = role;
      next();
    } catch (error) {
      next(error);
    }
  };
}
