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
  const { label } = req.body as { label?: string };

  // Prefer the live in-memory room state over whatever's in Postgres — the DB only reflects
  // the room's last debounced/periodic save, which can lag several seconds behind what the
  // user is actually looking at.
  const liveState = getWebSocketServer()?.getLiveDocumentState(id) ?? undefined;

  const version = await versionService.createManualSnapshot(userId, id, label, liveState);
  res.status(201).json({ version });
}

export async function restoreVersionHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const { id, versionId } = req.params;

  const liveState = getWebSocketServer()?.getLiveDocumentState(id) ?? undefined;
  const { version, content, restoredFrom } = await versionService.restoreVersion(userId, id, versionId, liveState);

  // Push the restored content into any live room so connected clients see it immediately, and
  // let everyone in the room know a restore just happened. The DB write already happened inside
  // restoreVersion regardless of whether a room exists.
  const wsServer = getWebSocketServer();
  wsServer?.applyRestoredState(id, content);
  wsServer?.notifyVersionRestored(id, {
    versionNum: restoredFrom.versionNum,
    label: restoredFrom.label,
    restoredBy: version.createdBy.name,
  });

  res.status(200).json({ version });
}
