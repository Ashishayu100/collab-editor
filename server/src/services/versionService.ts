import { Prisma } from '@prisma/client';
import * as Y from 'yjs';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { checkDocumentAccess } from './document.service';
import { compactYjsState, encodeBufferToBase64 } from '../utils/yjs';

/** Prisma client or an active transaction — lets these functions compose into a caller's transaction. */
type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

const AUTO_SNAPSHOT_MIN_INTERVAL_MS = 10 * 60 * 1000;
const AUTO_SNAPSHOT_GROWTH_THRESHOLD = 1.2; // 20% growth since the last snapshot

const CREATED_BY_SELECT = { id: true, name: true, avatarColor: true } as const;

const VERSION_LIST_SELECT = {
  id: true,
  versionNum: true,
  title: true,
  sizeBytes: true,
  createdAt: true,
  createdBy: { select: CREATED_BY_SELECT },
} as const;

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function getNextVersionNum(client: PrismaClientOrTx, documentId: string): Promise<number> {
  const last = await client.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNum: 'desc' },
    select: { versionNum: true },
  });
  return (last?.versionNum ?? 0) + 1;
}

/**
 * Heuristic for the debounced/periodic save path: only worth a new snapshot if enough time
 * has passed or the state has grown meaningfully since the last one. Manual snapshots (the
 * "Save version" button) bypass this and always create a version.
 */
export async function shouldAutoSnapshot(
  documentId: string,
  currentStateSizeBytes: number,
  client: PrismaClientOrTx = prisma
): Promise<boolean> {
  const lastVersion = await client.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNum: 'desc' },
    select: { createdAt: true, sizeBytes: true },
  });

  if (!lastVersion) return true;

  const isStale = Date.now() - lastVersion.createdAt.getTime() > AUTO_SNAPSHOT_MIN_INTERVAL_MS;
  if (isStale) return true;

  const hasGrownEnough =
    lastVersion.sizeBytes > 0 && currentStateSizeBytes / lastVersion.sizeBytes >= AUTO_SNAPSHOT_GROWTH_THRESHOLD;
  return hasGrownEnough;
}

/**
 * Create a version snapshot. The stored content is garbage-collected/compacted so version
 * history doesn't compound the same tombstoned-content bloat as the live document.
 */
export async function createVersion(
  documentId: string,
  ydocState: Buffer,
  createdById: string,
  titleOverride?: string,
  client: PrismaClientOrTx = prisma
) {
  const compacted = compactYjsState(ydocState);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const title =
        titleOverride ??
        (await client.document.findUniqueOrThrow({ where: { id: documentId }, select: { title: true } })).title;
      const versionNum = await getNextVersionNum(client, documentId);

      return await client.documentVersion.create({
        data: {
          documentId,
          versionNum,
          title,
          content: compacted,
          sizeBytes: compacted.byteLength,
          createdById,
        },
        select: VERSION_LIST_SELECT,
      });
    } catch (error) {
      // Two saves racing to create the same versionNum — retry once with a freshly read number.
      if (attempt === 0 && isUniqueConstraintError(error)) continue;
      throw error;
    }
  }

  throw ApiError.internal('Failed to create document version');
}

export interface ListVersionsParams {
  limit?: number;
  cursor?: string;
}

export async function getVersions(userId: string, documentId: string, params: ListVersionsParams = {}) {
  await checkDocumentAccess(userId, documentId);

  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);

  const versions = await prisma.documentVersion.findMany({
    where: { documentId },
    orderBy: { versionNum: 'desc' },
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    select: VERSION_LIST_SELECT,
  });

  const hasMore = versions.length > limit;
  const items = hasMore ? versions.slice(0, limit) : versions;

  return {
    versions: items,
    nextCursor: hasMore ? items[items.length - 1]!.id : null,
  };
}

export async function getVersion(userId: string, documentId: string, versionId: string) {
  await checkDocumentAccess(userId, documentId);

  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    select: { ...VERSION_LIST_SELECT, documentId: true, content: true },
  });

  if (!version || version.documentId !== documentId) {
    throw ApiError.notFound('Version not found');
  }

  return {
    id: version.id,
    versionNum: version.versionNum,
    title: version.title,
    sizeBytes: version.sizeBytes,
    createdAt: version.createdAt,
    createdBy: version.createdBy,
    content: encodeBufferToBase64(version.content),
  };
}

/** Manual snapshot — always creates a version, regardless of the auto-snapshot heuristic. */
export async function createManualSnapshot(userId: string, documentId: string) {
  await checkDocumentAccess(userId, documentId, 'EDITOR');

  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: { content: true },
  });

  if (!document.content) {
    throw ApiError.badRequest('Document has no content to snapshot');
  }

  return createVersion(documentId, document.content, userId);
}

export interface RestoreVersionResult {
  content: Buffer;
  version: Awaited<ReturnType<typeof createVersion>>;
}

/**
 * Restore a document to an older version's content. Persists the restored state as the
 * document's current content and records the restore itself as a new version. Does NOT talk
 * to the WebSocket layer — the caller is responsible for pushing the restored state into any
 * live in-memory room so connected clients pick it up (see CollabWebSocketServer.applyRestoredState).
 */
export async function restoreVersion(userId: string, documentId: string, versionId: string): Promise<RestoreVersionResult> {
  await checkDocumentAccess(userId, documentId, 'EDITOR');

  const version = await prisma.documentVersion.findUnique({ where: { id: versionId } });
  if (!version || version.documentId !== documentId) {
    throw ApiError.notFound('Version not found');
  }

  // Round-trip through a fresh Y.Doc: validates the stored state and guarantees we persist a
  // clean, self-contained update rather than replaying the raw stored bytes verbatim.
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(version.content));
  const restoredState = Buffer.from(Y.encodeStateAsUpdate(doc));
  doc.destroy();

  await prisma.document.update({ where: { id: documentId }, data: { content: restoredState } });

  const newVersion = await createVersion(documentId, restoredState, userId, `Restored from version ${version.versionNum}`);

  return { content: restoredState, version: newVersion };
}
