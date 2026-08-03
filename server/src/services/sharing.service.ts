import { randomBytes } from 'crypto';
import { Role } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { checkDocumentAccess } from './document.service';
import { getWebSocketServer } from '../websocket/registry';

const COLLABORATOR_USER_SELECT = { id: true, name: true, email: true, avatarColor: true } as const;

export interface CollaboratorSummary {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  role: Role;
  addedAt: Date;
  isOwner: boolean;
}

/**
 * Every document (including the owner's own) has exactly one Collaborator row created at
 * document-creation time with role OWNER — see document.service.ts's createDocument. So the
 * owner is already represented in this table; no synthetic "owner" entry needs to be added.
 */
export async function listCollaborators(userId: string, documentId: string): Promise<CollaboratorSummary[]> {
  const { ownerId } = await checkDocumentAccess(userId, documentId);

  const collaborators = await prisma.collaborator.findMany({
    where: { documentId },
    include: { user: { select: COLLABORATOR_USER_SELECT } },
    orderBy: { addedAt: 'asc' },
  });

  return collaborators
    .map((c) => ({
      id: c.id,
      userId: c.user.id,
      name: c.user.name,
      email: c.user.email,
      avatarColor: c.user.avatarColor,
      role: c.role,
      addedAt: c.addedAt,
      isOwner: c.userId === ownerId,
    }))
    // Owner first, then everyone else by when they were added.
    .sort((a, b) => (a.isOwner === b.isOwner ? 0 : a.isOwner ? -1 : 1));
}

export async function addCollaborator(
  actingUserId: string,
  documentId: string,
  email: string,
  role: 'VIEWER' | 'EDITOR'
): Promise<CollaboratorSummary> {
  const { ownerId } = await checkDocumentAccess(actingUserId, documentId, 'OWNER');

  const targetUser = await prisma.user.findUnique({ where: { email }, select: COLLABORATOR_USER_SELECT });
  if (!targetUser) {
    throw ApiError.notFound('No user found with this email');
  }

  if (targetUser.id === ownerId) {
    throw ApiError.badRequest('Cannot add the document owner as a collaborator');
  }

  const existing = await prisma.collaborator.findUnique({
    where: { documentId_userId: { documentId, userId: targetUser.id } },
  });
  if (existing) {
    throw ApiError.conflict('This user already has access to the document');
  }

  const collaborator = await prisma.collaborator.create({
    data: { documentId, userId: targetUser.id, role },
    include: { user: { select: COLLABORATOR_USER_SELECT } },
  });

  return {
    id: collaborator.id,
    userId: collaborator.user.id,
    name: collaborator.user.name,
    email: collaborator.user.email,
    avatarColor: collaborator.user.avatarColor,
    role: collaborator.role,
    addedAt: collaborator.addedAt,
    isOwner: false,
  };
}

export async function updateCollaboratorRole(
  actingUserId: string,
  documentId: string,
  collaboratorId: string,
  role: 'VIEWER' | 'EDITOR'
): Promise<CollaboratorSummary> {
  const { ownerId } = await checkDocumentAccess(actingUserId, documentId, 'OWNER');

  const collaborator = await prisma.collaborator.findUnique({
    where: { id: collaboratorId },
    include: { user: { select: COLLABORATOR_USER_SELECT } },
  });
  if (!collaborator || collaborator.documentId !== documentId) {
    throw ApiError.notFound('Collaborator not found');
  }
  if (collaborator.userId === ownerId) {
    throw ApiError.badRequest("Cannot change the owner's own role");
  }

  const updated = await prisma.collaborator.update({
    where: { id: collaboratorId },
    data: { role },
    include: { user: { select: COLLABORATOR_USER_SELECT } },
  });

  // If they're actively connected, push the new role so their session reflects it immediately
  // instead of staying stale (e.g. still editable) until they refresh.
  getWebSocketServer()?.notifyRoleChanged(documentId, updated.userId, role);

  return {
    id: updated.id,
    userId: updated.user.id,
    name: updated.user.name,
    email: updated.user.email,
    avatarColor: updated.user.avatarColor,
    role: updated.role,
    addedAt: updated.addedAt,
    isOwner: false,
  };
}

/** OWNER can remove anyone; anyone else may only remove themselves ("leave the document"). */
export async function removeCollaborator(
  actingUserId: string,
  documentId: string,
  collaboratorId: string
): Promise<void> {
  const { ownerId, role: actingRole } = await checkDocumentAccess(actingUserId, documentId);

  const collaborator = await prisma.collaborator.findUnique({ where: { id: collaboratorId } });
  if (!collaborator || collaborator.documentId !== documentId) {
    throw ApiError.notFound('Collaborator not found');
  }
  if (collaborator.userId === ownerId) {
    throw ApiError.badRequest('Cannot remove the document owner');
  }

  const isSelf = collaborator.userId === actingUserId;
  if (actingRole !== 'OWNER' && !isSelf) {
    throw ApiError.forbidden('You do not have permission to remove this collaborator');
  }

  await prisma.collaborator.delete({ where: { id: collaboratorId } });

  // Cut off live access immediately rather than waiting for them to refresh or reconnect.
  getWebSocketServer()?.revokeAccess(documentId, collaborator.userId);
}

export interface ShareLinkStatus {
  enabled: boolean;
  token?: string;
  role?: Role;
  url?: string;
}

function buildShareUrl(token: string): string {
  return `${env.CLIENT_URL}/share/${token}`;
}

export async function getShareLinkStatus(userId: string, documentId: string): Promise<ShareLinkStatus> {
  await checkDocumentAccess(userId, documentId, 'OWNER');

  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: { shareEnabled: true, shareToken: true, shareLinkRole: true },
  });

  if (!document.shareEnabled || !document.shareToken) {
    return { enabled: false };
  }

  return {
    enabled: true,
    token: document.shareToken,
    role: document.shareLinkRole,
    url: buildShareUrl(document.shareToken),
  };
}

/** Generates (or regenerates, invalidating any previous link) a share invite link. */
export async function generateShareLink(
  userId: string,
  documentId: string,
  role: 'VIEWER' | 'EDITOR'
): Promise<ShareLinkStatus> {
  await checkDocumentAccess(userId, documentId, 'OWNER');

  const token = randomBytes(32).toString('hex');

  await prisma.document.update({
    where: { id: documentId },
    data: { shareToken: token, shareLinkRole: role, shareEnabled: true },
  });

  return { enabled: true, token, role, url: buildShareUrl(token) };
}

export async function disableShareLink(userId: string, documentId: string): Promise<void> {
  await checkDocumentAccess(userId, documentId, 'OWNER');

  await prisma.document.update({
    where: { id: documentId },
    data: { shareEnabled: false, shareToken: null },
  });
}

export interface AcceptShareLinkResult {
  documentId: string;
  role: Role;
}

export async function acceptShareLink(userId: string, token: string): Promise<AcceptShareLinkResult> {
  const document = await prisma.document.findUnique({
    where: { shareToken: token },
    select: { id: true, ownerId: true, shareEnabled: true, shareLinkRole: true },
  });

  if (!document || !document.shareEnabled) {
    throw ApiError.notFound('This share link is invalid or has been disabled');
  }

  if (document.ownerId === userId) {
    return { documentId: document.id, role: 'OWNER' };
  }

  const existing = await prisma.collaborator.findUnique({
    where: { documentId_userId: { documentId: document.id, userId } },
  });
  if (existing) {
    return { documentId: document.id, role: existing.role };
  }

  await prisma.collaborator.create({
    data: { documentId: document.id, userId, role: document.shareLinkRole },
  });

  return { documentId: document.id, role: document.shareLinkRole };
}
