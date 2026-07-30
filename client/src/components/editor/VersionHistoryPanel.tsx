import Collaboration from '@tiptap/extension-collaboration';
import { EditorContent, useEditor } from '@tiptap/react';
import { formatDistanceToNow } from 'date-fns';
import { Clock, History, Loader2, RotateCcw, Save, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { VersionSummary } from '../../api/versions';
import { useVersions } from '../../hooks/useVersions';
import { applyYDocState } from '../../lib/yjs';
import { getErrorMessage } from '../../lib/utils';
import { getContentExtensions } from './contentExtensions';
import './editor.css';

interface VersionHistoryPanelProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  canRestore: boolean;
  onRestored: () => void;
}

function VersionPreview({ content }: { content: string }) {
  const ydoc = useMemo(() => {
    const doc = new Y.Doc();
    try {
      applyYDocState(doc, content);
    } catch (error) {
      console.warn('Could not decode version content for preview', error);
    }
    return doc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  useEffect(() => {
    return () => {
      ydoc.destroy();
    };
  }, [ydoc]);

  const editor = useEditor(
    {
      extensions: [...getContentExtensions(), Collaboration.configure({ document: ydoc, field: 'default' })],
      editable: false,
      immediatelyRender: false,
    },
    [ydoc]
  );

  if (!editor) {
    return <div className="flex items-center justify-center py-12 text-sm text-gray-400">Loading preview…</div>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="px-6 py-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function VersionListItem({
  version,
  isSelected,
  onSelect,
}: {
  version: VersionSummary;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ${
        isSelected ? 'border-primary bg-blue-50' : 'border-transparent hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-gray-900">{version.title}</span>
        <span className="shrink-0 text-xs text-gray-400">v{version.versionNum}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
        <div
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
          style={{ backgroundColor: version.createdBy.avatarColor }}
        >
          {version.createdBy.name.charAt(0).toUpperCase()}
        </div>
        <span className="truncate">{version.createdBy.name}</span>
        <span aria-hidden>·</span>
        <span className="shrink-0">{formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}</span>
      </div>
    </button>
  );
}

export function VersionHistoryPanel({ documentId, isOpen, onClose, canRestore, onRestored }: VersionHistoryPanelProps) {
  const { versions, isLoading, error, hasMore, fetchVersions, loadMore, createVersion, restoreVersion, getVersionContent } =
    useVersions(documentId);

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      void fetchVersions();
      setSelectedVersionId(null);
      setPreviewContent(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, documentId]);

  async function handleSelectVersion(version: VersionSummary) {
    setSelectedVersionId(version.id);
    setPreviewContent(null);
    setActionError(null);
    setIsPreviewLoading(true);
    try {
      const detail = await getVersionContent(version.id);
      setPreviewContent(detail.content);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handleCreateVersion() {
    setIsCreating(true);
    setActionError(null);
    try {
      await createVersion();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRestore() {
    if (!selectedVersionId) return;
    const selected = versions.find((v) => v.id === selectedVersionId);
    if (!selected) return;
    if (!window.confirm(`Restore to version ${selected.versionNum}? This replaces the current document content.`)) {
      return;
    }

    setIsRestoring(true);
    setActionError(null);
    try {
      await restoreVersion(selectedVersionId);
      onRestored();
      onClose();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setIsRestoring(false);
    }
  }

  if (!isOpen) return null;

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl border-l border-gray-200 bg-white shadow-2xl">
      <div className="flex w-80 shrink-0 flex-col border-r border-gray-200">
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <History size={16} /> Version history
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close version history"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-gray-200 p-3">
          <button
            type="button"
            onClick={() => void handleCreateVersion()}
            disabled={isCreating}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreating ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save current version
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading && versions.length === 0 && (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400">
              <Loader2 size={16} className="mr-2 animate-spin" /> Loading versions…
            </div>
          )}

          {!isLoading && versions.length === 0 && !error && (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-gray-400">
              <Clock size={24} />
              No versions yet. Edits are snapshotted automatically, or save one manually above.
            </div>
          )}

          {error && <p className="px-2 py-2 text-sm text-red-600">{error}</p>}

          <div className="space-y-1">
            {versions.map((version) => (
              <VersionListItem
                key={version.id}
                version={version}
                isSelected={version.id === selectedVersionId}
                onSelect={() => void handleSelectVersion(version)}
              />
            ))}
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={isLoading}
              className="mt-2 w-full rounded-lg py-2 text-center text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-60"
            >
              {isLoading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {!selectedVersion && (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-gray-400">
            Select a version to preview its content.
          </div>
        )}

        {selectedVersion && (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-6 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  Version {selectedVersion.versionNum} — {selectedVersion.title}
                </p>
                <p className="text-xs text-gray-500">
                  {selectedVersion.createdBy.name} · {formatDistanceToNow(new Date(selectedVersion.createdAt), { addSuffix: true })}
                </p>
              </div>
              {canRestore && (
                <button
                  type="button"
                  onClick={() => void handleRestore()}
                  disabled={isRestoring}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-150 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRestoring ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  Restore this version
                </button>
              )}
            </div>

            {actionError && <p className="px-6 py-2 text-sm text-red-600">{actionError}</p>}

            {isPreviewLoading && (
              <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
                <Loader2 size={16} className="mr-2 animate-spin" /> Loading preview…
              </div>
            )}

            {!isPreviewLoading && previewContent && <VersionPreview content={previewContent} />}
          </>
        )}
      </div>
    </div>
  );
}
