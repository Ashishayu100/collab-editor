import { formatDistanceToNow } from 'date-fns';
import { Check, Loader2, MessageSquare, MessageSquarePlus, MoreVertical, Pencil, Trash2, X } from 'lucide-react';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Comment, CommentReply } from '../../api/comments';
import { getUserColor } from '../../lib/colors';
import { getErrorMessage } from '../../lib/utils';
import { CommentFilterTab, useCommentStore } from '../../stores/commentStore';

interface CommentsPanelProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  canComment: boolean;
  isOwner: boolean;
  currentUserId: string;
  /** Set by the editor when the user asks to add a comment; undefined = no pending trigger. */
  pendingAnchor?: { text: string; offset: number } | null;
  onAnchorConsumed: () => void;
}

const FILTER_TABS: { value: CommentFilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
];

function AvatarCircle({ name, userId, size = 24 }: { name: string; userId: string; size?: number }) {
  const { color } = getUserColor(userId);
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.45 }}
      title={name}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Composer({
  autoFocus,
  initialValue = '',
  placeholder,
  submitLabel,
  isSubmitting,
  onSubmit,
  onCancel,
}: {
  autoFocus?: boolean;
  initialValue?: string;
  placeholder: string;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (content: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      onCancel?.();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !value.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors duration-150 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && <Loader2 size={12} className="animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function ReplyItem({ reply }: { reply: CommentReply }) {
  return (
    <div className="ml-3 flex gap-2 border-l-2 border-gray-100 py-2 pl-3">
      <AvatarCircle name={reply.user.name} userId={reply.userId} size={20} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 text-xs">
          <span className="font-medium text-gray-900">{reply.user.name}</span>
          <span className="text-gray-400">{formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">{reply.content}</p>
      </div>
    </div>
  );
}

function ThreadItem({
  documentId,
  comment,
  currentUserId,
  isOwner,
  canComment,
  isActive,
  onSetActive,
}: {
  documentId: string;
  comment: Comment;
  currentUserId: string;
  isOwner: boolean;
  canComment: boolean;
  isActive: boolean;
  onSetActive: () => void;
}) {
  const addReply = useCommentStore((s) => s.addReply);
  const editComment = useCommentStore((s) => s.editComment);
  const deleteComment = useCommentStore((s) => s.deleteComment);
  const resolveComment = useCommentStore((s) => s.resolveComment);
  const unresolveComment = useCommentStore((s) => s.unresolveComment);

  const [menuOpen, setMenuOpen] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthor = comment.userId === currentUserId;
  const canDelete = isAuthor || isOwner;

  async function run(action: () => Promise<void>) {
    setIsBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div
      onClick={onSetActive}
      className={`group rounded-lg border px-3 py-2.5 transition-colors duration-150 ${
        isActive ? 'border-primary bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
      } ${comment.resolved ? 'opacity-60' : ''}`}
    >
      {comment.anchorText && (
        <div
          className={`mb-1.5 truncate rounded border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-xs text-gray-600 ${
            comment.resolved ? 'line-through' : ''
          }`}
        >
          &ldquo;{comment.anchorText}&rdquo;
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <AvatarCircle name={comment.user.name} userId={comment.userId} />
          <div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-medium text-gray-900">{comment.user.name}</span>
              {comment.resolved && (
                <span className="flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                  <Check size={10} /> Resolved
                </span>
              )}
            </div>
            <span className="text-[11px] text-gray-400">
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>

        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded p-1 text-gray-400 opacity-0 hover:bg-gray-100 group-hover:opacity-100"
            aria-label="Comment options"
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-32 rounded-lg border border-gray-200 bg-white py-1 text-xs shadow-lg">
              {canComment && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void run(() =>
                      comment.resolved ? unresolveComment(documentId, comment.id) : resolveComment(documentId, comment.id)
                    );
                  }}
                  className="block w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50"
                >
                  {comment.resolved ? 'Unresolve' : 'Resolve'}
                </button>
              )}
              {isAuthor && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setIsEditing(true);
                  }}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50"
                >
                  <Pencil size={12} /> Edit
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    if (window.confirm('Delete this comment and all its replies?')) {
                      void run(() => deleteComment(documentId, comment.id));
                    }
                  }}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <Composer
            autoFocus
            initialValue={comment.content}
            placeholder="Edit comment"
            submitLabel="Save"
            isSubmitting={isBusy}
            onSubmit={(content) => {
              void run(() => editComment(documentId, comment.id, content)).then(() => setIsEditing(false));
            }}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-800">{comment.content}</p>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {comment.replies.length > 0 && (
        <div className="mt-2 space-y-1">
          {comment.replies.map((reply) => (
            <ReplyItem key={reply.id} reply={reply} />
          ))}
        </div>
      )}

      {canComment && !isEditing && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          {isReplying ? (
            <Composer
              autoFocus
              placeholder="Write a reply…"
              submitLabel="Reply"
              isSubmitting={isBusy}
              onSubmit={(content) => {
                void run(() => addReply(documentId, comment.id, content)).then(() => setIsReplying(false));
              }}
              onCancel={() => setIsReplying(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsReplying(true)}
              className="text-xs font-medium text-gray-500 hover:text-primary"
            >
              Reply
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CommentsPanel({
  documentId,
  isOpen,
  onClose,
  canComment,
  isOwner,
  currentUserId,
  pendingAnchor,
  onAnchorConsumed,
}: CommentsPanelProps) {
  const comments = useCommentStore((s) => s.comments);
  const loading = useCommentStore((s) => s.loading);
  const error = useCommentStore((s) => s.error);
  const filter = useCommentStore((s) => s.filter);
  const setFilter = useCommentStore((s) => s.setFilter);
  const activeCommentId = useCommentStore((s) => s.activeCommentId);
  const setActiveComment = useCommentStore((s) => s.setActiveComment);
  const addComment = useCommentStore((s) => s.addComment);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerAnchor, setComposerAnchor] = useState<{ text: string; offset: number } | null>(null);
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  const threadRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (pendingAnchor === undefined) return;
    setComposerAnchor(pendingAnchor);
    setComposerOpen(true);
    onAnchorConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAnchor]);

  useEffect(() => {
    if (!activeCommentId) return;
    threadRefs.current.get(activeCommentId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeCommentId]);

  const filtered = comments.filter((c) => {
    if (filter === 'open') return !c.resolved;
    if (filter === 'resolved') return c.resolved;
    return true;
  });

  const openCount = comments.filter((c) => !c.resolved).length;

  if (!isOpen) return null;

  async function handlePostComment(content: string) {
    setComposerBusy(true);
    setComposerError(null);
    try {
      const comment = await addComment(documentId, content, composerAnchor?.text, composerAnchor?.offset);
      setActiveComment(comment.id);
      setComposerOpen(false);
      setComposerAnchor(null);
    } catch (err) {
      setComposerError(getErrorMessage(err));
    } finally {
      setComposerBusy(false);
    }
  }

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <MessageSquare size={16} /> Comments
          {comments.length > 0 && <span className="font-normal text-gray-400">({openCount} open)</span>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close comments"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200 px-3 pt-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            className={`border-b-2 px-2 pb-2 text-xs font-medium transition-colors duration-150 ${
              filter === tab.value ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {canComment && (
        <div className="border-b border-gray-200 p-3">
          {composerOpen ? (
            <div className="flex flex-col gap-2">
              {composerAnchor && (
                <div className="truncate rounded border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-xs text-gray-600">
                  &ldquo;{composerAnchor.text}&rdquo;
                </div>
              )}
              <Composer
                autoFocus
                placeholder={composerAnchor ? 'Comment on this selection…' : 'Add a comment…'}
                submitLabel="Post"
                isSubmitting={composerBusy}
                onSubmit={handlePostComment}
                onCancel={() => {
                  setComposerOpen(false);
                  setComposerAnchor(null);
                  setComposerError(null);
                }}
              />
              {composerError && <p className="text-xs text-red-600">{composerError}</p>}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setComposerAnchor(null);
                setComposerOpen(true);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600"
            >
              <MessageSquarePlus size={14} /> Add comment
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && comments.length === 0 && (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            <Loader2 size={16} className="mr-2 animate-spin" /> Loading comments…
          </div>
        )}

        {!loading && filtered.length === 0 && !error && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-gray-400">
            <MessageSquare size={24} />
            {filter === 'resolved' ? 'No resolved comments yet.' : filter === 'open' ? 'No open comments.' : 'No comments yet.'}
          </div>
        )}

        {error && <p className="px-2 py-2 text-sm text-red-600">{error}</p>}

        <div className="space-y-2">
          {filtered.map((comment) => (
            <div
              key={comment.id}
              ref={(el) => {
                if (el) threadRefs.current.set(comment.id, el);
                else threadRefs.current.delete(comment.id);
              }}
            >
              <ThreadItem
                documentId={documentId}
                comment={comment}
                currentUserId={currentUserId}
                isOwner={isOwner}
                canComment={canComment}
                isActive={comment.id === activeCommentId}
                onSetActive={() => setActiveComment(comment.id)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
