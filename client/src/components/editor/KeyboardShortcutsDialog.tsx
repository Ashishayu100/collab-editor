import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Document',
    shortcuts: [
      { keys: ['Ctrl', 'S'], description: 'Save document' },
      { keys: ['Ctrl', 'K'], description: 'Search documents (dashboard)' },
      { keys: ['Ctrl', 'Shift', 'H'], description: 'Version history' },
      { keys: ['Ctrl', 'Alt', 'M'], description: 'Add comment on selection' },
      { keys: ['Ctrl', 'Shift', 'M'], description: 'Toggle comments panel' },
      { keys: ['Ctrl', '/'], description: 'Show this shortcuts dialog' },
    ],
  },
  {
    title: 'Formatting',
    shortcuts: [
      { keys: ['Ctrl', 'B'], description: 'Bold' },
      { keys: ['Ctrl', 'I'], description: 'Italic' },
      { keys: ['Ctrl', 'U'], description: 'Underline' },
      { keys: ['Ctrl', 'Shift', 'S'], description: 'Strikethrough' },
      { keys: ['Ctrl', 'E'], description: 'Inline code' },
      { keys: ['Ctrl', 'Shift', 'H'], description: 'Highlight (when the editor has focus)' },
      { keys: ['Ctrl', 'Alt', '1'], description: 'Heading 1' },
      { keys: ['Ctrl', 'Alt', '2'], description: 'Heading 2' },
      { keys: ['Ctrl', 'Alt', '3'], description: 'Heading 3' },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="flex min-w-[1.75rem] items-center justify-center rounded-md border border-gray-300 bg-gray-50 px-1.5 py-1 text-[11px] font-semibold text-gray-700 shadow-[0_1px_0_rgba(0,0,0,0.08)]">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsDialog({ isOpen, onClose }: KeyboardShortcutsDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) overlayRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 outline-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-5 py-3.5">
          <h2 className="text-sm font-semibold text-gray-900">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{group.title}</h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.description} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-gray-700">{shortcut.description}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={key} className="flex items-center gap-1">
                          <Kbd>{key}</Kbd>
                          {i < shortcut.keys.length - 1 && <span className="text-xs text-gray-300">+</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
