import * as Y from 'yjs';

/**
 * Create an empty Yjs document state as a Buffer. Used when creating a new document.
 */
export function createEmptyYDocState(): Buffer {
  const ydoc = new Y.Doc();
  const state = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return Buffer.from(state);
}

/**
 * Decode a base64-encoded Yjs state from the client into a Buffer for DB storage.
 */
export function decodeBase64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

/**
 * Encode a Buffer from the DB into a base64 string for sending to the client.
 */
export function encodeBufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

/**
 * Validate that a base64 string decodes to a valid Yjs state by applying it to a
 * temporary Y.Doc — if it throws, it's invalid.
 */
export function isValidYjsState(base64: string): boolean {
  try {
    const ydoc = new Y.Doc();
    const state = Buffer.from(base64, 'base64');
    Y.applyUpdate(ydoc, state);
    ydoc.destroy();
    return true;
  } catch {
    return false;
  }
}

/**
 * Merge a client update into an existing document state, returning the new full
 * state as a Buffer. Used when persisting incremental updates rather than full state.
 */
export function mergeYjsState(existingState: Buffer | null, update: Buffer): Buffer {
  const ydoc = new Y.Doc();

  if (existingState && existingState.length > 0) {
    Y.applyUpdate(ydoc, existingState);
  }

  Y.applyUpdate(ydoc, update);

  const mergedState = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return Buffer.from(mergedState);
}

/**
 * Re-encode a Yjs state through a garbage-collected Y.Doc, dropping tombstoned/deleted
 * content that the original update history was carrying. Shrinks state size for documents
 * with a lot of edit history without changing the document's current content.
 */
export function compactYjsState(state: Buffer): Buffer {
  const doc = new Y.Doc({ gc: true });
  Y.applyUpdate(doc, state);
  const compacted = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return Buffer.from(compacted);
}
