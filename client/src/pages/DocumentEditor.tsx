import type { JSONContent } from '@tiptap/core';
import { ArrowLeft, Check, Loader2, Share2 } from 'lucide-react';
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Editor } from '../components/editor/Editor';
import { useAuthStore } from '../stores/authStore';
import { SaveStatus, useDocumentStore } from '../stores/documentStore';

const AUTOSAVE_DELAY_MS = 2000;

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Saving...
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-green-600">
        <Check size={14} /> Saved
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-600">
        Save failed
        <button type="button" onClick={onRetry} className="underline hover:no-underline">
          Retry
        </button>
      </span>
    );
  }
  return null;
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
    fetchDocument,
    saveContent,
    updateTitle,
    clearCurrentDocument,
  } = useDocumentStore();

  const [titleDraft, setTitleDraft] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isTitleSaving, setIsTitleSaving] = useState(false);

  const contentRef = useRef<JSONContent | null>(null);
  const isDirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const documentIdRef = useRef<string | undefined>(id);
  documentIdRef.current = id;

  useEffect(() => {
    if (!id) return undefined;
    void fetchDocument(id);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (isDirtyRef.current && contentRef.current) {
        void saveContent(id, JSON.stringify(contentRef.current));
      }
      contentRef.current = null;
      isDirtyRef.current = false;
      clearCurrentDocument();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    setTitleDraft(currentDocument?.title ?? '');
  }, [currentDocument?.id, currentDocument?.title]);

  const performSave = useCallback(() => {
    const docId = documentIdRef.current;
    const content = contentRef.current;
    if (!docId || !content) return;
    isDirtyRef.current = false;
    saveContent(docId, JSON.stringify(content)).catch(() => {
      // saveStatus is already reflected as 'error' by the store
    });
  }, [saveContent]);

  function handleContentChange(content: JSONContent) {
    contentRef.current = content;
    isDirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(performSave, AUTOSAVE_DELAY_MS);
  }

  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        performSave();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [performSave]);

  useEffect(() => {
    function handleBeforeUnload() {
      const docId = documentIdRef.current;
      const content = contentRef.current;
      if (!docId || !content || !isDirtyRef.current) return;

      const token = useAuthStore.getState().accessToken;
      void fetch(`/api/documents/${docId}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: JSON.stringify(content) }),
        keepalive: true,
      });
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

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

  const initialContent = useMemo<JSONContent | undefined>(() => {
    if (!currentDocument?.content) return undefined;
    try {
      return JSON.parse(currentDocument.content) as JSONContent;
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDocument?.id]);

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
          <div key={saveStatus} className="fade-in">
            <SaveIndicator status={saveStatus} onRetry={performSave} />
          </div>
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
          documentId={currentDocument.id}
          initialContent={initialContent}
          editable={currentDocument.role !== 'VIEWER'}
          onSave={handleContentChange}
        />
      </div>
    </div>
  );
}
