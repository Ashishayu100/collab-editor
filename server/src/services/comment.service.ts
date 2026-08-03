import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { checkDocumentAccess } from './document.service';

const USER_SELECT = { id: true, name: true, email: true } as const;

const REPLY_INCLUDE = {
  user: { select: USER_SELECT },
  resolvedBy: { select: USER_SELECT },
} as const;

const COMMENT_INCLUDE = {
  user: { select: USER_SELECT },
  resolvedBy: { select: USER_SELECT },
  replies: {
    include: REPLY_INCLUDE,
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

async function findRootCommentOrThrow(documentId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment || comment.documentId !== documentId) {
    throw ApiError.notFound('Comment not found');
  }
  if (comment.parentId !== null) {
    throw ApiError.badRequest('Cannot reply to a reply — reply to the thread root instead');
  }
  return comment;
}

export interface ListCommentsParams {
  resolved?: boolean;
}

export async function listComments(userId: string, documentId: string, params: ListCommentsParams = {}) {
  await checkDocumentAccess(userId, documentId);

  return prisma.comment.findMany({
    where: {
      documentId,
      parentId: null,
      ...(params.resolved !== undefined ? { resolved: params.resolved } : {}),
    },
    include: COMMENT_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
}

export interface CreateCommentInput {
  content: string;
  anchorText?: string;
  anchorOffset?: number;
}

export async function createComment(userId: string, documentId: string, input: CreateCommentInput) {
  await checkDocumentAccess(userId, documentId, 'EDITOR');

  const content = input.content.trim();
  if (!content) {
    throw ApiError.badRequest('Comment content is required');
  }

  const hasAnchor = input.anchorText !== undefined && input.anchorOffset !== undefined;

  return prisma.comment.create({
    data: {
      documentId,
      userId,
      content,
      anchorText: hasAnchor ? input.anchorText : null,
      anchorOffset: hasAnchor ? input.anchorOffset : null,
    },
    include: COMMENT_INCLUDE,
  });
}

export async function replyToComment(userId: string, documentId: string, commentId: string, content: string) {
  await checkDocumentAccess(userId, documentId, 'EDITOR');
  await findRootCommentOrThrow(documentId, commentId);

  const trimmed = content.trim();
  if (!trimmed) {
    throw ApiError.badRequest('Reply content is required');
  }

  return prisma.comment.create({
    data: {
      documentId,
      userId,
      parentId: commentId,
      content: trimmed,
    },
    include: REPLY_INCLUDE,
  });
}

export async function editComment(userId: string, documentId: string, commentId: string, content: string) {
  await checkDocumentAccess(userId, documentId);

  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment || comment.documentId !== documentId) {
    throw ApiError.notFound('Comment not found');
  }
  if (comment.userId !== userId) {
    throw ApiError.forbidden('Only the comment author can edit this comment');
  }

  const trimmed = content.trim();
  if (!trimmed) {
    throw ApiError.badRequest('Comment content is required');
  }

  return prisma.comment.update({
    where: { id: commentId },
    data: { content: trimmed },
    include: comment.parentId === null ? COMMENT_INCLUDE : REPLY_INCLUDE,
  });
}

export async function deleteComment(
  userId: string,
  documentId: string,
  commentId: string
): Promise<{ id: string; parentId: string | null }> {
  const { role } = await checkDocumentAccess(userId, documentId);

  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment || comment.documentId !== documentId) {
    throw ApiError.notFound('Comment not found');
  }
  if (comment.userId !== userId && role !== 'OWNER') {
    throw ApiError.forbidden('Only the comment author or the document owner can delete this comment');
  }

  // Replies cascade via the Comment.parent onDelete: Cascade relation.
  await prisma.comment.delete({ where: { id: commentId } });

  return { id: comment.id, parentId: comment.parentId };
}

async function setResolved(
  userId: string,
  documentId: string,
  commentId: string,
  resolved: boolean
) {
  await checkDocumentAccess(userId, documentId, 'EDITOR');
  await findRootCommentOrThrow(documentId, commentId);

  return prisma.comment.update({
    where: { id: commentId },
    data: resolved
      ? { resolved: true, resolvedAt: new Date(), resolvedById: userId }
      : { resolved: false, resolvedAt: null, resolvedById: null },
    include: COMMENT_INCLUDE,
  });
}

export function resolveComment(userId: string, documentId: string, commentId: string) {
  return setResolved(userId, documentId, commentId, true);
}

export function unresolveComment(userId: string, documentId: string, commentId: string) {
  return setResolved(userId, documentId, commentId, false);
}
