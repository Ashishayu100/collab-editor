/**
 * WebSocket load test — measures how many concurrent collaboration sessions the server holds
 * open, how fast the upgrade handshake completes (JWT verify + access check + room creation +
 * initial Yjs sync), and whether ping round-trips stay responsive under that load.
 *
 * Scope note: this does NOT generate Yjs edits. Producing a real sync/awareness message means
 * encoding a Yjs update with yjs + lib0, which k6's runtime cannot load. What it does exercise
 * is the expensive part of the connection path — auth on upgrade, room lifecycle, the initial
 * sync-step-1 and awareness broadcast every client receives on join, and the per-connection
 * bookkeeping. Yjs merge correctness is covered separately by `npm run test:crdt`.
 *
 * Requires LOAD_TEST_MODE=true on the target: the per-IP guards cap a single source at 20
 * concurrent connections and 10 new connections/minute. See loadtest/README.md.
 *
 *   k6 run loadtest/ws-load-test.js
 *   k6 run -e BASE_URL=http://13.127.254.142 -e WS_URL=ws://13.127.254.142 loadtest/ws-load-test.js
 */
import ws from 'k6/ws';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { WS_URL, createDocument, deleteDocument, signup, uniqueId } from './lib/api.js';
import { renderSummary } from './lib/summary.js';

const wsConnectDuration = new Trend('ws_connect_duration', true);
const wsPongLatency = new Trend('ws_pong_latency', true);
const wsErrors = new Rate('ws_errors');
const wsMessagesReceived = new Counter('ws_messages_received');
const wsSessionsCompleted = new Counter('ws_sessions_completed');

/** How long each virtual user keeps its socket open, and how often it pings. */
const SESSION_MS = 30_000;
const PING_INTERVAL_MS = 10_000;

/** Message type 3 in the server's registry (server/src/websocket/WebSocketServer.ts) — echoed
 *  back verbatim, which makes it a clean round-trip latency probe. */
const MESSAGE_TYPE_PING = 3;

export const options = {
  stages: [
    { duration: '20s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '20s', target: 25 },
    { duration: '1m', target: 25 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    ws_connect_duration: ['p(95)<2000'],
    ws_pong_latency: ['p(95)<500'],
    ws_errors: ['rate<0.1'],
  },
};

export default function () {
  const id = uniqueId();

  const { res: signupRes, accessToken } = signup(id, 'WS User');
  if (signupRes.status !== 201 || !accessToken) {
    wsErrors.add(1);
    return;
  }

  const { res: docRes, documentId } = createDocument(accessToken, `WS Test Doc ${id}`);
  if (docRes.status !== 201 || !documentId) {
    wsErrors.add(1);
    return;
  }

  const url = `${WS_URL}/ws?documentId=${documentId}&token=${encodeURIComponent(accessToken)}`;
  const connectStart = Date.now();

  const res = ws.connect(url, {}, (socket) => {
    let pingSentAt = 0;

    socket.on('open', () => {
      wsConnectDuration.add(Date.now() - connectStart);
      wsErrors.add(0);

      // k6's `sleep()` blocks the VU's event loop, so a socket callback must schedule with the
      // socket's own timers — otherwise no message would ever be delivered while we waited.
      socket.setInterval(() => {
        pingSentAt = Date.now();
        socket.send(new Uint8Array([MESSAGE_TYPE_PING]).buffer);
      }, PING_INTERVAL_MS);

      socket.setTimeout(() => socket.close(), SESSION_MS);
    });

    socket.on('binaryMessage', (data) => {
      wsMessagesReceived.add(1);
      // The server echoes the ping byte back untouched; anything else is the initial sync-step-1
      // or an awareness broadcast, which carry no timestamp to measure against.
      const bytes = new Uint8Array(data);
      if (bytes.length === 1 && bytes[0] === MESSAGE_TYPE_PING && pingSentAt > 0) {
        wsPongLatency.add(Date.now() - pingSentAt);
        pingSentAt = 0;
      }
    });

    socket.on('message', () => {
      wsMessagesReceived.add(1);
    });

    socket.on('error', (e) => {
      // A normal close surfaces here on some k6 versions — only count real failures.
      if (e && e.error && !`${e.error}`.includes('websocket: close sent')) {
        wsErrors.add(1);
      }
    });

    socket.on('close', () => {
      wsSessionsCompleted.add(1);
    });
  });

  check(res, { 'ws handshake returns 101': (r) => r && r.status === 101 });

  deleteDocument(accessToken, documentId);
}

export function handleSummary(data) {
  return renderSummary(data, 'CollabEdit — WebSocket Load Test', 'loadtest/results/ws-results.json', [
    ['ws_connect_duration', 'Connect handshake'],
    ['ws_pong_latency', 'Ping round-trip'],
    ['ws_messages_received', 'Messages received'],
    ['ws_sessions_completed', 'Sessions completed'],
    ['ws_errors', 'WS error rate'],
  ]);
}
