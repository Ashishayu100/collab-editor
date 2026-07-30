import { Request, Response } from 'express';
import * as documentService from '../services/document.service';
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
  const { search, sort, order } = req.query as { search?: string; sort?: string; order?: string };

  const documents = await documentService.listDocuments(userId, {
    search,
    sort: sort as documentService.ListDocumentsParams['sort'],
    order: order as documentService.ListDocumentsParams['order'],
  });

  const wsServer = getWebSocketServer();
  const documentsWithPresence = documents.map((doc) => ({
    ...doc,
    activeUsers: wsServer?.getActiveUsers(doc.id) ?? [],
  }));

  res.status(200).json({ documents: documentsWithPresence });
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
