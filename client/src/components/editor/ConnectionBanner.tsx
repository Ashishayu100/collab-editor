import { CheckCircle2, Loader2, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { ConnectionStatus } from '../../lib/WebSocketProvider';

interface ConnectionBannerProps {
  status: ConnectionStatus;
  reconnectAttempts: number;
  onReconnect: () => void;
}

const RECONNECTED_FLASH_MS = 2000;

const DOWN_STATUSES = new Set<ConnectionStatus>([
  ConnectionStatus.RECONNECTING,
  ConnectionStatus.DISCONNECTED,
  ConnectionStatus.OFFLINE,
  ConnectionStatus.FAILED,
]);

type Variant = 'connecting' | 'reconnecting' | 'disconnected' | 'reconnected';

export function ConnectionBanner({ status, reconnectAttempts, onReconnect }: ConnectionBannerProps) {
  const wasDownRef = useRef(false);
  const [showReconnectedFlash, setShowReconnectedFlash] = useState(false);

  useEffect(() => {
    if (DOWN_STATUSES.has(status)) {
      wasDownRef.current = true;
      setShowReconnectedFlash(false);
      return;
    }

    if (status === ConnectionStatus.CONNECTED && wasDownRef.current) {
      wasDownRef.current = false;
      setShowReconnectedFlash(true);
      const timeout = setTimeout(() => setShowReconnectedFlash(false), RECONNECTED_FLASH_MS);
      return () => clearTimeout(timeout);
    }

    return undefined;
  }, [status]);

  let variant: Variant | null = null;
  if (showReconnectedFlash) {
    variant = 'reconnected';
  } else if (status === ConnectionStatus.CONNECTING || status === ConnectionStatus.SYNCING) {
    variant = 'connecting';
  } else if (status === ConnectionStatus.RECONNECTING) {
    variant = 'reconnecting';
  } else if (
    status === ConnectionStatus.DISCONNECTED ||
    status === ConnectionStatus.OFFLINE ||
    status === ConnectionStatus.FAILED
  ) {
    variant = 'disconnected';
  }

  const visible = variant !== null;

  return (
    <div
      className={cn('connection-banner', visible && 'connection-banner--visible', variant && `connection-banner--${variant}`)}
    >
      {variant === 'connecting' && (
        <>
          <Loader2 size={13} className="animate-spin" />
          <span>Connecting...</span>
        </>
      )}
      {variant === 'reconnecting' && (
        <>
          <Loader2 size={13} className="animate-spin" />
          <span>
            Connection lost. Reconnecting{reconnectAttempts > 0 ? ` (attempt ${reconnectAttempts})` : '…'}
          </span>
          <span className="opacity-75">· Edits are saved locally</span>
        </>
      )}
      {variant === 'disconnected' && (
        <>
          <WifiOff size={13} />
          <span>
            {status === ConnectionStatus.FAILED
              ? 'Connection failed — your edits are saved locally.'
              : "Offline — your edits are saved locally and will sync when you reconnect."}
          </span>
          <button type="button" onClick={onReconnect} className="connection-banner__action">
            Reconnect now
          </button>
        </>
      )}
      {variant === 'reconnected' && (
        <>
          <CheckCircle2 size={13} />
          <span>Reconnected</span>
        </>
      )}
    </div>
  );
}
