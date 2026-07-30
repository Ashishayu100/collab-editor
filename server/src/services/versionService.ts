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
/** Auto-snapshots (label === null) beyond this count are pruned; labeled snapshots are never pruned. */
const AUTO_SNAPSHOT_KEEP_COUNT = 50;

const CREATED_BY_SELECT = { id: true, name: true, avatarColor: true } as const;

const VERSION_LIST_SELECT = {
  id: true,
  versionNum: true,
  title: true,
  label: true,
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

export interface CreateVersionOptions {
  /** Document title to record on the snapshot; defaults to the document's current title. */
  titleOverride?: string;
  /** User-provided name for this snapshot. Leave undefined/null for auto-snapshots — the
   *  pruning policy and "Auto-save" display both key off label being null. */
  label?: string | null;
  /** Prisma client or an active transaction, so this composes into a caller's transaction. */
  client?: PrismaClientOrTx;
}

/**
 * Delete auto-snapshots (label === null) beyond the most recent AUTO_SNAPSHOT_KEEP_COUNT for a
 * document. Labeled (manually named) snapshots are never touched, regardless of age or count.
 */
export async function pruneVersions(documentId: string, client: PrismaClientOrTx = prisma): Promise<void> {
  const excessAutoVersions = await client.documentVersion.findMany({
    where: { documentId, label: null },
    orderBy: { versionNum: 'desc' },
    select: { id: true },
    skip: AUTO_SNAPSHOT_KEEP_COUNT,
  });

  if (excessAutoVersions.length === 0) return;

  await client.documentVersion.deleteMany({
    where: { id: { in: excessAutoVersions.map((v) => v.id) } },
  });
}

export async function getVersionCount(documentId: string, client: PrismaClientOrTx = prisma): Promise<number> {
  return client.documentVersion.count({ where: { documentId } });
}

/**
 * Create a version snapshot. The stored content is garbage-collected/compacted so version
 * history doesn't compound the same tombstoned-content bloat as the live document. Prunes
 * excess auto-snapshots afterward (a no-op for documents under the keep-count).
 */
export async function createVersion(
  documentId: string,
  ydocState: Buffer,
  createdById: string,
  options: CreateVersionOptions = {}
) {
  const { titleOverride, label = null, client = prisma } = options;
  const compacted = compactYjsState(ydocState);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const title =
        titleOverride ??
        (await client.document.findUniqueOrThrow({ where: { id: documentId }, select: { title: true } })).title;
      const versionNum = await getNextVersionNum(client, documentId);

      const version = await client.documentVersion.create({
        data: {
          documentId,
          versionNum,
          title,
          label,
          content: compacted,
          sizeBytes: compacted.byteLength,
          createdById,
        },
        select: VERSION_LIST_SELECT,
      });

      await pruneVersions(documentId, client);
      return version;
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

  const [versions, total] = await Promise.all([
    prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { versionNum: 'desc' },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: VERSION_LIST_SELECT,
    }),
    getVersionCount(documentId),
  ]);

  const hasMore = versions.length > limit;
  const items = hasMore ? versions.slice(0, limit) : versions;

  return {
    versions: items,
    nextCursor: hasMore ? items[items.length - 1]!.id : null,
    total,
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
    label: version.label,
    sizeBytes: version.sizeBytes,
    createdAt: version.createdAt,
    createdBy: version.createdBy,
    content: encodeBufferToBase64(version.content),
  };
}

/**
 * Manual snapshot — always creates a version, regardless of the auto-snapshot heuristic.
 * `liveContentOverride` should be the live in-memory room state (see
 * CollabWebSocketServer.getLiveDocumentState) when one exists: Postgres only reflects the
 * room's last debounced/periodic save, so reading `document.content` directly here could
 * snapshot content that's several seconds stale relative to what the user is actually looking
 * at. Falls back to the DB when nobody has the document open over WebSocket.
 */
export async function createManualSnapshot(
  userId: string,
  documentId: string,
  label?: string,
  liveContentOverride?: Buffer
) {
  await checkDocumentAccess(userId, documentId, 'EDITOR');

  const content =
    liveContentOverride ??
    (
      await prisma.document.findUniqueOrThrow({
        where: { id: documentId },
        select: { content: true },
      })
    ).content;

  if (!content) {
    throw ApiError.badRequest('Document has no content to snapshot');
  }

  const trimmedLabel = label?.trim();
  return createVersion(documentId, content, userId, { label: trimmedLabel || null });
}

export interface RestoreVersionResult {
  content: Buffer;
  version: Awaited<ReturnType<typeof createVersion>>;
  /** The version the user actually chose to restore to — distinct from `version`, which is the
   *  new "Restored from version N" entry created to record the restore itself. */
  restoredFrom: { versionNum: number; label: string | null };
}

/**
 * Restore a document to an older version's content. Persists the restored state as the
 * document's current content, snapshots the pre-restore state first (so the restore itself is
 * undoable), and records the restore as a new version. Does NOT talk to the WebSocket layer —
 * the caller is responsible for pushing the restored state into any live in-memory room so
 * connected clients pick it up (see CollabWebSocketServer.applyRestoredState).
 *
 * `liveContentOverride` should be the live in-memory room state (see
 * CollabWebSocketServer.getLiveDocumentState) when one exists, so the pre-restore safety
 * snapshot captures what's actually on everyone's screen right now rather than whatever
 * Postgres happens to have from the last debounced/periodic save.
 */
export async function restoreVersion(
  userId: string,
  documentId: string,
  versionId: string,
  liveContentOverride?: Buffer
): Promise<RestoreVersionResult> {
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

  const newVersion = await prisma.$transaction(async (tx) => {
    const currentContent =
      liveContentOverride ??
      (await tx.document.findUniqueOrThrow({ where: { id: documentId }, select: { content: true } })).content;

    // Snapshot whatever's live right now, before we overwrite it, so the restore can be undone.
    // Labeled (not pruned) since it's the only copy of this exact pre-restore state.
    if (currentContent) {
      await createVersion(documentId, currentContent, userId, {
        label: `Auto-save before restore to version ${version.versionNum}`,
        client: tx,
      });
    }

    await tx.document.update({ where: { id: documentId }, data: { content: restoredState } });

    return createVersion(documentId, restoredState, userId, {
      label: `Restored from version ${version.versionNum}`,
      client: tx,
    });
  });

  return {
    content: restoredState,
    version: newVersion,
    restoredFrom: { versionNum: version.versionNum, label: version.label },
  };
}
