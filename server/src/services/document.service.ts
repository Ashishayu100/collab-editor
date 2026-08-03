import { Prisma, Role } from '@prisma/client';
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
  /** 'owned' = only documents this user owns; 'shared' = only ones shared with them; 'all' (default) = both. */
  filter?: 'owned' | 'shared' | 'all';
  /** 'root' = only documents with no folder; a folder id = only documents in that folder; undefined = no folder filtering. */
  folder?: 'root' | string;
  /** true = only documents this user has starred. */
  starred?: boolean;
  /** Caps the result count — used for the dashboard's "Recent" view. */
  limit?: number;
}

export async function listDocuments(userId: string, params: ListDocumentsParams) {
  const sort = params.sort ?? 'updatedAt';
  const order = params.order ?? 'desc';
  const filter = params.filter ?? 'all';

  const ownershipFilter: Prisma.DocumentWhereInput =
    filter === 'owned'
      ? { ownerId: userId }
      : filter === 'shared'
        ? { AND: [{ ownerId: { not: userId } }, { collaborators: { some: { userId } } }] }
        : { OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] };

  const folderFilter: Prisma.DocumentWhereInput =
    params.folder === 'root' ? { folderId: null } : params.folder ? { folderId: params.folder } : {};

  const starredFilter: Prisma.DocumentWhereInput = params.starred
    ? { starredBy: { some: { userId } } }
    : {};

  const documents = await prisma.document.findMany({
    where: {
      AND: [
        ownershipFilter,
        folderFilter,
        starredFilter,
        params.search ? { title: { contains: params.search, mode: 'insensitive' } } : {},
      ],
    },
    select: {
      id: true,
      title: true,
      ownerId: true,
      isPublic: true,
      folderId: true,
      folder: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
      // content deliberately NOT selected — it can be large and the list view doesn't need it
      owner: { select: OWNER_SELECT },
      collaborators: { select: { id: true, userId: true, role: true, user: { select: COLLABORATOR_USER_SELECT } } },
      starredBy: { where: { userId }, select: { id: true } },
    },
    orderBy: { [sort]: order },
    ...(params.limit ? { take: params.limit } : {}),
  });

  return documents.map((doc) => {
    const ownCollaborator = doc.collaborators.find((c) => c.userId === userId);
    return {
      id: doc.id,
      title: doc.title,
      isPublic: doc.isPublic,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      owner: doc.owner,
      role: ownCollaborator?.role ?? (doc.ownerId === userId ? 'OWNER' : 'VIEWER'),
      /** This user's own Collaborator row id — the owner's row too — so the dashboard can call
       *  DELETE /collaborators/:id to "leave" without a separate lookup. Null only for the
       *  isPublic-viewer fallback case, where the user has no Collaborator row at all. */
      myCollaboratorId: ownCollaborator?.id ?? null,
      collaboratorCount: doc.collaborators.length,
      collaborators: doc.collaborators.map((c) => c.user),
      starred: doc.starredBy.length > 0,
      folder: doc.folder,
    };
  });
}

export interface DocumentSearchResult {
  id: string;
  title: string;
  updatedAt: Date;
  role: Role;
  starred: boolean;
}

export async function searchDocuments(userId: string, query: string): Promise<DocumentSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const documents = await prisma.document.findMany({
    where: {
      AND: [
        { OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] },
        { title: { contains: trimmed, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      ownerId: true,
      collaborators: { where: { userId }, select: { role: true } },
      starredBy: { where: { userId }, select: { id: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  return documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    updatedAt: doc.updatedAt,
    role: doc.ownerId === userId ? 'OWNER' : (doc.collaborators[0]?.role ?? 'VIEWER'),
    starred: doc.starredBy.length > 0,
  }));
}

/** Toggles this user's star on a document. Starring is per-user (StarredDocument), not a
 *  document-global flag, so any collaborator can star a shared document for themselves. */
export async function toggleStar(userId: string, documentId: string): Promise<boolean> {
  await checkDocumentAccess(userId, documentId);

  const existing = await prisma.starredDocument.findUnique({
    where: { userId_documentId: { userId, documentId } },
  });

  if (existing) {
    await prisma.starredDocument.delete({ where: { id: existing.id } });
    return false;
  }

  await prisma.starredDocument.create({ data: { userId, documentId } });
  return true;
}

export async function moveDocument(userId: string, documentId: string, folderId: string | null) {
  await checkDocumentAccess(userId, documentId, 'OWNER');

  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId }, select: { userId: true } });
    if (!folder || folder.userId !== userId) {
      throw ApiError.notFound('Folder not found');
    }
  }

  return prisma.document.update({
    where: { id: documentId },
    data: { folderId },
    select: { ...SUMMARY_SELECT, folderId: true, folder: { select: { id: true, name: true } } },
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
