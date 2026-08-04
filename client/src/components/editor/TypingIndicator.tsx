import { Awareness } from 'y-protocols/awareness';
import { useAwareness } from '../../hooks/useAwareness';
import { cn } from '../../lib/utils';

interface TypingIndicatorProps {
  awareness: Awareness | null;
}

function formatTypingLabel(names: string[]): string {
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]} are typing`;
  return `${names.length} people are typing`;
}

/**
 * Subscribes to awareness on its own, isolated from the rest of the editor tree, so frequent
 * awareness updates (every remote keystroke resets the `typing` flag) only re-render this small
 * component rather than the whole Editor.
 */
export function TypingIndicator({ awareness }: TypingIndicatorProps) {
  const users = useAwareness(awareness);
  const typingNames = users.filter((u) => u.typing).map((u) => u.name);
  const active = typingNames.length > 0;

  return (
    <div className={cn('typing-indicator', active && 'typing-indicator--active')}>
      {active && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-gray-600">
          <span>{formatTypingLabel(typingNames)}</span>
          <span className="typing-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        </div>
      )}
    </div>
  );
}
