import type { Editor } from '@tiptap/react';
import { relativePositionToAbsolutePosition, ySyncPluginKey } from '@tiptap/y-tiptap';
import { useEffect, useRef, useState } from 'react';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { cn } from '../../lib/utils';

interface RemoteCursorPosition {
  clientId: number;
  name: string;
  color: string;
  top: number;
  left: number;
  height: number;
  typing: boolean;
}

interface RemoteCursorsOverlayProps {
  editor: Editor;
  awareness: Awareness | null;
}

interface YSyncState {
  doc: Y.Doc;
  type: Y.XmlFragment;
  binding: { mapping: Parameters<typeof relativePositionToAbsolutePosition>[3] } | null;
}

interface RawCursorAwarenessState {
  user?: { name?: string; color?: string };
  cursor?: { anchor: unknown; head: unknown };
  typing?: boolean;
}

const IDLE_THRESHOLD_MS = 3000;
const IDLE_TICK_MS = 1000;

/**
 * Renders remote collaborators' cursors as our own absolutely-positioned, React-keyed DOM
 * elements instead of relying on CollaborationCaret's built-in rendering. That extension
 * rebuilds its cursor DOM from scratch (a fresh ProseMirror widget decoration) on *every*
 * remote awareness change — including ones from users who didn't move — so there's no stable
 * element for CSS to transition between positions. Keeping our own React-managed elements
 * (keyed by awareness clientId) means the browser sees the *same* element move, which is what
 * makes the `top`/`left` CSS transition below actually glide instead of jumping.
 */
export function RemoteCursorsOverlay({ editor, awareness }: RemoteCursorsOverlayProps) {
  const [cursors, setCursors] = useState<RemoteCursorPosition[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const overlayRef = useRef<HTMLDivElement>(null);
  /** Last time each client's rendered position/typing state actually changed — drives the idle fade. */
  const activitySnapshotRef = useRef<Map<number, { top: number; left: number; typing: boolean; ts: number }>>(
    new Map()
  );

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), IDLE_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!awareness) {
      setCursors([]);
      return undefined;
    }

    let rafId: number | null = null;

    function recompute() {
      rafId = null;
      const view = editor.view;
      if (editor.isDestroyed || !overlayRef.current) return;

      const ystate = ySyncPluginKey.getState(editor.state) as YSyncState | undefined;
      if (!ystate?.binding) return;

      const overlayRect = overlayRef.current.getBoundingClientRect();
      const next: RemoteCursorPosition[] = [];

      awareness!.getStates().forEach((rawState, clientId) => {
        if (clientId === awareness!.clientID) return;
        const state = rawState as RawCursorAwarenessState;
        if (!state.user?.name || !state.user?.color || !state.cursor) return;

        try {
          const relHead = Y.createRelativePositionFromJSON(state.cursor.head);
          const absHead = relativePositionToAbsolutePosition(
            ystate.doc,
            ystate.type,
            relHead,
            ystate.binding!.mapping
          );
          if (absHead == null) return;

          const coords = view.coordsAtPos(absHead);
          // ProseMirror's coordsAtPos occasionally reports a degenerate all-zero rect for one
          // frame right as a remote client's initial cursor state arrives (a transient browser
          // layout-timing artifact, not a real position at the viewport's corner) — skip it and
          // let the next awareness/transaction-triggered recompute self-correct.
          if (coords.top === 0 && coords.bottom === 0 && coords.left === 0 && coords.right === 0) return;

          const top = coords.top - overlayRect.top;
          const left = coords.left - overlayRect.left;
          const typing = state.typing === true;

          const prev = activitySnapshotRef.current.get(clientId);
          const moved = !prev || prev.top !== top || prev.left !== left || prev.typing !== typing;
          activitySnapshotRef.current.set(clientId, { top, left, typing, ts: moved ? Date.now() : prev!.ts });

          next.push({
            clientId,
            name: state.user!.name!,
            color: state.user!.color!,
            top,
            left,
            height: coords.bottom - coords.top,
            typing,
          });
        } catch {
          // Position no longer resolvable mid-restructure — skip this client for this frame.
        }
      });

      // Drop stale entries for clients that disconnected.
      const liveIds = new Set(next.map((c) => c.clientId));
      activitySnapshotRef.current.forEach((_, clientId) => {
        if (!liveIds.has(clientId)) activitySnapshotRef.current.delete(clientId);
      });

      setCursors(next);
    }

    function scheduleRecompute() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(recompute);
    }

    awareness.on('update', scheduleRecompute);
    editor.on('transaction', scheduleRecompute);
    window.addEventListener('resize', scheduleRecompute);
    scheduleRecompute();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      awareness.off('update', scheduleRecompute);
      editor.off('transaction', scheduleRecompute);
      window.removeEventListener('resize', scheduleRecompute);
    };
  }, [editor, awareness]);

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {cursors.map((cursor) => {
        const activity = activitySnapshotRef.current.get(cursor.clientId);
        const idle = !activity || now - activity.ts > IDLE_THRESHOLD_MS;
        return (
          <div
            key={cursor.clientId}
            className={cn('remote-cursor', cursor.typing && 'remote-cursor--typing')}
            style={{ top: cursor.top, left: cursor.left, height: cursor.height, backgroundColor: cursor.color }}
          >
            <div
              className={cn('remote-cursor__label', idle && 'remote-cursor__label--idle')}
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
