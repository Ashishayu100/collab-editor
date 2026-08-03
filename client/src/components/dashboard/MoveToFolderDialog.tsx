import { Folder as FolderIcon, Home, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FolderNode } from '../../api/folders';
import { cn, getErrorMessage } from '../../lib/utils';
import { useDocumentStore } from '../../stores/documentStore';
import { useFolderStore } from '../../stores/folderStore';

interface MoveToFolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  currentFolderId: string | null;
  /** Called after a successful move — the caller's document list is filtered by folder, so it
   *  needs to refetch (moving the document's `folder` field in place doesn't change which list
   *  view it belongs in). */
  onMoved?: () => void;
}

function FolderOption({
  folder,
  depth,
  currentFolderId,
  movingId,
  onMove,
}: {
  folder: FolderNode;
  depth: number;
  currentFolderId: string | null;
  movingId: string | null;
  onMove: (folderId: string) => void;
}) {
  const isCurrent = folder.id === currentFolderId;
  return (
    <div>
      <button
        type="button"
        disabled={isCurrent || movingId !== null}
        onClick={() => onMove(folder.id)}
        style={{ paddingLeft: 12 + depth * 16 }}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg py-1.5 pr-3 text-left text-sm transition-colors duration-150',
          isCurrent ? 'cursor-default bg-blue-50 font-medium text-primary' : 'text-gray-700 hover:bg-gray-100',
          movingId !== null && !isCurrent && 'opacity-50'
        )}
      >
        <FolderIcon size={14} className="shrink-0" />
        <span className="truncate">{folder.name}</span>
        {movingId === folder.id && <Loader2 size={12} className="ml-auto animate-spin" />}
      </button>
      {folder.children.map((child) => (
        <FolderOption key={child.id} folder={child} depth={depth + 1} currentFolderId={currentFolderId} movingId={movingId} onMove={onMove} />
      ))}
    </div>
  );
}

export function MoveToFolderDialog({
  isOpen,
  onClose,
  documentId,
  documentTitle,
  currentFolderId,
  onMoved,
}: MoveToFolderDialogProps) {
  const { folders, fetchFolders } = useFolderStore();
  const moveDocument = useDocumentStore((s) => s.moveDocument);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) void fetchFolders();
  }, [isOpen, fetchFolders]);

  if (!isOpen) return null;

  async function handleMove(folderId: string | null) {
    setMovingId(folderId ?? 'root');
    setError(null);
    try {
      await moveDocument(documentId, folderId);
      onMoved?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setMovingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xs rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
          <h2 className="truncate text-sm font-semibold text-gray-900" title={documentTitle}>
            Move &ldquo;{documentTitle}&rdquo;
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          <button
            type="button"
            disabled={currentFolderId === null || movingId !== null}
            onClick={() => void handleMove(null)}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors duration-150',
              currentFolderId === null ? 'cursor-default bg-blue-50 font-medium text-primary' : 'text-gray-700 hover:bg-gray-100',
              movingId !== null && currentFolderId !== null && 'opacity-50'
            )}
          >
            <Home size={14} />
            Root
            {movingId === 'root' && <Loader2 size={12} className="ml-auto animate-spin" />}
          </button>

          {folders.map((folder) => (
            <FolderOption
              key={folder.id}
              folder={folder}
              depth={0}
              currentFolderId={currentFolderId}
              movingId={movingId}
              onMove={(id) => void handleMove(id)}
            />
          ))}

          {folders.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-gray-400">No folders yet — create one from the sidebar.</p>
          )}
        </div>

        {error && <p className="border-t border-gray-100 px-4 py-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
