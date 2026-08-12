import { Clock, File, Folder as FolderIcon, FolderPlus, MoreVertical, Pencil, Share2, Star, Trash2 } from 'lucide-react';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { FolderNode } from '../../api/folders';
import { cn, getErrorMessage } from '../../lib/utils';
import { useFolderStore } from '../../stores/folderStore';
import { ConfirmDialog } from '../ui/ConfirmDialog';

export type DashboardView =
  | { type: 'all' }
  | { type: 'starred' }
  | { type: 'shared' }
  | { type: 'recent' }
  | { type: 'folder'; folderId: string; folderName: string };

export function viewsEqual(a: DashboardView, b: DashboardView): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'folder' && b.type === 'folder') return a.folderId === b.folderId;
  return true;
}

interface SidebarProps {
  view: DashboardView;
  onSelectView: (view: DashboardView) => void;
}

function NewFolderInput({ onSubmit, onCancel }: { onSubmit: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const trimmed = value.trim();
      if (trimmed) onSubmit(trimmed);
      else onCancel();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => (value.trim() ? onSubmit(value.trim()) : onCancel())}
      placeholder="Folder name"
      className="w-full rounded border border-primary px-2 py-1 text-sm outline-none"
    />
  );
}

function FolderRow({
  folder,
  depth,
  view,
  onSelectView,
}: {
  folder: FolderNode;
  depth: number;
  view: DashboardView;
  onSelectView: (view: DashboardView) => void;
}) {
  const renameFolder = useFolderStore((s) => s.renameFolder);
  const deleteFolder = useFolderStore((s) => s.deleteFolder);
  const createFolder = useFolderStore((s) => s.createFolder);

  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isActive = view.type === 'folder' && view.folderId === folder.id;

  async function handleRename(name: string) {
    setIsRenaming(false);
    if (name === folder.name) return;
    try {
      await renameFolder(folder.id, name);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleConfirmDelete() {
    setIsDeleting(true);
    try {
      await deleteFolder(folder.id);
      setIsDeleteConfirmOpen(false);
      if (isActive) onSelectView({ type: 'all' });
    } catch (err) {
      setError(getErrorMessage(err));
      setIsDeleteConfirmOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleAddChild(name: string) {
    setIsAddingChild(false);
    try {
      await createFolder(name, folder.id);
      setExpanded(true);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm',
          isActive ? 'bg-blue-50 font-medium text-primary' : 'text-gray-600 hover:bg-gray-100'
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {folder.children.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="shrink-0 text-gray-400 hover:text-gray-600"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <FolderIcon size={14} className="shrink-0" />
        {isRenaming ? (
          <input
            autoFocus
            defaultValue={folder.name}
            onBlur={(e) => void handleRename(e.target.value.trim() || folder.name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            className="min-w-0 flex-1 rounded border border-primary px-1 text-sm outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => onSelectView({ type: 'folder', folderId: folder.id, folderName: folder.name })}
            className="min-w-0 flex-1 truncate text-left"
            title={folder.name}
          >
            {folder.name}
          </button>
        )}
        {folder.documentCount > 0 && !isRenaming && (
          <span className="shrink-0 text-xs text-gray-400">{folder.documentCount}</span>
        )}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded p-0.5 text-gray-400 opacity-0 hover:bg-gray-200 group-hover:opacity-100"
            aria-label="Folder options"
          >
            <MoreVertical size={13} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 text-xs shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setIsAddingChild(true);
                  setExpanded(true);
                }}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50"
              >
                <FolderPlus size={12} /> New subfolder
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setIsRenaming(true);
                }}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50"
              >
                <Pencil size={12} /> Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setIsDeleteConfirmOpen(true);
                }}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="px-2 text-[11px] text-red-600" style={{ paddingLeft: 8 + depth * 14 }}>
          {error}
        </p>
      )}

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title={`Delete "${folder.name}"?`}
        description="Documents inside will move to the root. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isConfirming={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setIsDeleteConfirmOpen(false)}
      />

      {expanded && (
        <div>
          {folder.children.map((child) => (
            <FolderRow key={child.id} folder={child} depth={depth + 1} view={view} onSelectView={onSelectView} />
          ))}
          {isAddingChild && (
            <div className="py-0.5" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
              <NewFolderInput onSubmit={handleAddChild} onCancel={() => setIsAddingChild(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const NAV_ITEMS: { view: DashboardView; label: string; icon: typeof File }[] = [
  { view: { type: 'all' }, label: 'All Documents', icon: File },
  { view: { type: 'starred' }, label: 'Starred', icon: Star },
  { view: { type: 'shared' }, label: 'Shared with me', icon: Share2 },
  { view: { type: 'recent' }, label: 'Recent', icon: Clock },
];

export function Sidebar({ view, onSelectView }: SidebarProps) {
  const { folders, fetchFolders, createFolder } = useFolderStore();
  const [isCreatingRoot, setIsCreatingRoot] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchFolders();
  }, [fetchFolders]);

  async function handleCreateRoot(name: string) {
    setIsCreatingRoot(false);
    try {
      await createFolder(name, null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <aside className="flex h-full w-full flex-col gap-1 overflow-y-auto border-r border-gray-200 px-2 py-4">
      {NAV_ITEMS.map(({ view: itemView, label, icon: Icon }) => (
        <button
          key={label}
          type="button"
          onClick={() => onSelectView(itemView)}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm',
            viewsEqual(view, itemView) ? 'bg-blue-50 font-medium text-primary' : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          <Icon size={15} /> {label}
        </button>
      ))}

      <div className="mt-4 flex items-center justify-between px-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Folders</span>
      </div>

      <div className="flex flex-col gap-0.5">
        {folders.map((folder) => (
          <FolderRow key={folder.id} folder={folder} depth={0} view={view} onSelectView={onSelectView} />
        ))}
      </div>

      {isCreatingRoot ? (
        <div className="px-2 py-1">
          <NewFolderInput onSubmit={handleCreateRoot} onCancel={() => setIsCreatingRoot(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsCreatingRoot(true)}
          className="mt-1 flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-gray-500 hover:bg-gray-100"
        >
          <FolderPlus size={15} /> New Folder
        </button>
      )}

      {error && <p className="px-3 text-xs text-red-600">{error}</p>}
    </aside>
  );
}
