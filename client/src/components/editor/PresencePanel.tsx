import { Awareness } from 'y-protocols/awareness';
import { AwarenessRole, useAwareness } from '../../hooks/useAwareness';

interface PresencePanelProps {
  awareness: Awareness | null;
  /** Called when an avatar is clicked — the caller scrolls the editor to that client's cursor. */
  onAvatarClick?: (clientId: number) => void;
}

const MAX_VISIBLE_USERS = 5;

const ROLE_LABELS: Record<AwarenessRole, string> = {
  OWNER: 'Owner',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};

export function PresencePanel({ awareness, onAvatarClick }: PresencePanelProps) {
  const users = useAwareness(awareness);

  if (users.length === 0) return null;

  const visibleUsers = users.slice(0, MAX_VISIBLE_USERS);
  const overflowCount = users.length - visibleUsers.length;

  return (
    <div className="flex items-center -space-x-2">
      {visibleUsers.map((user) => (
        <button
          key={user.clientId}
          type="button"
          onClick={() => onAvatarClick?.(user.clientId)}
          title={`${user.name}${user.role ? ` (${ROLE_LABELS[user.role]})` : ''}${user.typing ? ' — typing…' : ''}`}
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white shadow-sm transition-transform duration-150 hover:z-10 hover:scale-110"
          style={{ backgroundColor: user.color }}
        >
          {user.name.charAt(0).toUpperCase()}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white ${
              user.typing ? 'animate-pulse bg-green-400' : 'bg-green-500'
            }`}
          />
        </button>
      ))}
      {overflowCount > 0 && (
        <div
          title={users
            .slice(MAX_VISIBLE_USERS)
            .map((u) => u.name)
            .join(', ')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-gray-300 text-xs font-semibold text-gray-700 shadow-sm"
        >
          +{overflowCount}
        </div>
      )}
    </div>
  );
}
