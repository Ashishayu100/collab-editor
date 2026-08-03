import { Request, Response, Router } from 'express';
import { z } from 'zod';
import * as sharingService from '../services/sharing.service';
import { ApiError } from '../utils/ApiError';
import { requireAuth } from '../middleware/auth';
import { requireDocumentAccess } from '../middleware/requireDocumentAccess';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  return req.user.userId;
}

const collaboratorRoleSchema = z.enum(['VIEWER', 'EDITOR']);

const idParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1) }),
});

const collaboratorIdParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1), collaboratorId: z.string().min(1) }),
});

const addCollaboratorSchema = z.object({
  body: z.object({
    email: z.string().email('Enter a valid email address'),
    role: collaboratorRoleSchema,
  }),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1) }),
});

const updateCollaboratorRoleSchema = z.object({
  body: z.object({ role: collaboratorRoleSchema }),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1), collaboratorId: z.string().min(1) }),
});

const shareLinkRoleSchema = z.object({
  body: z.object({ role: collaboratorRoleSchema }),
  query: z.object({}).optional(),
  params: z.object({ id: z.string().min(1) }),
});

const acceptTokenSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({ token: z.string().min(1) }),
});

/** Mounted at /api/documents — collaborator + share-link management for a specific document. */
export const documentSharingRoutes = Router();

documentSharingRoutes.use(requireAuth);

documentSharingRoutes.get(
  '/:id/collaborators',
  validate(idParamSchema),
  requireDocumentAccess('VIEWER'),
  asyncHandler(async (req: Request, res: Response) => {
    const collaborators = await sharingService.listCollaborators(requireUserId(req), req.params.id);
    res.status(200).json({ collaborators });
  })
);

documentSharingRoutes.post(
  '/:id/collaborators',
  validate(addCollaboratorSchema),
  requireDocumentAccess('OWNER'),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, role } = req.body as { email: string; role: 'VIEWER' | 'EDITOR' };
    const collaborator = await sharingService.addCollaborator(requireUserId(req), req.params.id, email, role);
    res.status(201).json({ collaborator });
  })
);

documentSharingRoutes.patch(
  '/:id/collaborators/:collaboratorId',
  validate(updateCollaboratorRoleSchema),
  requireDocumentAccess('OWNER'),
  asyncHandler(async (req: Request, res: Response) => {
    const { role } = req.body as { role: 'VIEWER' | 'EDITOR' };
    const collaborator = await sharingService.updateCollaboratorRole(
      requireUserId(req),
      req.params.id,
      req.params.collaboratorId,
      role
    );
    res.status(200).json({ collaborator });
  })
);

documentSharingRoutes.delete(
  '/:id/collaborators/:collaboratorId',
  validate(collaboratorIdParamSchema),
  // Minimum VIEWER here on purpose: OWNER-vs-self-removal is enforced inside the service, since
  // a collaborator with any role must be able to remove *themselves* ("leave the document").
  requireDocumentAccess('VIEWER'),
  asyncHandler(async (req: Request, res: Response) => {
    await sharingService.removeCollaborator(requireUserId(req), req.params.id, req.params.collaboratorId);
    res.status(200).json({ success: true });
  })
);

documentSharingRoutes.get(
  '/:id/share-link',
  validate(idParamSchema),
  requireDocumentAccess('OWNER'),
  asyncHandler(async (req: Request, res: Response) => {
    const status = await sharingService.getShareLinkStatus(requireUserId(req), req.params.id);
    res.status(200).json(status);
  })
);

documentSharingRoutes.post(
  '/:id/share-link',
  validate(shareLinkRoleSchema),
  requireDocumentAccess('OWNER'),
  asyncHandler(async (req: Request, res: Response) => {
    const { role } = req.body as { role: 'VIEWER' | 'EDITOR' };
    const status = await sharingService.generateShareLink(requireUserId(req), req.params.id, role);
    res.status(200).json(status);
  })
);

documentSharingRoutes.delete(
  '/:id/share-link',
  validate(idParamSchema),
  requireDocumentAccess('OWNER'),
  asyncHandler(async (req: Request, res: Response) => {
    await sharingService.disableShareLink(requireUserId(req), req.params.id);
    res.status(200).json({ success: true });
  })
);

/** Mounted at /api/share — accepting an invite link is not scoped to a document the caller already has access to. */
export const shareAcceptRoutes = Router();

shareAcceptRoutes.use(requireAuth);

shareAcceptRoutes.post(
  '/accept/:token',
  validate(acceptTokenSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await sharingService.acceptShareLink(requireUserId(req), req.params.token);
    res.status(200).json(result);
  })
);
