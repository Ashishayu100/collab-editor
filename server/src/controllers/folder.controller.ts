import { Request, Response } from 'express';
import * as folderService from '../services/folder.service';
import { ApiError } from '../utils/ApiError';

function requireUserId(req: Request): string {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  return req.user.userId;
}

export async function listFoldersHandler(req: Request, res: Response): Promise<void> {
  const folders = await folderService.listFolders(requireUserId(req));
  res.status(200).json({ folders });
}

export async function createFolderHandler(req: Request, res: Response): Promise<void> {
  const { name, parentId } = req.body as { name: string; parentId?: string };
  const folder = await folderService.createFolder(requireUserId(req), name, parentId ?? null);
  res.status(201).json({ folder });
}

export async function renameFolderHandler(req: Request, res: Response): Promise<void> {
  const { name } = req.body as { name: string };
  const folder = await folderService.renameFolder(requireUserId(req), req.params.id, name);
  res.status(200).json({ folder });
}

export async function deleteFolderHandler(req: Request, res: Response): Promise<void> {
  await folderService.deleteFolder(requireUserId(req), req.params.id);
  res.status(204).send();
}
