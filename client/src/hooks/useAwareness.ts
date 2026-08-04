import { useEffect, useRef, useState } from 'react';
import { Awareness } from 'y-protocols/awareness';

export type AwarenessRole = 'VIEWER' | 'EDITOR' | 'OWNER';

export interface AwarenessUser {
  clientId: number;
  name: string;
  color: string;
  colorLight: string;
  typing: boolean;
  role: AwarenessRole | null;
  /** Timestamp of the last awareness change (cursor move, typing, etc.) seen for this client. */
  lastActiveAt: number;
}

interface RawAwarenessState {
  user?: { name?: string; color?: string; colorLight?: string; role?: AwarenessRole | null };
  typing?: boolean;
}

/** Live list of remote users (the local client is excluded), updated on every awareness change. */
export function useAwareness(awareness: Awareness | null): AwarenessUser[] {
  const [users, setUsers] = useState<AwarenessUser[]>([]);
  const lastActiveRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    const currentAwareness = awareness;
    if (!currentAwareness) {
      setUsers([]);
      lastActiveRef.current.clear();
      return undefined;
    }

    function updateUsers(changed?: { added: number[]; updated: number[]; removed: number[] }) {
      const now = Date.now();
      if (changed) {
        changed.added.concat(changed.updated).forEach((clientId) => lastActiveRef.current.set(clientId, now));
        changed.removed.forEach((clientId) => lastActiveRef.current.delete(clientId));
      }

      const states = currentAwareness!.getStates();
      const nextUsers: AwarenessUser[] = [];

      states.forEach((rawState, clientId) => {
        if (clientId === currentAwareness!.clientID) return;

        const state = rawState as unknown as RawAwarenessState;
        const user = state.user;
        if (!user || typeof user.name !== 'string' || typeof user.color !== 'string') return;

        nextUsers.push({
          clientId,
          name: user.name,
          color: user.color,
          colorLight: typeof user.colorLight === 'string' ? user.colorLight : `${user.color}20`,
          typing: state.typing === true,
          role: user.role ?? null,
          lastActiveAt: lastActiveRef.current.get(clientId) ?? now,
        });
      });

      setUsers(nextUsers);
    }

    currentAwareness.on('change', updateUsers);
    updateUsers();

    return () => {
      currentAwareness.off('change', updateUsers);
    };
  }, [awareness]);

  return users;
}
