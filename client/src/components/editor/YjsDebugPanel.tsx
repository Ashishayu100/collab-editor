import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebSocketProvider, WebSocketProviderStats } from '../../lib/WebSocketProvider';

interface YjsDebugPanelProps {
  ydoc: Y.Doc;
  documentId: string;
  provider: WebSocketProvider;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-gray-400">{label}</dt>
      <dd className="truncate text-gray-100">{value}</dd>
    </div>
  );
}

export function YjsDebugPanel({ ydoc, documentId, provider }: YjsDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stateSize, setStateSize] = useState(() => Y.encodeStateAsUpdate(ydoc).length);
  const [fragmentChildCount, setFragmentChildCount] = useState(() => ydoc.getXmlFragment('default').length);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connectionStatus, setConnectionStatus] = useState(provider.status);
  const [wsStats, setWsStats] = useState<WebSocketProviderStats>(provider.stats);

  useEffect(() => {
    function handleUpdate() {
      setStateSize(Y.encodeStateAsUpdate(ydoc).length);
      setFragmentChildCount(ydoc.getXmlFragment('default').length);
      setLastUpdate(new Date());
    }
    ydoc.on('update', handleUpdate);
    handleUpdate();
    return () => {
      ydoc.off('update', handleUpdate);
    };
  }, [ydoc]);

  useEffect(() => {
    setConnectionStatus(provider.status);
    setWsStats(provider.stats);
    const unsubStatus = provider.onStatusChange(setConnectionStatus);
    const unsubStats = provider.onStatsChange(setWsStats);
    return () => {
      unsubStatus();
      unsubStats();
    };
  }, [provider]);

  function openInNewTab() {
    window.open(window.location.href, '_blank');
  }

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-30 font-mono text-xs">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1 rounded-full border border-gray-700 bg-gray-900/95 px-3 py-1.5 text-gray-200 shadow-lg transition-colors duration-150 hover:bg-gray-800"
          aria-label="Expand Yjs debug panel"
        >
          <ChevronUp size={12} /> Yjs
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-30 w-64 rounded-lg border border-gray-700 bg-gray-900/95 p-3 font-mono text-xs text-gray-200 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-gray-100">Yjs Debug</span>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-gray-200"
          aria-label="Collapse debug panel"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      <dl className="space-y-1">
        <Row label="Document ID" value={`${documentId.slice(0, 10)}…`} />
        <Row label="Client ID" value={String(ydoc.clientID)} />
        <Row label="State size" value={`${stateSize} bytes`} />
        <Row label="Fragment children" value={String(fragmentChildCount)} />
        <Row label="Last update" value={lastUpdate ? lastUpdate.toLocaleTimeString() : '—'} />
        <Row label="WS status" value={connectionStatus} />
        <Row label="Reconnect attempts" value={String(wsStats.reconnectAttempts)} />
        <Row label="Msgs sent" value={String(wsStats.messagesSent)} />
        <Row label="Msgs received" value={String(wsStats.messagesReceived)} />
        <Row
          label="Last message"
          value={wsStats.lastMessageAt ? wsStats.lastMessageAt.toLocaleTimeString() : '—'}
        />
      </dl>
      <button
        type="button"
        onClick={openInNewTab}
        className="mt-3 w-full rounded bg-gray-700 px-2 py-1 text-center text-gray-100 transition-colors duration-150 hover:bg-gray-600"
      >
        Open in new tab
      </button>
    </div>
  );
}
