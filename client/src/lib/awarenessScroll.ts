import type { Editor } from '@tiptap/react';
import { relativePositionToAbsolutePosition, ySyncPluginKey } from '@tiptap/y-tiptap';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

interface YSyncState {
  doc: Y.Doc;
  type: Y.XmlFragment;
  binding: { mapping: Parameters<typeof relativePositionToAbsolutePosition>[3] } | null;
}

/** Resolves a remote client's current cursor to a viewport-relative {top, left}, or null if unavailable. */
export function getClientCursorCoords(
  editor: Editor,
  awareness: Awareness,
  clientId: number
): { top: number; left: number } | null {
  const state = awareness.getStates().get(clientId) as { cursor?: { anchor: unknown; head: unknown } } | undefined;
  if (!state?.cursor) return null;

  const ystate = ySyncPluginKey.getState(editor.state) as YSyncState | undefined;
  if (!ystate?.binding) return null;

  try {
    const relHead = Y.createRelativePositionFromJSON(state.cursor.head);
    const absHead = relativePositionToAbsolutePosition(ystate.doc, ystate.type, relHead, ystate.binding.mapping);
    if (absHead == null) return null;
    return editor.view.coordsAtPos(absHead);
  } catch {
    return null;
  }
}

/** Scrolls the editor's scroll container so a remote client's cursor is centered in view. */
export function scrollToClientCursor(
  editor: Editor,
  awareness: Awareness,
  clientId: number,
  scrollContainer: HTMLElement | null
): boolean {
  const coords = getClientCursorCoords(editor, awareness, clientId);
  if (!coords || !scrollContainer) return false;

  const containerRect = scrollContainer.getBoundingClientRect();
  const targetTop =
    scrollContainer.scrollTop + (coords.top - containerRect.top) - scrollContainer.clientHeight / 2;

  scrollContainer.scrollTo({ top: targetTop, behavior: 'smooth' });
  return true;
}
