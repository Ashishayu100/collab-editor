import { Eye, Pencil, UserCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Awareness } from 'y-protocols/awareness';
import { AwarenessRole, useAwareness } from '../../hooks/useAwareness';
import { getUserColor } from '../../lib/colors';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/authStore';

interface ParticipantsPanelProps {
  awareness: Awareness | null;
  isOpen: boolean;
  onClose: () => void;
  currentUserRole: AwarenessRole;
  followingClientId: number | null;
  onFollow: (clientId: number) => void;
  onStopFollow: () => void;
}

const ROLE_BADGE: Record<AwarenessRole, { label: string; className: string }> = {
  OWNER: { label: 'Owner', className: 'bg-amber-100 text-amber-700' },
  EDITOR: { label: 'Editor', className: 'bg-blue-50 text-blue-700' },
  VIEWER: { label: 'Viewer', className: 'bg-gray-100 text-gray-600' },
};

const IDLE_THRESHOLD_MS = 60000;
const NOW_TICK_MS = 5000;

function AvatarCircle({ name, color, size = 30 }: { name: string; color: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function ParticipantsPanel({
  awareness,
  isOpen,
  onClose,
  currentUserRole,
  followingClientId,
  onFollow,
  onStopFollow,
}: ParticipantsPanelProps) {
  const users = useAwareness(awareness);
  const currentUser = useAuthStore((state) => state.user);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) return undefined;
    const interval = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const currentUserColor = currentUser ? getUserColor(currentUser.id) : null;

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {users.length + 1} online
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close participants"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {currentUser && currentUserColor && (
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 opacity-70">
            <AvatarCircle name={currentUser.name} color={currentUserColor.color} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{currentUser.name} (You)</p>
              <span className={cn('inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold', ROLE_BADGE[currentUserRole].className)}>
                {ROLE_BADGE[currentUserRole].label}
              </span>
            </div>
          </div>
        )}

        {users.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-gray-400">No one else is here right now.</p>
        )}

        <div className="space-y-0.5">
          {users.map((user) => {
            const isIdle = now - user.lastActiveAt > IDLE_THRESHOLD_MS;
            const status = user.typing ? 'Editing' : isIdle ? 'Idle' : 'Viewing';
            const isFollowing = followingClientId === user.clientId;

            return (
              <div key={user.clientId} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-gray-50">
                <AvatarCircle name={user.name} color={user.color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {user.role && (
                      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', ROLE_BADGE[user.role].className)}>
                        {ROLE_BADGE[user.role].label}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[11px] text-gray-500">
                      {status === 'Editing' && <Pencil size={10} className="animate-pulse text-green-600" />}
                      {status === 'Viewing' && <Eye size={10} />}
                      {status === 'Idle' && <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />}
                      {status}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => (isFollowing ? onStopFollow() : onFollow(user.clientId))}
                  className={cn(
                    'flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors duration-150',
                    isFollowing ? 'bg-primary text-white hover:bg-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  <UserCheck size={11} />
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
