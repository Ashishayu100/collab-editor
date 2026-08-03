import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  documentCount: number;
  createdAt: Date;
  updatedAt: Date;
  children: FolderNode[];
}

/** Fetches all of a user's folders flat, then assembles them into a tree client-side (folder
 *  counts per user are small enough that this is simpler and cheaper than recursive queries). */
export async function listFolders(userId: string): Promise<FolderNode[]> {
  const folders = await prisma.folder.findMany({
    where: { userId },
    include: { _count: { select: { documents: true } } },
    orderBy: { name: 'asc' },
  });

  const nodes = new Map<string, FolderNode>(
    folders.map((f) => [
      f.id,
      {
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        documentCount: f._count.documents,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        children: [],
      },
    ])
  );

  const roots: FolderNode[] = [];
  nodes.forEach((node) => {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

async function assertUniqueName(userId: string, name: string, parentId: string | null, excludeId?: string) {
  const existing = await prisma.folder.findFirst({
    where: { userId, name, parentId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (existing) {
    throw ApiError.conflict('A folder with this name already exists in this location');
  }
}

export async function createFolder(userId: string, name: string, parentId?: string | null) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw ApiError.badRequest('Folder name is required');
  }

  if (parentId) {
    const parent = await prisma.folder.findUnique({ where: { id: parentId }, select: { userId: true } });
    if (!parent || parent.userId !== userId) {
      throw ApiError.notFound('Parent folder not found');
    }
  }

  await assertUniqueName(userId, trimmedName, parentId ?? null);

  return prisma.folder.create({
    data: { name: trimmedName, userId, parentId: parentId ?? null },
  });
}

export async function renameFolder(userId: string, folderId: string, name: string) {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.userId !== userId) {
    throw ApiError.notFound('Folder not found');
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw ApiError.badRequest('Folder name is required');
  }

  await assertUniqueName(userId, trimmedName, folder.parentId, folderId);

  return prisma.folder.update({ where: { id: folderId }, data: { name: trimmedName } });
}

export async function deleteFolder(userId: string, folderId: string): Promise<void> {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.userId !== userId) {
    throw ApiError.notFound('Folder not found');
  }

  // Documents inside get folderId = null (onDelete: SetNull); child folders cascade-delete.
  await prisma.folder.delete({ where: { id: folderId } });
}
