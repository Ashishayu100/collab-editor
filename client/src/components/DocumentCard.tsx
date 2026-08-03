import { formatDistanceToNow } from 'date-fns';
import { FileText, LogOut, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentListItem } from '../api/documents';

interface DocumentCardProps {
  doc: DocumentListItem;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onLeave: (documentId: string, collaboratorId: string) => Promise<void>;
}

const ROLE_BADGE_STYLES: Record<string, string> = {
  OWNER: 'bg-gray-100 text-gray-600',
  EDITOR: 'bg-blue-50 text-blue-700',
  VIEWER: 'bg-amber-50 text-amber-700',
};

function AvatarCircle({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full border-2 border-white font-medium text-white"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.4 }}
      title={name}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function DocumentCard({ doc, onRename, onDelete, onLeave }: DocumentCardProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(doc.title);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function submitRename() {
    setIsRenaming(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== doc.title) {
      await onRename(doc.id, trimmed);
    } else {
      setTitleDraft(doc.title);
    }
  }

  function handleRenameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setTitleDraft(doc.title);
      setIsRenaming(false);
    }
  }

  async function handleDelete() {
    setMenuOpen(false);
    if (window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) {
      await onDelete(doc.id);
    }
  }

  async function handleLeave() {
    setMenuOpen(false);
    if (!doc.myCollaboratorId) return;
    if (window.confirm(`Leave "${doc.title}"? You'll lose access unless it's shared with you again.`)) {
      await onLeave(doc.id, doc.myCollaboratorId);
    }
  }

  const isOwner = doc.role === 'OWNER';
  const otherCollaborators = doc.collaborators.filter((c) => c.id !== doc.owner.id).slice(0, 3);

  return (
    <div
      onClick={() => !isRenaming && navigate(`/document/${doc.id}`)}
      className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow duration-150 hover:shadow-md"
    >
      <div className="relative mb-6 flex h-24 items-center justify-center rounded-lg bg-gray-50">
        <FileText className="text-gray-300" size={32} />
        {doc.activeUsers.length > 0 && (
          <div
            title={doc.activeUsers.map((u) => u.name).join(', ')}
            className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-medium text-green-700 shadow-sm"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            {doc.activeUsers.length === 1 ? '1 editing' : `${doc.activeUsers.length} editing`}
          </div>
        )}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${ROLE_BADGE_STYLES[doc.role]}`}
        >
          {doc.role.toLowerCase()}
        </span>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <input
              autoFocus
              value={titleDraft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={submitRename}
              onKeyDown={handleRenameKeyDown}
              className="w-full rounded border border-primary px-1 py-0.5 text-sm font-medium outline-none"
            />
          ) : (
            <h3 className="truncate text-sm font-medium text-gray-900">{doc.title}</h3>
          )}
          <p className="mt-1 truncate text-xs text-gray-500">
            {isOwner ? (
              <>Edited {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}</>
            ) : (
              <>Shared by {doc.owner.name}</>
            )}
          </p>
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((open) => !open);
            }}
            className="rounded p-1 text-gray-400 opacity-0 transition-opacity duration-150 hover:bg-gray-100 group-hover:opacity-100"
            aria-label="Document options"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            >
              {isOwner ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRenaming(true);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil size={14} /> Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleLeave()}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut size={14} /> Leave
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <AvatarCircle name={doc.owner.name} color={doc.owner.avatarColor} />
        {otherCollaborators.length > 0 && (
          <div className="flex -space-x-2">
            {otherCollaborators.map((c) => (
              <AvatarCircle key={c.id} name={c.name} color={c.avatarColor} size={22} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
