import { Request, Response } from 'express';
import * as documentService from '../services/document.service';
import { getDocumentTracker } from '../services/documentTrackerRegistry';
import { ApiError } from '../utils/ApiError';
import { getWebSocketServer } from '../websocket/registry';

function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  return req.user.userId;
}

export async function listDocumentsHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { search, sort, order, filter, folder, starred, limit } = req.query as {
    search?: string;
    sort?: string;
    order?: string;
    filter?: string;
    folder?: string;
    starred?: string;
    limit?: string;
  };

  const documents = await documentService.listDocuments(userId, {
    search,
    sort: sort as documentService.ListDocumentsParams['sort'],
    order: order as documentService.ListDocumentsParams['order'],
    filter: filter as documentService.ListDocumentsParams['filter'],
    folder: folder as documentService.ListDocumentsParams['folder'],
    starred: starred === 'true' ? true : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  const wsServer = getWebSocketServer();
  // `activeUsers` (name + color, for avatar dots) only reflects rooms live on THIS server
  // instance. `activeUserCount` is the cross-server truth from Redis — the one the dashboard's
  // "N editing" badge should trust, since a document's editors may be connected to a different
  // instance than the one serving this request.
  const tracker = getDocumentTracker();
  const activeUserCounts = tracker ? await tracker.getActiveUserCounts(documents.map((doc) => doc.id)) : new Map();

  const documentsWithPresence = documents.map((doc) => ({
    ...doc,
    activeUsers: wsServer?.getActiveUsers(doc.id) ?? [],
    activeUserCount: activeUserCounts.get(doc.id) ?? 0,
  }));

  res.status(200).json({ documents: documentsWithPresence });
}

export async function searchDocumentsHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { q } = req.query as { q?: string };

  const documents = await documentService.searchDocuments(userId, q ?? '');
  res.status(200).json({ documents });
}

export async function toggleStarHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params;

  const starred = await documentService.toggleStar(userId, id);
  res.status(200).json({ starred });
}

export async function moveDocumentHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params;
  const { folderId } = req.body as { folderId: string | null };

  const document = await documentService.moveDocument(userId, id, folderId);
  res.status(200).json({ document });
}

export async function createDocumentHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { title } = req.body as { title?: string };

  const document = await documentService.createDocument(userId, title);
  res.status(201).json({ document });
}

export async function getDocumentHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params;

  const document = await documentService.getDocumentById(userId, id);
  const activeUsers = getWebSocketServer()?.getActiveUsers(id) ?? [];
  res.status(200).json({ document: { ...document, activeUsers } });
}

/** Cross-server active-user snapshot for a single document, backed by Redis (see
 *  RedisDocumentTracker) rather than this instance's own in-memory room state. Access is
 *  enforced by the `requireDocumentAccess('VIEWER')` route middleware. */
export async function getActiveUsersHandler(req: Request, res: Response): Promise<void> {
  requireUserId(req);
  const { id } = req.params;

  const tracker = getDocumentTracker();
  const [count, users] = tracker
    ? await Promise.all([tracker.getActiveUserCount(id), tracker.getActiveUsers(id)])
    : [0, []];

  res.status(200).json({ count, users });
}

export async function updateDocumentTitleHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params;
  const { title } = req.body as { title: string };

  const document = await documentService.updateDocumentTitle(userId, id, title);
  res.status(200).json({ document });
}

export async function saveDocumentContentHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params;
  const { content } = req.body as { content: string };

  const result = await documentService.saveDocumentContent(userId, id, content);
  res.status(200).json({ success: true, updatedAt: result.updatedAt });
}

export async function deleteDocumentHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params;

  await documentService.deleteDocument(userId, id);
  res.status(200).json({ success: true });
}
