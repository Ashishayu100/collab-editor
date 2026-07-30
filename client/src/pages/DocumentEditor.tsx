import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Check, History, Loader2, Share2 } from 'lucide-react';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Editor, EditorHandle } from '../components/editor/Editor';
import { PresencePanel } from '../components/editor/PresencePanel';
import { VersionHistoryPanel } from '../components/editor/VersionHistoryPanel';
import { ConnectionStatus } from '../lib/WebSocketProvider';
import { SaveStatus, useDocumentStore } from '../stores/documentStore';

/** Isolated so its periodic re-render (to keep "Xs ago" fresh) doesn't touch the rest of the header. */
function SavedTimeAgo({ lastSavedAt }: { lastSavedAt: Date }) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  return <>{formatDistanceToNow(lastSavedAt, { addSuffix: true })}</>;
}

function ConnectionIndicator({
  status,
  saveStatus,
  isSavePending,
  lastSavedAt,
  onRetrySave,
}: {
  status: ConnectionStatus;
  saveStatus: SaveStatus;
  isSavePending: boolean;
  lastSavedAt: Date | null;
  onRetrySave: () => void;
}) {
  // Being offline overrides everything else — no save state matters if we're not connected.
  if (status === ConnectionStatus.DISCONNECTED || status === ConnectionStatus.ERROR) {
    return (
      <span className="flex flex-col items-end text-xs text-red-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" /> Offline
        </span>
        <span className="text-[10px] text-gray-400">Changes will sync when reconnected</span>
      </span>
    );
  }

  if (status === ConnectionStatus.CONNECTING) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-600">
        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" /> Connecting...
      </span>
    );
  }

  if (saveStatus === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-600">
        Save failed
        <button type="button" onClick={onRetrySave} className="underline hover:no-underline">
          Retry
        </button>
      </span>
    );
  }

  if (saveStatus === 'saving' || isSavePending) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Saving...
      </span>
    );
  }

  if (lastSavedAt) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-green-600">
        <Check size={14} /> Saved <SavedTimeAgo lastSavedAt={lastSavedAt} />
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-green-600">
      <span className="h-2 w-2 rounded-full bg-green-500" /> Connected
    </span>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
        <div className="h-6 w-6 animate-pulse rounded bg-gray-100" />
        <div className="h-5 w-48 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="mx-auto mt-10 w-full max-w-[720px] space-y-4 px-8">
        <div className="h-8 w-2/3 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
      </div>
    </div>
  );
}

export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentDocument,
    isLoading,
    error,
    saveStatus,
    connectionStatus,
    awareness,
    isSavePending,
    lastSavedAt,
    fetchDocument,
    updateTitle,
    clearCurrentDocument,
  } = useDocumentStore();

  const [titleDraft, setTitleDraft] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isTitleSaving, setIsTitleSaving] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);

  const editorRef = useRef<EditorHandle>(null);

  useEffect(() => {
    if (!id) return undefined;
    void fetchDocument(id);
    return () => {
      clearCurrentDocument();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    setTitleDraft(currentDocument?.title ?? '');
  }, [currentDocument?.id, currentDocument?.title]);

  function startEditingTitle() {
    setTitleDraft(currentDocument?.title ?? '');
    setIsEditingTitle(true);
  }

  async function submitTitle() {
    setIsEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (!currentDocument || !trimmed || trimmed === currentDocument.title) {
      setTitleDraft(currentDocument?.title ?? '');
      return;
    }
    setIsTitleSaving(true);
    try {
      await updateTitle(currentDocument.id, trimmed);
    } finally {
      setIsTitleSaving(false);
    }
  }

  function handleTitleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setTitleDraft(currentDocument?.title ?? '');
      setIsEditingTitle(false);
    }
  }

  if (!id) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isLoading && !currentDocument) {
    return <EditorSkeleton />;
  }

  if (!currentDocument) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-gray-600">{error ?? 'This document could not be loaded.'}</p>
        <Link to="/dashboard" className="font-medium text-primary hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="shrink-0 rounded p-1.5 text-gray-500 transition-colors duration-150 hover:bg-gray-100"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={18} />
          </button>
          {isEditingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={submitTitle}
              onKeyDown={handleTitleKeyDown}
              className="min-w-0 flex-1 border-b border-primary bg-transparent px-1 text-lg font-medium text-gray-900 outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={startEditingTitle}
              disabled={currentDocument.role === 'VIEWER'}
              className="truncate rounded px-1 text-lg font-medium text-gray-900 transition-colors duration-150 hover:bg-gray-100 disabled:cursor-default disabled:hover:bg-transparent"
              title={currentDocument.role === 'VIEWER' ? currentDocument.title : 'Click to rename'}
            >
              {currentDocument.title}
            </button>
          )}
          {isTitleSaving && <Loader2 size={14} className="shrink-0 animate-spin text-gray-400" />}
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <PresencePanel awareness={awareness} />
          <div key={lastSavedAt?.getTime() ?? (saveStatus === 'saved' ? 'saved' : connectionStatus)} className="fade-in">
            <ConnectionIndicator
              status={connectionStatus}
              saveStatus={saveStatus}
              isSavePending={isSavePending}
              lastSavedAt={lastSavedAt}
              onRetrySave={() => editorRef.current?.retrySave()}
            />
          </div>
          <button
            type="button"
            onClick={() => setIsVersionHistoryOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-200"
            title="Version history"
          >
            <History size={14} /> History
          </button>
          <button
            type="button"
            title="Coming soon"
            className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-500"
          >
            <Share2 size={14} /> Share
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <Editor
          key={currentDocument.id}
          ref={editorRef}
          documentId={currentDocument.id}
          initialContent={currentDocument.content}
          editable={currentDocument.role !== 'VIEWER'}
        />
      </div>

      <VersionHistoryPanel
        documentId={currentDocument.id}
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        canRestore={currentDocument.role !== 'VIEWER'}
        onRestored={() => void fetchDocument(currentDocument.id)}
      />
    </div>
  );
}
