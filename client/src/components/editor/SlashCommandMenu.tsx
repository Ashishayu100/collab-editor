import type { SuggestionKeyDownProps } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { cn } from '../../lib/utils';
import type { SlashCommandItem } from '../../extensions/SlashCommand';

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export interface SlashCommandMenuHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(function SlashCommandMenu(
  { items, command },
  ref
) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="min-w-[240px] rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-400 shadow-lg">
        No matching commands
      </div>
    );
  }

  return (
    <div className="max-h-80 min-w-[240px] overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
      {items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command(item)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-100',
            index === selectedIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500">
            {item.icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-gray-900">{item.title}</span>
            <span className="block truncate text-xs text-gray-400">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
});
