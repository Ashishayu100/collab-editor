import { Awareness } from 'y-protocols/awareness';
import { useAwareness } from '../../hooks/useAwareness';

interface PresencePanelProps {
  awareness: Awareness | null;
}

const MAX_VISIBLE_USERS = 4;

export function PresencePanel({ awareness }: PresencePanelProps) {
  const users = useAwareness(awareness);

  if (users.length === 0) return null;

  const visibleUsers = users.slice(0, MAX_VISIBLE_USERS);
  const overflowCount = users.length - visibleUsers.length;

  return (
    <div className="flex items-center -space-x-2">
      {visibleUsers.map((user) => (
        <div
          key={user.clientId}
          title={user.typing ? `${user.name} (typing…)` : user.name}
          className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white shadow-sm"
          style={{ backgroundColor: user.color }}
        >
          {user.name.charAt(0).toUpperCase()}
          {user.typing && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 animate-pulse rounded-full border border-white bg-green-400" />
          )}
        </div>
      ))}
      {overflowCount > 0 && (
        <div
          title={users
            .slice(MAX_VISIBLE_USERS)
            .map((u) => u.name)
            .join(', ')}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-300 text-xs font-semibold text-gray-700 shadow-sm"
        >
          +{overflowCount}
        </div>
      )}
    </div>
  );
}
