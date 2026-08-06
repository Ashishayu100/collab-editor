/** Central hardening limits — sizes/quotas enforced across REST validation, WebSocket message
 *  handling, and document persistence. Collected here so the numbers agree across call sites. */
export const DOCUMENT_LIMITS = {
  MAX_TITLE_LENGTH: 200, // characters
  MAX_DOCUMENT_SIZE: 5 * 1024 * 1024, // 5MB for the encoded Yjs binary state
  MAX_COMMENT_LENGTH: 5000, // characters per comment
  MAX_COMMENTS_PER_DOCUMENT: 500,
  MAX_COLLABORATORS_PER_DOCUMENT: 50,
  MAX_FOLDERS_PER_USER: 100,
  MAX_DOCUMENTS_PER_USER: 500,
} as const;

/** WebSocket-layer hardening limits — see websocket/WebSocketServer.ts. */
export const WS_LIMITS = {
  MAX_MESSAGE_SIZE: 2 * 1024 * 1024, // 2MB max single binary message
  MAX_MESSAGES_PER_SECOND: 50, // soft limit — excess messages are dropped, not disconnected
  MAX_MESSAGES_PER_SECOND_HARD: 100, // hard limit — sustained abuse past this closes the socket
  MAX_CONNECTIONS_PER_IP: 20, // concurrent WS connections
  CONNECTION_RATE_LIMIT: 10, // new connections per CONNECTION_RATE_WINDOW_MS per IP
  CONNECTION_RATE_WINDOW_MS: 60_000,
  IDLE_TIMEOUT_MS: 30 * 60 * 1000, // disconnect a client after 30min with no messages
  IDLE_SWEEP_INTERVAL_MS: 60 * 1000,
} as const;

/** Cross-server (Redis) publish throttling — local broadcasts to same-server clients are always
 *  immediate; only the fan-out to *other* server instances is batched/throttled. See
 *  websocket/WebSocketServer.ts's batchYjsUpdateForRedis / throttledAwarenessPublish. */
export const REDIS_PUBLISH_LIMITS = {
  YJS_BATCH_WINDOW_MS: 50, // merge same-document Yjs updates arriving within this window into one publish
  AWARENESS_THROTTLE_MS: 100, // at most ~10 awareness publishes/sec per document
} as const;
