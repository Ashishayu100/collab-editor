import { Role } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';

const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  EDITOR: 1,
  OWNER: 2,
};

const OWNER_SELECT = { id: true, name: true, email: true, avatarColor: true } as const;
const COLLABORATOR_USER_SELECT = { id: true, name: true, email: true, avatarColor: true } as const;

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
    include: {
      owner: { select: OWNER_SELECT },
      collaborators: { include: { user: { select: COLLABORATOR_USER_SELECT } } },
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
      collaborators: {
        create: { userId, role: 'OWNER' },
      },
    },
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
    content: document.content ? document.content.toString('utf-8') : null,
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
  });

  return document;
}

export async function saveDocumentContent(userId: string, documentId: string, content: string) {
  await checkDocumentAccess(userId, documentId, 'EDITOR');

  const document = await prisma.document.update({
    where: { id: documentId },
    data: { content: Buffer.from(content, 'utf-8') },
    select: { updatedAt: true },
  });

  return document;
}

export async function deleteDocument(userId: string, documentId: string): Promise<void> {
  await checkDocumentAccess(userId, documentId, 'OWNER');

  await prisma.document.delete({ where: { id: documentId } });
}
