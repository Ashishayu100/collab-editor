import { useEffect, useState } from 'react';
import { Awareness } from 'y-protocols/awareness';

export interface AwarenessUser {
  clientId: number;
  name: string;
  color: string;
  colorLight: string;
  typing: boolean;
}

interface RawAwarenessState {
  user?: { name?: string; color?: string; colorLight?: string };
  typing?: boolean;
}

/** Live list of remote users (the local client is excluded), updated on every awareness change. */
export function useAwareness(awareness: Awareness | null): AwarenessUser[] {
  const [users, setUsers] = useState<AwarenessUser[]>([]);

  useEffect(() => {
    const currentAwareness = awareness;
    if (!currentAwareness) {
      setUsers([]);
      return undefined;
    }

    function updateUsers() {
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
