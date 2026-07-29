import * as Y from 'yjs';

/**
 * Create a new Yjs document. Each document in our app gets its own Y.Doc instance.
 */
export function createYDoc(): Y.Doc {
  return new Y.Doc();
}

/**
 * Encode the full state of a Y.Doc as a base64 string.
 * This is what we send to the server for persistence (base64 so it travels as JSON over HTTP).
 */
export function encodeYDocState(ydoc: Y.Doc): string {
  const state = Y.encodeStateAsUpdate(ydoc);
  return uint8ArrayToBase64(state);
}

/**
 * Apply a base64-encoded state to a Y.Doc. This is how we load saved content from the server.
 */
export function applyYDocState(ydoc: Y.Doc, base64State: string): void {
  const state = base64ToUint8Array(base64State);
  Y.applyUpdate(ydoc, state);
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
