import Collaboration from '@tiptap/extension-collaboration';
import { EditorContent, useEditor } from '@tiptap/react';
import { formatDistanceToNow } from 'date-fns';
import { Clock, Download, History, Loader2, RotateCcw, Save, X } from 'lucide-react';
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { VersionSummary } from '../../api/versions';
import { useVersions } from '../../hooks/useVersions';
import { applyYDocState } from '../../lib/yjs';
import { getErrorMessage } from '../../lib/utils';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { getContentExtensions } from './contentExtensions';
import './editor.css';

interface VersionHistoryPanelProps {
  documentId: string;
  documentTitle: string;
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
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-[680px] px-6 py-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function VersionListItem({
  version,
  isSelected,
  isExporting,
  onSelect,
  onExport,
}: {
  version: VersionSummary;
  isSelected: boolean;
  isExporting: boolean;
  onSelect: () => void;
  onExport: () => void;
}) {
  return (
    <div
      className={`group relative w-full rounded-lg border px-3 py-2.5 transition-colors duration-150 ${
        isSelected ? 'border-primary bg-blue-50' : 'border-transparent hover:bg-gray-50'
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-center justify-between gap-2 pr-6">
          <span className="truncate text-sm font-medium text-gray-900">{version.label ?? 'Auto-save'}</span>
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
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onExport();
        }}
        disabled={isExporting}
        title="Download as HTML"
        aria-label="Download this version as HTML"
        className="absolute right-2 top-2.5 rounded p-1 text-gray-400 opacity-0 transition-opacity duration-150 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-100 group-hover:opacity-100"
      >
        {isExporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      </button>
    </div>
  );
}

export function VersionHistoryPanel({
  documentId,
  documentTitle,
  isOpen,
  onClose,
  canRestore,
  onRestored,
}: VersionHistoryPanelProps) {
  const {
    versions,
    total,
    isLoading,
    error,
    hasMore,
    fetchVersions,
    loadMore,
    createVersion,
    restoreVersion,
    getVersionContent,
    exportVersionAsHtml,
  } = useVersions(documentId);

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exportingVersionId, setExportingVersionId] = useState<string | null>(null);

  const [isLabelInputOpen, setIsLabelInputOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      void fetchVersions();
      setSelectedVersionId(null);
      setPreviewContent(null);
      setIsLabelInputOpen(false);
      setLabelDraft('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, documentId]);

  useEffect(() => {
    if (isLabelInputOpen) labelInputRef.current?.focus();
  }, [isLabelInputOpen]);

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
      await createVersion(labelDraft.trim() || undefined);
      setIsLabelInputOpen(false);
      setLabelDraft('');
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  }

  function handleLabelInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleCreateVersion();
    } else if (e.key === 'Escape') {
      setIsLabelInputOpen(false);
      setLabelDraft('');
    }
  }

  async function handleConfirmRestore() {
    if (!selectedVersionId) return;
    setIsRestoring(true);
    setActionError(null);
    try {
      await restoreVersion(selectedVersionId);
      setIsRestoreConfirmOpen(false);
      onRestored();
      onClose();
    } catch (err) {
      setActionError(getErrorMessage(err));
      setIsRestoreConfirmOpen(false);
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleExport(version: VersionSummary) {
    setExportingVersionId(version.id);
    setActionError(null);
    try {
      await exportVersionAsHtml(version, documentTitle);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setExportingVersionId(null);
    }
  }

  if (!isOpen) return null;

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? null;

  return (
    <div className="flex h-full w-full max-w-3xl shrink-0 border-l border-gray-200 bg-white shadow-2xl">
      <div className="flex w-80 shrink-0 flex-col border-r border-gray-200">
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <History size={16} /> Version history
            {total > 0 && <span className="font-normal text-gray-400">({total})</span>}
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

        {canRestore && (
          <div className="border-b border-gray-200 p-3">
            {isLabelInputOpen ? (
              <div className="flex flex-col gap-2">
                <input
                  ref={labelInputRef}
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onKeyDown={handleLabelInputKeyDown}
                  placeholder="Name this snapshot (optional)"
                  maxLength={200}
                  className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCreateVersion()}
                    disabled={isCreating}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreating ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLabelInputOpen(false);
                      setLabelDraft('');
                    }}
                    disabled={isCreating}
                    className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsLabelInputOpen(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600"
              >
                <Save size={14} />
                Save current version
              </button>
            )}
          </div>
        )}

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
                isExporting={exportingVersionId === version.id}
                onSelect={() => void handleSelectVersion(version)}
                onExport={() => void handleExport(version)}
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
                  {selectedVersion.label ?? `Version ${selectedVersion.versionNum}`}
                </p>
                <p className="text-xs text-gray-500">
                  v{selectedVersion.versionNum} · {selectedVersion.createdBy.name} ·{' '}
                  {formatDistanceToNow(new Date(selectedVersion.createdAt), { addSuffix: true })}
                </p>
              </div>
              {canRestore && (
                <button
                  type="button"
                  onClick={() => setIsRestoreConfirmOpen(true)}
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

            {!isPreviewLoading && previewContent && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center gap-1.5 border-b border-gray-200 bg-slate-50 px-6 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Preview · read-only
                </div>
                <VersionPreview content={previewContent} />
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={isRestoreConfirmOpen}
        title={`Restore to ${selectedVersion?.label ?? `Version ${selectedVersion?.versionNum ?? ''}`}?`}
        description="This will replace the current document content. A snapshot of the current state will be saved automatically, so this can be undone."
        confirmLabel="Restore"
        isConfirming={isRestoring}
        onConfirm={() => void handleConfirmRestore()}
        onCancel={() => setIsRestoreConfirmOpen(false)}
      />
    </div>
  );
}
