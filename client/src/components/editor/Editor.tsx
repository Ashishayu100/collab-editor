import Blockquote from '@tiptap/extension-blockquote';
import BulletList from '@tiptap/extension-bullet-list';
import Collaboration, { isChangeOrigin } from '@tiptap/extension-collaboration';
import CodeBlock from '@tiptap/extension-code-block';
import Heading from '@tiptap/extension-heading';
import Highlight from '@tiptap/extension-highlight';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import OrderedList from '@tiptap/extension-ordered-list';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { WifiOff } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { applyYDocState, encodeYDocState } from '../../lib/yjs';
import { ConnectionStatus, WebSocketProvider } from '../../lib/WebSocketProvider';
import { useAuthStore } from '../../stores/authStore';
import { useDocumentStore } from '../../stores/documentStore';
import { Toolbar } from './Toolbar';
import { YjsDebugPanel } from './YjsDebugPanel';
import './editor.css';

const AUTOSAVE_DELAY_MS = 2000;
/** Only fall back to REST auto-save once the WebSocket has been down this long. */
const OFFLINE_FALLBACK_THRESHOLD_MS = 10000;

export interface EditorProps {
  documentId: string;
  /** Base64-encoded Yjs state from the server, or null/legacy content for new or old documents. */
  initialContent?: string | null;
  editable?: boolean;
}

export interface EditorHandle {
  retrySave: () => void;
  retryConnection: () => void;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { documentId, initialContent, editable = true },
  ref
) {
  const saveContent = useDocumentStore((state) => state.saveContent);
  const setConnectionStatus = useDocumentStore((state) => state.setConnectionStatus);

  const ydoc = useMemo(() => {
    const doc = new Y.Doc();
    if (initialContent) {
      try {
        applyYDocState(doc, initialContent);
      } catch (error) {
        console.warn('Could not load document state — starting fresh', error);
      }
    }
    return doc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  // The WebSocket sync protocol keeps this Y.Doc up to date in real time; the server
  // persists to Postgres on its own schedule. REST auto-save only exists as an offline
  // fallback (see disconnectedSinceRef below) and for the Ctrl+S / unload safety nets.
  //
  // Provider construction happens inside an effect (not useMemo) because its constructor
  // opens a real WebSocket connection. StrictMode's dev double-render discards a useMemo
  // factory's first result but still executes it, which would leak a live socket; an
  // effect's own synchronous cleanup correctly tears down the discarded instance instead.
  const [provider, setProvider] = useState<WebSocketProvider | null>(null);

  useEffect(() => {
    const p = new WebSocketProvider(ydoc, documentId, () => useAuthStore.getState().accessToken ?? '');
    setProvider(p);
    return () => {
      p.destroy();
    };
  }, [ydoc, documentId]);

  const [connectionStatus, setLocalConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);

  useEffect(() => {
    setConnectionStatus(connectionStatus);
  }, [connectionStatus, setConnectionStatus]);

  useEffect(() => {
    if (!provider) return;
    setLocalConnectionStatus(provider.status);
    return provider.onStatusChange(setLocalConnectionStatus);
  }, [provider]);

  // Tracks how long the WebSocket has been down, so the REST fallback only kicks in
  // after a real outage rather than on every brief reconnect blip.
  const disconnectedSinceRef = useRef<number | null>(Date.now());
  useEffect(() => {
    if (connectionStatus === ConnectionStatus.CONNECTED) {
      disconnectedSinceRef.current = null;
    } else if (disconnectedSinceRef.current === null) {
      disconnectedSinceRef.current = Date.now();
    }
  }, [connectionStatus]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const pendingDestroyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSave = useCallback(() => {
    if (!isDirtyRef.current) return;
    isDirtyRef.current = false;
    void saveContent(documentId, encodeYDocState(ydoc));
  }, [documentId, ydoc, saveContent]);

  const scheduleSave = useCallback(() => {
    isDirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flushSave, AUTOSAVE_DELAY_MS);
  }, [flushSave]);

  useImperativeHandle(
    ref,
    () => ({
      retrySave: () => {
        isDirtyRef.current = true;
        flushSave();
      },
      retryConnection: () => provider?.retryConnection(),
    }),
    [flushSave, provider]
  );

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: false,
          bulletList: false,
          orderedList: false,
          codeBlock: false,
          blockquote: false,
          horizontalRule: false,
          link: false,
          underline: false,
          undoRedo: false, // Yjs's UndoManager (via Collaboration) replaces StarterKit's undo/redo
        }),
        Collaboration.configure({ document: ydoc, field: 'default' }),
        Placeholder.configure({ placeholder: "Start writing... Use '/' for commands" }),
        Heading.configure({ levels: [1, 2, 3] }),
        BulletList,
        OrderedList,
        CodeBlock,
        Blockquote,
        HorizontalRule,
        Highlight,
        Underline,
        TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { class: 'text-blue-500 underline cursor-pointer' },
        }),
        Image,
        TaskList,
        TaskItem.configure({ nested: true }),
        Typography,
      ],
      editable,
      immediatelyRender: false,
      onUpdate: ({ transaction }) => {
        // Skip transactions that originated from Yjs itself (e.g. a remote update applied
        // via the WebSocket provider, or the initial state load) so we don't schedule a
        // fallback save for content we didn't just type locally.
        if (isChangeOrigin(transaction)) return;

        const disconnectedSince = disconnectedSinceRef.current;
        const isLongOutage = disconnectedSince !== null && Date.now() - disconnectedSince > OFFLINE_FALLBACK_THRESHOLD_MS;
        if (isLongOutage) {
          scheduleSave();
        }
      },
    },
    [ydoc]
  );

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        isDirtyRef.current = true;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        flushSave();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flushSave]);

  useEffect(() => {
    function handleBeforeUnload() {
      const token = useAuthStore.getState().accessToken;
      void fetch(`/api/documents/${documentId}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: encodeYDocState(ydoc) }),
        keepalive: true,
      });
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [documentId, ydoc]);

  // React 18 StrictMode simulates mount -> cleanup -> mount synchronously in dev, which
  // would destroy the Y.Doc while the editor is still bound to it (silently breaking the
  // Yjs UndoManager's internal hooks even though basic sync keeps working). Deferring the
  // destroy by a tick and cancelling it if the effect re-runs immediately (the StrictMode
  // "remount") avoids that, while a genuine unmount still destroys the doc as intended.
  useEffect(() => {
    if (pendingDestroyRef.current) {
      clearTimeout(pendingDestroyRef.current);
      pendingDestroyRef.current = null;
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      flushSave();
      pendingDestroyRef.current = setTimeout(() => {
        ydoc.destroy();
      }, 0);
    };
  }, [ydoc, flushSave]);

  if (!editor) {
    return null;
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar editor={editor} />
      {connectionStatus === ConnectionStatus.ERROR && (
        <div className="flex items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <WifiOff size={16} />
          <span>Connection lost. Your changes are saved locally and will sync when reconnected.</span>
          <button
            type="button"
            onClick={() => provider?.retryConnection()}
            className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 transition-colors duration-150 hover:bg-amber-200"
          >
            Retry connection
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-8 py-10">
          <EditorContent editor={editor} />
        </div>
      </div>
      {import.meta.env.DEV && provider && <YjsDebugPanel ydoc={ydoc} documentId={documentId} provider={provider} />}
    </div>
  );
});
