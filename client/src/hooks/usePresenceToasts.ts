import { useEffect, useRef } from 'react';
import { Awareness } from 'y-protocols/awareness';
import { useToastStore } from '../stores/toastStore';

const LEAVE_GRACE_MS = 5000;

interface RawUserState {
  user?: { name?: string };
}

/**
 * Shows "X joined" / "X left" toasts as remote collaborators connect and disconnect from this
 * document. A "left" toast is delayed by a grace window so a brief network blip (which drops
 * and re-establishes the WebSocket, briefly removing the client from awareness) reads as
 * continuous presence rather than a leave+join pair.
 */
export function usePresenceToasts(awareness: Awareness | null): void {
  const addToast = useToastStore((state) => state.addToast);
  const nameCacheRef = useRef<Map<number, string>>(new Map());
  const seenRef = useRef<Set<number>>(new Set());
  const pendingLeaveRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!awareness) return undefined;

    const nameCache = nameCacheRef.current;
    const seen = seenRef.current;
    const pendingLeave = pendingLeaveRef.current;

    // Seed with whoever's already present so opening a busy document doesn't announce
    // every existing participant as having "just joined".
    awareness.getStates().forEach((state, clientId) => {
      if (clientId === awareness.clientID) return;
      const name = (state as RawUserState).user?.name;
      if (name) {
        nameCache.set(clientId, name);
        seen.add(clientId);
      }
    });

    function handleChange({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) {
      const states = awareness!.getStates();

      added.forEach((clientId) => {
        if (clientId === awareness!.clientID) return;
        const name = (states.get(clientId) as RawUserState | undefined)?.user?.name;
        if (!name) return;
        nameCache.set(clientId, name);

        const pending = pendingLeave.get(clientId);
        if (pending) {
          // Reconnected within the grace window — treat as continuous presence, no toast.
          clearTimeout(pending);
          pendingLeave.delete(clientId);
          return;
        }

        if (!seen.has(clientId)) {
          seen.add(clientId);
          addToast(`${name} joined`, 'info');
        }
      });

      updated.forEach((clientId) => {
        if (clientId === awareness!.clientID) return;
        const name = (states.get(clientId) as RawUserState | undefined)?.user?.name;
        if (name) nameCache.set(clientId, name);
      });

      removed.forEach((clientId) => {
        if (clientId === awareness!.clientID) return;
        const name = nameCache.get(clientId);
        if (!name) return;
        seen.delete(clientId);

        const timeout = setTimeout(() => {
          pendingLeave.delete(clientId);
          addToast(`${name} left`, 'info');
        }, LEAVE_GRACE_MS);
        pendingLeave.set(clientId, timeout);
      });
    }

    awareness.on('change', handleChange);

    return () => {
      awareness.off('change', handleChange);
      pendingLeave.forEach((timeout) => clearTimeout(timeout));
      pendingLeave.clear();
    };
  }, [awareness, addToast]);
}
