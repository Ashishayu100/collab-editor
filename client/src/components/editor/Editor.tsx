import Collaboration, { isChangeOrigin } from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import { AlertTriangle, Loader2, WifiOff } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Awareness } from 'y-protocols/awareness';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { useIndexedDBSync } from '../../hooks/useIndexedDBSync';
import { getUserColor } from '../../lib/colors';
import { applyYDocState, encodeYDocState } from '../../lib/yjs';
import { ConnectionStatus, DocumentRestoredEvent, WebSocketProvider } from '../../lib/WebSocketProvider';
import { useAuthStore } from '../../stores/authStore';
import { useDocumentStore } from '../../stores/documentStore';
import { useToastStore } from '../../stores/toastStore';
import { getContentExtensions } from './contentExtensions';
import { Toolbar } from './Toolbar';
import { YjsDebugPanel } from './YjsDebugPanel';
import './editor.css';

const AUTOSAVE_DELAY_MS = 2000;
/** Only fall back to REST auto-save once the WebSocket has been down this long. */
const OFFLINE_FALLBACK_THRESHOLD_MS = 10000;
/** While disconnected, also retry a REST save on this cadence regardless of typing activity. */
const REST_FALLBACK_INTERVAL_MS = 30000;
/** How long after the last keystroke before we clear the local "typing" awareness flag. */
const TYPING_INDICATOR_TIMEOUT_MS = 2000;

const DOWN_STATUSES = new Set<ConnectionStatus>([
  ConnectionStatus.DISCONNECTED,
  ConnectionStatus.RECONNECTING,
  ConnectionStatus.OFFLINE,
  ConnectionStatus.FAILED,
]);

export interface EditorProps {
  documentId: string;
  /** Base64-encoded Yjs state from the server, or null/legacy content for new or old documents. */
  initialContent?: string | null;
  editable?: boolean;
  /** Called for every connected client when the server reports a version restore completed. */
  onDocumentRestored?: (event: DocumentRestoredEvent) => void;
}

export interface EditorHandle {
  retrySave: () => void;
  retryConnection: () => void;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { documentId, initialContent, editable = true, onDocumentRestored },
  ref
) {
  const saveContent = useDocumentStore((state) => state.saveContent);
  const setConnectionStatus = useDocumentStore((state) => state.setConnectionStatus);
  const setAwareness = useDocumentStore((state) => state.setAwareness);
  const setSaveIndicatorState = useDocumentStore((state) => state.setSaveIndicatorState);
  const setReconnectAttempts = useDocumentStore((state) => state.setReconnectAttempts);
  const addToast = useToastStore((state) => state.addToast);

  const currentUserId = useAuthStore((state) => state.user?.id);
  const currentUserName = useAuthStore((state) => state.user?.name) ?? 'Anonymous';
  const currentUserColor = useMemo(() => getUserColor(currentUserId ?? 'anonymous'), [currentUserId]);

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

  // Awareness is created eagerly via useMemo (not an effect) because the CollaborationCaret
  // extension needs it synchronously, at editor-creation time — gating it behind an effect
  // would mean the editor is first created without it and then has to destroy+recreate
  // itself once the effect fires, which crashes: a child component's live subscription
  // (Toolbar's useEditorState) can fire against the old editor mid-teardown. StrictMode's
  // dev double-render does mean a discarded practice instance's `setInterval` + `doc.on
  // ('destroy', ...)` listener briefly leak, but that's a harmless local timer — nothing
  // like the live WebSocket connection Day 4 had to move into an effect to avoid leaking.
  // It's cleaned up regardless once `ydoc.destroy()` runs, since Awareness auto-destroys
  // itself in response to its Y.Doc's 'destroy' event.
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc]);

  useEffect(() => {
    setAwareness(awareness);
  }, [awareness, setAwareness]);

  // A stable wrapper so CollaborationCaret (which only ever reads `provider.awareness`) can
  // be configured from the very first editor creation, independent of whether the real
  // network provider (below) has connected yet.
  const caretProvider = useMemo(() => ({ awareness }), [awareness]);

  // IndexeddbPersistence opens a real IndexedDB connection as soon as it's constructed, so —
  // like WebSocketProvider below — it must be created inside an effect rather than a bare
  // useMemo: StrictMode's dev double-render discards a useMemo factory's first result but
  // still executes it, which would leak an open IndexedDB connection nothing ever closes.
  const [indexeddbProvider, setIndexeddbProvider] = useState<IndexeddbPersistence | null>(null);

  useEffect(() => {
    const persistence = new IndexeddbPersistence(`collab-doc-${documentId}`, ydoc);
    setIndexeddbProvider(persistence);

    return () => {
      void persistence.destroy();
      setIndexeddbProvider(null);
    };
  }, [documentId, ydoc]);

  const indexeddbSynced = useIndexedDBSync(indexeddbProvider);

  // The WebSocket sync protocol keeps this Y.Doc up to date in real time; the server
  // persists to Postgres on its own schedule. REST auto-save only exists as an offline
  // fallback (see disconnectedSinceRef below) and for the Ctrl+S / unload safety nets.
  //
  // Unlike Awareness, the provider's constructor opens a real WebSocket connection, so it
  // must be created inside an effect: StrictMode's dev double-render discards a useMemo
  // factory's first result but still executes it, which would leak a live socket. An
  // effect's own synchronous cleanup correctly tears down the discarded instance instead.
  const [provider, setProvider] = useState<WebSocketProvider | null>(null);

  useEffect(() => {
    const authUser = useAuthStore.getState().user;
    if (!authUser) return undefined;

    const p = new WebSocketProvider({
      ydoc,
      documentId,
      getToken: () => useAuthStore.getState().accessToken ?? '',
      awareness,
      userId: authUser.id,
      userName: authUser.name,
    });
    setProvider(p);

    return () => {
      p.destroy();
    };
  }, [ydoc, documentId, awareness]);

  const [connectionStatus, setLocalConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [staleTabBanner, setStaleTabBanner] = useState(false);

  useEffect(() => {
    setConnectionStatus(connectionStatus);
  }, [connectionStatus, setConnectionStatus]);

  useEffect(() => {
    if (!provider) return;
    setLocalConnectionStatus(provider.status);
    return provider.onStatusChange(setLocalConnectionStatus);
  }, [provider]);

  useEffect(() => {
    if (!provider) return;
    setSaveIndicatorState(provider.saveState);
    return provider.onSaveStateChange(setSaveIndicatorState);
  }, [provider, setSaveIndicatorState]);

  useEffect(() => {
    if (!provider) return;
    setReconnectAttempts(provider.stats.reconnectAttempts);
    return provider.onStatsChange((stats) => setReconnectAttempts(stats.reconnectAttempts));
  }, [provider, setReconnectAttempts]);

  // Yjs guarantees the merge is correct — this toast is purely informational, so users
  // aren't left wondering whether their offline edits made it back to the server.
  useEffect(() => {
    if (!provider) return undefined;
    return provider.onOfflineEditsSynced(() => {
      addToast('Your offline edits have been synced', 'success');
    });
  }, [provider, addToast]);

  useEffect(() => {
    if (!provider) return undefined;
    return provider.onStaleTab(() => setStaleTabBanner(true));
  }, [provider]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!provider) return undefined;
    return provider.onDocumentRestored((event) => {
      const label = event.label ?? `Version ${event.versionNum}`;
      addToast(`Document restored to ${label} by ${event.restoredBy}`, 'info');
      scrollContainerRef.current?.scrollTo({ top: 0 });
      onDocumentRestored?.(event);
    });
  }, [provider, addToast, onDocumentRestored]);

  useEffect(() => {
    if (connectionStatus === ConnectionStatus.CONNECTED) {
      setStaleTabBanner(false);
    }
  }, [connectionStatus]);

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
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

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

  // Belt-and-suspenders REST save while the WebSocket is down: covers the case where the
  // user stopped typing (so the debounce above never fires again) but still has edits the
  // server hasn't seen, as long as the server is reachable over plain HTTP (the WebSocket
  // might be down for reasons that don't affect REST, e.g. the WS server process restarting).
  const isDown = DOWN_STATUSES.has(connectionStatus);
  useEffect(() => {
    // `isDown` (not `connectionStatus`) is the dependency on purpose: during a sustained
    // outage, status flaps between DISCONNECTED and RECONNECTING on every failed retry —
    // depending on the raw status would tear down and restart this interval on every flap,
    // so the 30s fallback would never actually reach 30s. `isDown` only changes when
    // connectivity actually flips, so the interval survives the flapping in between.
    if (!provider || !isDown) return undefined;

    const interval = setInterval(() => {
      if (provider.hasPendingChanges) {
        isDirtyRef.current = true;
        flushSave();
      }
    }, REST_FALLBACK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [provider, isDown, flushSave]);

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
        ...getContentExtensions(),
        Collaboration.configure({ document: ydoc, field: 'default' }),
        Placeholder.configure({ placeholder: "Start writing... Use '/' for commands" }),
        CollaborationCaret.configure({
          provider: caretProvider,
          user: { name: currentUserName, color: currentUserColor.color },
          selectionRender: (user: Record<string, unknown>) => ({
            style: `background-color: ${typeof user.colorLight === 'string' ? user.colorLight : `${String(user.color)}20`}`,
            class: 'collaboration-carets__selection',
          }),
        }),
      ],
      editable,
      immediatelyRender: false,
      onUpdate: ({ transaction }) => {
        // Skip transactions that originated from Yjs itself (e.g. a remote update applied
        // via the WebSocket provider, or the initial state load) so we don't schedule a
        // fallback save (or flag ourselves as "typing") for content we didn't just type locally.
        if (isChangeOrigin(transaction)) return;

        awareness.setLocalStateField('typing', true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          awareness.setLocalStateField('typing', false);
        }, TYPING_INDICATOR_TIMEOUT_MS);

        const disconnectedSince = disconnectedSinceRef.current;
        const isLongOutage = disconnectedSince !== null && Date.now() - disconnectedSince > OFFLINE_FALLBACK_THRESHOLD_MS;
        if (isLongOutage) {
          scheduleSave();
        }
      },
    },
    [ydoc, caretProvider, awareness]
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

  if (!editor || !indexeddbSynced) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar editor={editor} />
      {staleTabBanner && (
        <div className="flex items-center justify-center gap-3 border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <AlertTriangle size={16} />
          <span>You&apos;ve been away for a while. Your changes are safe locally and will sync now.</span>
        </div>
      )}
      {(connectionStatus === ConnectionStatus.OFFLINE || connectionStatus === ConnectionStatus.FAILED) && (
        <div className="flex items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <WifiOff size={16} />
          <span>
            {connectionStatus === ConnectionStatus.FAILED
              ? 'Connection failed. Your changes are saved locally.'
              : "You're offline. Changes are saved locally and will sync when reconnected."}
          </span>
          <button
            type="button"
            onClick={() => provider?.retryConnection()}
            className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 transition-colors duration-150 hover:bg-amber-200"
          >
            Retry connection
          </button>
        </div>
      )}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-8 py-10">
          <EditorContent editor={editor} />
        </div>
      </div>
      {import.meta.env.DEV && provider && (
        <YjsDebugPanel
          ydoc={ydoc}
          documentId={documentId}
          provider={provider}
          indexedDbSynced={indexeddbSynced}
        />
      )}
    </div>
  );
});
