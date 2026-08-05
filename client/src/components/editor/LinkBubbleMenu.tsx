import { type Editor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Check, ExternalLink, Pencil, Unlink } from 'lucide-react';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';

interface LinkBubbleMenuProps {
  editor: Editor;
}

/** Floating popover shown whenever the cursor sits inside a link — view the URL, edit it inline, or remove it. */
export function LinkBubbleMenu({ editor }: LinkBubbleMenuProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { href } = useEditorState({
    editor,
    selector: ({ editor }) => ({ href: (editor.getAttributes('link').href as string | undefined) ?? '' }),
  });

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  function startEditing() {
    setDraftUrl(href);
    setIsEditing(true);
  }

  function applyEdit() {
    const trimmed = draftUrl.trim();
    if (trimmed) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
    }
    setIsEditing(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  }

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor }) => editor.isActive('link')}
      options={{ placement: 'bottom-start', offset: 8, onHide: () => setIsEditing(false) }}
      className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm shadow-lg"
    >
      {isEditing ? (
        <>
          <input
            ref={inputRef}
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://example.com"
            className="w-56 rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={applyEdit}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-primary hover:bg-blue-50"
            aria-label="Save link"
          >
            <Check size={14} />
          </button>
        </>
      ) : (
        <>
          <ExternalLink size={13} className="shrink-0 text-gray-400" />
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="max-w-[220px] truncate text-blue-600 hover:underline"
          >
            {href}
          </a>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={startEditing}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
            aria-label="Edit link"
            title="Edit link"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().unsetLink().run()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-red-50 hover:text-red-600"
            aria-label="Remove link"
            title="Remove link"
          >
            <Unlink size={13} />
          </button>
        </>
      )}
    </BubbleMenu>
  );
}
