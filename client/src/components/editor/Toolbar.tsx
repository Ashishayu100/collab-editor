import { type Editor, useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Code,
  Eraser,
  FileCode,
  FileDown,
  FileType,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  Indent,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Loader2,
  LucideIcon,
  MessageSquarePlus,
  Minus,
  MoreHorizontal,
  Outdent,
  Pilcrow,
  Printer,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { downloadDocumentExport, ExportFormat } from '../../api/exportApi';
import { useOutsideClick } from '../../hooks/useOutsideClick';
import { useDocumentStore } from '../../stores/documentStore';
import { useToastStore } from '../../stores/toastStore';
import { cn } from '../../lib/utils';
import { getErrorMessage } from '../../lib/utils';
import { LinkBubbleMenu } from './LinkBubbleMenu';
import { LinkModal } from './LinkModal';

interface ToolbarProps {
  editor: Editor;
  /** Dims the toolbar and blocks all interaction (pointer-events) — TipTap commands invoked
   *  programmatically bypass `editable: false`, so this is the actual enforcement, not just decoration. */
  readOnly?: boolean;
  /** Opens the "new comment" composer, anchored to the current selection if there is one. Omitted (VIEWER) hides the button. */
  onComment?: () => void;
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

const BLOCK_TYPE_OPTIONS = [
  { key: 'paragraph', label: 'Normal text' },
  { key: 'heading1', label: 'Heading 1' },
  { key: 'heading2', label: 'Heading 2' },
  { key: 'heading3', label: 'Heading 3' },
  { key: 'bulletList', label: 'Bullet List' },
  { key: 'orderedList', label: 'Numbered List' },
  { key: 'taskList', label: 'Task List' },
  { key: 'codeBlock', label: 'Code Block' },
  { key: 'blockquote', label: 'Blockquote' },
] as const;

type BlockTypeKey = (typeof BLOCK_TYPE_OPTIONS)[number]['key'];

function applyBlockType(editor: Editor, key: BlockTypeKey) {
  const chain = editor.chain().focus();
  switch (key) {
    case 'paragraph':
      chain.setParagraph().run();
      break;
    case 'heading1':
      chain.toggleHeading({ level: 1 }).run();
      break;
    case 'heading2':
      chain.toggleHeading({ level: 2 }).run();
      break;
    case 'heading3':
      chain.toggleHeading({ level: 3 }).run();
      break;
    case 'bulletList':
      chain.toggleBulletList().run();
      break;
    case 'orderedList':
      chain.toggleOrderedList().run();
      break;
    case 'taskList':
      chain.toggleTaskList().run();
      break;
    case 'codeBlock':
      chain.toggleCodeBlock().run();
      break;
    case 'blockquote':
      chain.toggleBlockquote().run();
      break;
  }
}

function BlockTypeDropdown({ editor, currentKey }: { editor: Editor; currentKey: BlockTypeKey }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useOutsideClick(containerRef, () => setOpen(false), open);

  const currentLabel = BLOCK_TYPE_OPTIONS.find((o) => o.key === currentKey)?.label ?? 'Normal text';

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 min-w-[132px] shrink-0 items-center justify-between gap-1.5 rounded-md px-2.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-200"
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown size={14} className="shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {BLOCK_TYPE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                applyBlockType(editor, option.key);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50',
                option.key === currentKey && 'font-medium text-primary'
              )}
            >
              {option.label}
              {option.key === currentKey && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#fef08a' },
  { name: 'Green', value: '#bbf7d0' },
  { name: 'Blue', value: '#bfdbfe' },
  { name: 'Pink', value: '#fbcfe8' },
  { name: 'Orange', value: '#fed7aa' },
  { name: 'Purple', value: '#e9d5ff' },
];

function HighlightDropdown({ editor, isActive, currentColor }: { editor: Editor; isActive: boolean; currentColor: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useOutsideClick(containerRef, () => setOpen(false), open);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        title="Highlight"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-8 w-8 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md text-gray-600 transition-colors duration-150 hover:bg-gray-200',
          isActive && 'bg-blue-100 text-primary hover:bg-blue-100'
        )}
      >
        <Highlighter size={16} />
        <span
          className="h-[3px] w-4 rounded-full"
          style={{ backgroundColor: isActive && currentColor ? currentColor : '#d1d5db' }}
        />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 flex w-44 flex-wrap gap-1.5 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              title={color.name}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().toggleHighlight({ color: color.value }).run();
                setOpen(false);
              }}
              className="h-6 w-6 shrink-0 rounded-full border border-black/10 transition-transform duration-100 hover:scale-110"
              style={{ backgroundColor: color.value }}
            />
          ))}
          <button
            type="button"
            title="None"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().unsetHighlight().run();
              setOpen(false);
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-400 hover:bg-gray-50"
          >
            <span className="h-px w-3.5 rotate-45 bg-gray-400" />
          </button>
        </div>
      )}
    </div>
  );
}

const EXPORT_OPTIONS: { format: ExportFormat; label: string; icon: LucideIcon }[] = [
  { format: 'pdf', label: 'PDF', icon: FileDown },
  { format: 'markdown', label: 'Markdown', icon: FileCode },
  { format: 'html', label: 'HTML', icon: FileType },
];

function MoreMenu({ editor, documentId }: { editor: Editor; documentId?: string }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useOutsideClick(containerRef, () => setOpen(false), open);
  const documentTitle = useDocumentStore((state) => state.currentDocument?.title ?? 'Untitled Document');
  const addToast = useToastStore((state) => state.addToast);

  async function handleExport(format: ExportFormat) {
    if (!documentId || exporting) return;
    setExporting(format);
    try {
      await downloadDocumentExport(documentId, format, editor.getHTML(), documentTitle);
    } catch (error) {
      addToast(getErrorMessage(error), 'error');
    } finally {
      setExporting(null);
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <ToolbarButton label="More" icon={MoreHorizontal} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().clearNodes().unsetAllMarks().run();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <Eraser size={14} className="text-gray-400" /> Clear formatting
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen(false);
              window.print();
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <Printer size={14} className="text-gray-400" /> Print
          </button>

          {documentId && (
            <>
              <div className="my-1 h-px bg-gray-100" />
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Export</div>
              {EXPORT_OPTIONS.map(({ format, label, icon: Icon }) => (
                <button
                  key={format}
                  type="button"
                  disabled={exporting !== null}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void handleExport(format)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exporting === format ? (
                    <Loader2 size={14} className="animate-spin text-gray-400" />
                  ) : (
                    <Icon size={14} className="text-gray-400" />
                  )}
                  Export as {label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Toolbar({ editor, readOnly = false, onComment }: ToolbarProps) {
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const documentId = useDocumentStore((state) => state.currentDocument?.id);

  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      highlight: editor.isActive('highlight'),
      highlightColor: (editor.getAttributes('highlight').color as string | undefined) ?? '',
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
      canIndent: editor.can().sinkListItem('listItem'),
      canOutdent: editor.can().liftListItem('listItem'),
    }),
  });

  const currentBlockType: BlockTypeKey = state.heading1
    ? 'heading1'
    : state.heading2
      ? 'heading2'
      : state.heading3
        ? 'heading3'
        : state.bulletList
          ? 'bulletList'
          : state.orderedList
            ? 'orderedList'
            : state.taskList
              ? 'taskList'
              : state.codeBlock
                ? 'codeBlock'
                : state.blockquote
                  ? 'blockquote'
                  : 'paragraph';

  return (
    <div
      className={cn(
        'sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-[#F9FAFB] px-3 py-1.5',
        readOnly && 'pointer-events-none opacity-50'
      )}
      aria-disabled={readOnly}
    >
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

      <BlockTypeDropdown editor={editor} currentKey={currentBlockType} />

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
        shortcut="Ctrl+Shift+S"
        icon={Strikethrough}
        isActive={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <HighlightDropdown editor={editor} isActive={state.highlight} currentColor={state.highlightColor} />
      <ToolbarButton
        label="Inline code"
        shortcut="Ctrl+E"
        icon={Code}
        isActive={state.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
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
        label="Indent"
        icon={Indent}
        disabled={!state.canIndent}
        onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
      />
      <ToolbarButton
        label="Outdent"
        icon={Outdent}
        disabled={!state.canOutdent}
        onClick={() => editor.chain().focus().liftListItem('listItem').run()}
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
      <ToolbarButton
        label="Image"
        icon={ImageIcon}
        onClick={() => {
          const url = window.prompt('Image URL:');
          if (url) editor.chain().focus().setImage({ src: url }).run();
        }}
      />

      {onComment && (
        <>
          <Divider />
          <ToolbarButton label="Comment" shortcut="Ctrl+Alt+M" icon={MessageSquarePlus} onClick={onComment} />
        </>
      )}

      <Divider />

      <MoreMenu editor={editor} documentId={documentId} />

      <LinkBubbleMenu editor={editor} />
    </div>
  );
}
