import { Request, Response } from 'express';
import * as versionService from '../services/versionService';
import { ApiError } from '../utils/ApiError';
import { getWebSocketServer } from '../websocket/registry';

function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  return req.user.userId;
}

export async function listVersionsHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params;
  const { limit, cursor } = req.query as { limit?: string; cursor?: string };

  const result = await versionService.getVersions(userId, id, {
    limit: limit ? Number(limit) : undefined,
    cursor,
  });

  res.status(200).json(result);
}

export async function getVersionHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id, versionId } = req.params;

  const version = await versionService.getVersion(userId, id, versionId);
  res.status(200).json({ version });
}

export async function createVersionHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id } = req.params;

  const version = await versionService.createManualSnapshot(userId, id);
  res.status(201).json({ version });
}

export async function restoreVersionHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id, versionId } = req.params;

  const { version, content } = await versionService.restoreVersion(userId, id, versionId);

  // Push the restored content into any live room so connected clients see it immediately.
  // The DB write already happened inside restoreVersion regardless of whether a room exists.
  getWebSocketServer()?.applyRestoredState(id, content);

  res.status(200).json({ version });
}
