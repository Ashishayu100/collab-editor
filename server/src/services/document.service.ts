import { Role } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import {
  createEmptyYDocState,
  decodeBase64ToBuffer,
  encodeBufferToBase64,
  isValidYjsState,
  mergeYjsState,
} from '../utils/yjs';
import { getWebSocketServer } from '../websocket/registry';

const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  EDITOR: 1,
  OWNER: 2,
};

const OWNER_SELECT = { id: true, name: true, email: true, avatarColor: true } as const;
const COLLABORATOR_USER_SELECT = { id: true, name: true, email: true, avatarColor: true } as const;
const SUMMARY_SELECT = {
  id: true,
  title: true,
  ownerId: true,
  isPublic: true,
  createdAt: true,
  updatedAt: true,
  // content deliberately NOT selected — callers that need it use getDocumentById
} as const;

interface DocumentAccess {
  documentId: string;
  ownerId: string;
  role: Role;
}

export async function checkDocumentAccess(
  userId: string,
  documentId: string,
  requiredRole?: Role
): Promise<DocumentAccess> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      ownerId: true,
      isPublic: true,
      collaborators: { where: { userId }, select: { role: true } },
    },
  });

  if (!document) {
    throw ApiError.notFound('Document not found');
  }

  let role: Role | null = null;

  if (document.ownerId === userId) {
    role = 'OWNER';
  } else if (document.collaborators.length > 0) {
    role = document.collaborators[0].role;
  } else if (document.isPublic) {
    role = 'VIEWER';
  }

  if (!role) {
    throw ApiError.forbidden('You do not have access to this document');
  }

  if (requiredRole && ROLE_RANK[role] < ROLE_RANK[requiredRole]) {
    throw ApiError.forbidden('You do not have permission to perform this action');
  }

  return { documentId: document.id, ownerId: document.ownerId, role };
}

export interface ListDocumentsParams {
  search?: string;
  sort?: 'updatedAt' | 'createdAt' | 'title';
  order?: 'asc' | 'desc';
}

export async function listDocuments(userId: string, params: ListDocumentsParams) {
  const sort = params.sort ?? 'updatedAt';
  const order = params.order ?? 'desc';

  const documents = await prisma.document.findMany({
    where: {
      AND: [
        { OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] },
        params.search ? { title: { contains: params.search, mode: 'insensitive' } } : {},
      ],
    },
    select: {
      id: true,
      title: true,
      ownerId: true,
      isPublic: true,
      createdAt: true,
      updatedAt: true,
      // content deliberately NOT selected — it can be large and the list view doesn't need it
      owner: { select: OWNER_SELECT },
      collaborators: { select: { userId: true, role: true, user: { select: COLLABORATOR_USER_SELECT } } },
    },
    orderBy: { [sort]: order },
  });

  return documents.map((doc) => {
    const ownRole = doc.collaborators.find((c) => c.userId === userId)?.role;
    return {
      id: doc.id,
      title: doc.title,
      isPublic: doc.isPublic,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      owner: doc.owner,
      role: ownRole ?? (doc.ownerId === userId ? 'OWNER' : 'VIEWER'),
      collaboratorCount: doc.collaborators.length,
      collaborators: doc.collaborators.map((c) => c.user),
    };
  });
}

export async function createDocument(userId: string, title?: string) {
  const trimmedTitle = title?.trim();

  const document = await prisma.document.create({
    data: {
      ...(trimmedTitle ? { title: trimmedTitle } : {}),
      ownerId: userId,
      content: createEmptyYDocState(),
      collaborators: {
        create: { userId, role: 'OWNER' },
      },
    },
    select: SUMMARY_SELECT,
  });

  return document;
}

export async function getDocumentById(userId: string, documentId: string) {
  const { role } = await checkDocumentAccess(userId, documentId);

  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    include: {
      owner: { select: OWNER_SELECT },
      collaborators: { include: { user: { select: COLLABORATOR_USER_SELECT } } },
    },
  });

  return {
    id: document.id,
    title: document.title,
    content: document.content ? encodeBufferToBase64(document.content) : null,
    isPublic: document.isPublic,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    owner: document.owner,
    role,
    collaborators: document.collaborators.map((c) => ({ ...c.user, role: c.role, addedAt: c.addedAt })),
  };
}

export async function updateDocumentTitle(userId: string, documentId: string, title: string) {
  await checkDocumentAccess(userId, documentId, 'EDITOR');

  const document = await prisma.document.update({
    where: { id: documentId },
    data: { title },
    select: SUMMARY_SELECT,
  });

  return document;
}

/**
 * REST fallback save — used when a client's WebSocket is down but it still has network
 * access (e.g. the server restarted, or the beforeunload/offline-interval safety nets in
 * the editor). Never overwrites: if a live WebSocket room exists for this document, the
 * incoming state is fed into that room's Y.Doc (its own save cycle then persists the merged
 * result); otherwise it's merged directly against whatever is currently in Postgres via
 * Y.applyUpdate, which is commutative regardless of arrival order.
 */
export async function saveDocumentContent(userId: string, documentId: string, content: string) {
  await checkDocumentAccess(userId, documentId, 'EDITOR');

  if (!isValidYjsState(content)) {
    throw ApiError.badRequest('Invalid document state');
  }

  const incoming = decodeBase64ToBuffer(content);
  const appliedToLiveRoom = getWebSocketServer()?.applyExternalUpdate(documentId, incoming) ?? false;

  if (appliedToLiveRoom) {
    return { updatedAt: new Date() };
  }

  const existing = await prisma.document.findUnique({
    where: { id: documentId },
    select: { content: true },
  });

  const document = await prisma.document.update({
    where: { id: documentId },
    data: { content: mergeYjsState(existing?.content ?? null, incoming) },
    select: { updatedAt: true },
  });

  return document;
}

export async function deleteDocument(userId: string, documentId: string): Promise<void> {
  await checkDocumentAccess(userId, documentId, 'OWNER');

  await prisma.document.delete({ where: { id: documentId } });
}
