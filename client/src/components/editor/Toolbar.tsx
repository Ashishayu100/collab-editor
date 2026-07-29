import { type Editor, useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  LucideIcon,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils';
import { LinkModal } from './LinkModal';

interface ToolbarProps {
  editor: Editor;
}

interface ToolbarButtonProps {
  label: string;
  shortcut?: string;
  icon: LucideIcon;
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolbarButton({ label, shortcut, icon: Icon, isActive, disabled, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={isActive}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors duration-150 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
        isActive && 'bg-blue-100 text-primary hover:bg-blue-100'
      )}
    >
      <Icon size={16} />
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-6 w-px shrink-0 bg-gray-300" aria-hidden />;
}

export function Toolbar({ editor }: ToolbarProps) {
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      highlight: editor.isActive('highlight'),
      code: editor.isActive('code'),
      heading1: editor.isActive('heading', { level: 1 }),
      heading2: editor.isActive('heading', { level: 2 }),
      heading3: editor.isActive('heading', { level: 3 }),
      paragraph: editor.isActive('paragraph'),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      taskList: editor.isActive('taskList'),
      alignLeft: editor.isActive({ textAlign: 'left' }),
      alignCenter: editor.isActive({ textAlign: 'center' }),
      alignRight: editor.isActive({ textAlign: 'right' }),
      blockquote: editor.isActive('blockquote'),
      codeBlock: editor.isActive('codeBlock'),
      link: editor.isActive('link'),
      linkHref: (editor.getAttributes('link').href as string | undefined) ?? '',
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  });

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-[#F9FAFB] px-3 py-1.5">
      <ToolbarButton
        label="Undo"
        shortcut="Ctrl+Z"
        icon={Undo2}
        disabled={!state.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <ToolbarButton
        label="Redo"
        shortcut="Ctrl+Shift+Z"
        icon={Redo2}
        disabled={!state.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      />

      <Divider />

      <ToolbarButton
        label="Bold"
        shortcut="Ctrl+B"
        icon={Bold}
        isActive={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="Italic"
        shortcut="Ctrl+I"
        icon={Italic}
        isActive={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        label="Underline"
        shortcut="Ctrl+U"
        icon={UnderlineIcon}
        isActive={state.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolbarButton
        label="Strikethrough"
        shortcut="Ctrl+Shift+X"
        icon={Strikethrough}
        isActive={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <ToolbarButton
        label="Highlight"
        shortcut="Ctrl+Shift+H"
        icon={Highlighter}
        isActive={state.highlight}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      />
      <ToolbarButton
        label="Inline code"
        shortcut="Ctrl+E"
        icon={Code}
        isActive={state.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />

      <Divider />

      <ToolbarButton
        label="Heading 1"
        icon={Heading1}
        isActive={state.heading1}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        label="Heading 2"
        icon={Heading2}
        isActive={state.heading2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        label="Heading 3"
        icon={Heading3}
        isActive={state.heading3}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <ToolbarButton
        label="Normal text"
        icon={Pilcrow}
        isActive={state.paragraph}
        onClick={() => editor.chain().focus().setParagraph().run()}
      />

      <Divider />

      <ToolbarButton
        label="Bullet list"
        icon={List}
        isActive={state.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label="Ordered list"
        icon={ListOrdered}
        isActive={state.orderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="Task list"
        icon={ListTodo}
        isActive={state.taskList}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      />

      <Divider />

      <ToolbarButton
        label="Align left"
        icon={AlignLeft}
        isActive={state.alignLeft}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      />
      <ToolbarButton
        label="Align center"
        icon={AlignCenter}
        isActive={state.alignCenter}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      />
      <ToolbarButton
        label="Align right"
        icon={AlignRight}
        isActive={state.alignRight}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      />

      <Divider />

      <ToolbarButton
        label="Blockquote"
        icon={Quote}
        isActive={state.blockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        label="Code block"
        icon={SquareCode}
        isActive={state.codeBlock}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <ToolbarButton
        label="Horizontal rule"
        icon={Minus}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />
      <div className="relative">
        <ToolbarButton
          label="Link"
          icon={Link2}
          isActive={state.link}
          onClick={() => setLinkModalOpen((open) => !open)}
        />
        {linkModalOpen && (
          <LinkModal
            initialUrl={state.linkHref}
            onApply={(url) => {
              editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
              setLinkModalOpen(false);
            }}
            onRemove={() => {
              editor.chain().focus().unsetLink().run();
              setLinkModalOpen(false);
            }}
            onClose={() => setLinkModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
