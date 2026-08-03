import { Request, Response } from 'express';
import * as commentService from '../services/comment.service';
import { ApiError } from '../utils/ApiError';
import { getWebSocketServer } from '../websocket/registry';

function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  return req.user.userId;
}

export async function listCommentsHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params;
  const { resolved } = req.query as { resolved?: string };

  const comments = await commentService.listComments(userId, id, {
    resolved: resolved === undefined ? undefined : resolved === 'true',
  });

  res.status(200).json({ comments });
}

export async function createCommentHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params;
  const { content, anchorText, anchorOffset } = req.body as {
    content: string;
    anchorText?: string;
    anchorOffset?: number;
  };

  const comment = await commentService.createComment(userId, id, { content, anchorText, anchorOffset });
  getWebSocketServer()?.broadcastCommentEvent(id, { type: 'comment:created', comment });

  res.status(201).json({ comment });
}

export async function replyToCommentHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id, commentId } = req.params;
  const { content } = req.body as { content: string };

  const reply = await commentService.replyToComment(userId, id, commentId, content);
  getWebSocketServer()?.broadcastCommentEvent(id, { type: 'comment:replied', comment: reply, parentId: commentId });

  res.status(201).json({ comment: reply });
}

export async function editCommentHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id, commentId } = req.params;
  const { content } = req.body as { content: string };

  const comment = await commentService.editComment(userId, id, commentId, content);
  getWebSocketServer()?.broadcastCommentEvent(id, { type: 'comment:edited', comment });

  res.status(200).json({ comment });
}

export async function deleteCommentHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id, commentId } = req.params;

  const deleted = await commentService.deleteComment(userId, id, commentId);
  getWebSocketServer()?.broadcastCommentEvent(id, {
    type: 'comment:deleted',
    commentId: deleted.id,
    parentId: deleted.parentId ?? undefined,
  });

  res.status(204).send();
}

export async function resolveCommentHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id, commentId } = req.params;

  const comment = await commentService.resolveComment(userId, id, commentId);
  getWebSocketServer()?.broadcastCommentEvent(id, { type: 'comment:resolved', comment });

  res.status(200).json({ comment });
}

export async function unresolveCommentHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id, commentId } = req.params;

  const comment = await commentService.unresolveComment(userId, id, commentId);
  getWebSocketServer()?.broadcastCommentEvent(id, { type: 'comment:unresolved', comment });

  res.status(200).json({ comment });
}
