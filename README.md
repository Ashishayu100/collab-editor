# CollabEdit — Real-Time Collaborative Document Editor

A production-grade collaborative document editor built with **Yjs CRDTs**, a **custom binary
WebSocket protocol**, and **Redis pub/sub** for horizontal scaling. Think Google Docs — built
from scratch, with the distributed-systems parts written rather than imported.

**Live demo:** http://13.127.254.142 — create an account to try it. Deployed on AWS EC2 + RDS +
ElastiCache; see [deployment/aws/QUICK_START.md](deployment/aws/QUICK_START.md).

> Open it in two browsers (one incognito), share a document between them, and type in both at
> once — that's the part worth seeing.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client (React 18)                            │
│   TipTap v3 Editor ── Yjs Doc ── custom WebSocketProvider           │
│   Zustand stores ── y-indexeddb (offline) ── Tailwind CSS           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                Binary WebSocket protocol (8 message types)
                     + same-origin REST over HTTP
                               │
┌──────────────────────────────┴──────────────────────────────────────┐
│                        Nginx reverse proxy                          │
│           (SSL termination, static assets, /ws upgrade)             │
└──────────┬────────────────────────────────────┬─────────────────────┘
           │ HTTP REST                          │ WebSocket upgrade
┌──────────┴────────────────────────────────────┴─────────────────────┐
│                     Node.js server (Express + ws)                   │
│                                                                     │
│  ┌──────────────┐  ┌────────────────────┐  ┌────────────────────┐  │
│  │  REST API    │  │  WebSocket server  │  │  Redis pub/sub     │  │
│  │              │  │                    │  │                    │  │
│  │  Auth        │  │  Document rooms    │  │  Yjs updates       │  │
│  │  Documents   │  │  Y.Doc + Awareness │  │  Awareness fan-out │  │
│  │  Comments    │  │  Debounced saves   │  │  Comment events    │  │
│  │  Folders     │  │  Role enforcement  │  │  Active-user hash  │  │
│  │  Versions    │  │  Per-IP guards     │  │  Rate-limit store  │  │
│  │  Sharing     │  │  Idle sweeps       │  │  Origin tagging    │  │
│  │  Export      │  │                    │  │                    │  │
│  │  Admin       │  │                    │  │                    │  │
│  └──────────────┘  └────────────────────┘  └────────────────────┘  │
│                                                                     │
│  Middleware: JWT auth · RBAC · Zod validation · rate limiting ·     │
│              quotas · metrics · compression                         │
└──────────┬──────────────────────────────────────┬───────────────────┘
           │                                      │
    ┌──────┴───────┐                    ┌─────────┴─────────┐
    │  PostgreSQL  │                    │       Redis       │
    │  (AWS RDS)   │                    │   (ElastiCache)   │
    │              │                    │                   │
    │  Users       │                    │  Pub/sub channels │
    │  Documents   │                    │  Rate-limit keys  │
    │  (Yjs bytea) │                    │  Active-user sets │
    │  Versions    │                    │  (TTL-expiring)   │
    │  Comments    │                    │                   │
    │  Collabs     │                    │                   │
    │  Folders     │                    │                   │
    └──────────────┘                    └───────────────────┘
```

Redis is a scaling enhancement, never a hard dependency — a single instance with no Redis
reachable keeps working, losing only cross-server collaboration and Redis-backed rate limiting
(which fails open by design).

---

## Key Features

### Real-time collaboration
- **Yjs CRDTs** for conflict-free concurrent editing — no operational transforms, no central sequencer
- **Custom binary WebSocket protocol** with 8 message types — not Socket.io, not `y-websocket`
- **Live cursors and selections** with animated movement and auto-fading name labels
- **Typing indicators** driven by debounced awareness updates
- **Avatar bar** — click a collaborator to jump the editor to their cursor
- **Participants panel with follow mode** — pin to a user and track their cursor as they move
- **Join/leave toasts**, debounced so a brief reconnect doesn't spam the room

### Rich text editing
- **TipTap v3** (ProseMirror) with a full toolbar: bold, italic, underline, strikethrough,
  headings, lists, task lists, code blocks, blockquotes, images, links, highlights, alignment
- **Slash commands** — type `/` for a Notion-style command palette
- Link bubble menu, word and character count in the status bar

### Offline-first
- **y-indexeddb** persists the local Yjs state, so edits survive a refresh with no network
- **WebSocket state machine**: connecting → connected → disconnected → reconnecting
- **REST fallback save** — when the socket has been down 10 seconds but HTTP still works (a
  dropped upgrade, a proxy hiccup), edits persist over the REST API on a 2-second debounce
- **Automatic CRDT merge on reconnect** — no data loss, no conflict prompts
- Connection banner showing live state and reconnect attempts

### Documents and organization
- Nested **folders**, per-user **starring**, debounced **full-text search** (`Ctrl+K`)
- Dashboard views: All, Starred, Shared with me, Recent
- **Version history** — named snapshots, restore, auto-pruning past 50 auto-snapshots
  (labeled snapshots are never pruned)

### Comments
- **Inline comments** anchored to a text selection, with an editor highlight mark
- **Threaded replies**, resolve/unresolve
- Real-time sync to every connected client via the WebSocket comment-event message

### Access control
- **OWNER / EDITOR / VIEWER** roles enforced on both the REST routes and the WebSocket layer —
  a VIEWER's sync messages are answered but silently dropped rather than applied
- **Share links** with a configurable role and one-click acceptance
- Live **role-updated** and **access-revoked** pushes, so a permission change lands mid-session

### Export
- **PDF** via server-side Puppeteer, **Markdown** via Turndown with custom rules, **HTML**

### Horizontal scaling
- **Redis pub/sub** for cross-server Yjs, awareness, and comment fan-out
- **Origin tagging** on Redis-applied updates prevents infinite echo loops between instances
- **Active-user tracking** in Redis hashes with a TTL, so a crashed instance's entries age out
- Yjs updates **batched over a 50 ms window** and awareness **throttled to ~10 publishes/sec**
  before crossing the Redis hop — local broadcasts are always immediate

### Security and hardening
- **JWT auth** with access + refresh tokens and transparent client-side refresh
- **Tiered rate limiting** on a Redis store: general (100/min), auth (10/15 min per IP),
  document creation (20/hr), exports (10/10 min), comments (30/min)
- **WebSocket guards**: per-IP concurrency and connection rate limits, a soft/hard per-second
  message rate limit, 2 MB max message size, 30-minute idle sweep
- **Quotas** on documents per user, comments per document, collaborators, folders
- Helmet, CORS allow-listing, gzip compression, Zod validation on every route

### Monitoring
- **Admin dashboard** at `/admin` — live connection, room, throughput, latency and memory charts
- Database counts, recent error log, gated by `ADMIN_EMAILS`

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18, TypeScript, Tailwind CSS | Type-safe, utility-first, fast iteration |
| Editor | TipTap v3 (ProseMirror) | Headless and extensible, first-class Yjs binding |
| CRDT | Yjs + y-protocols | Proven, compact binary encoding, awareness protocol included |
| Offline | y-indexeddb | Local Yjs persistence with no extra sync logic |
| State | Zustand | Minimal boilerplate, strong inference, no provider tree |
| Server | Node.js, Express, TypeScript | One language across the stack, async I/O suits WebSockets |
| WebSocket | `ws` + a hand-rolled binary protocol | Full control over framing; direct Redis integration |
| Database | PostgreSQL (AWS RDS) | ACID, relational access control, `bytea` for Yjs state |
| ORM | Prisma | Type-safe queries, migrations, cascade rules in schema |
| Cache / pub-sub | Redis (AWS ElastiCache) | Sub-millisecond fan-out, rate limiting, presence |
| Auth | JWT (access + refresh) | Stateless, scales horizontally with no session affinity |
| Testing | Vitest + Supertest | ESM-native, fast, good DX |
| Load testing | k6 | Scriptable, threshold-gated, CI-friendly |
| Containers | Docker, Docker Compose | Multi-stage builds, reproducible deploys |
| Proxy | Nginx | SSL termination, static serving, WebSocket upgrade |
| Cloud | AWS EC2 + RDS + ElastiCache | Managed data tier, standard infrastructure |

---

## Binary WebSocket Protocol

Rather than Socket.io or `y-websocket`, this project defines its own protocol. Every frame is a
raw `Uint8Array` whose first varuint is the message type — Yjs payloads are never JSON-wrapped,
which keeps serialization cost off the hot path.

| Type | Name | Direction | Payload |
|------|------|-----------|---------|
| `0` | Sync | both | Yjs sync protocol (step 1 / step 2 / update) |
| `1` | Awareness | both | Cursor, selection, user identity, typing flag |
| `2` | Save confirmed | server → client | Sent after a debounced or periodic DB write |
| `3` | Ping | both | Echoed back verbatim — a latency probe |
| `4` | Document restored | server → client | Broadcast after a version restore |
| `5` | Role updated | server → client | The caller's role on this document changed |
| `6` | Access revoked | server → client | The caller lost access entirely |
| `7` | Comment event | server → client | Comment CRUD notification (JSON payload) |

The registry lives in [server/src/websocket/WebSocketServer.ts](server/src/websocket/WebSocketServer.ts)
and is mirrored in [client/src/lib/WebSocketProvider.ts](client/src/lib/WebSocketProvider.ts).

**Persistence:** room state is written to Postgres on a 5-second debounce after the last edit,
with a 30-second periodic sweep as a backstop and an immediate flush when the last client
leaves. Saves are skipped entirely when the state vector is unchanged.

---

## CRDT Conflict Resolution

Yjs guarantees that concurrent replicas **converge**, that updates are **commutative** (order
doesn't matter) and **idempotent** (re-applying an update is a no-op). Those properties are what
make offline editing and multi-server fan-out safe without a coordinator.

The claim is tested rather than asserted — see
[server/src/test/unit/crdt.test.ts](server/src/test/unit/crdt.test.ts):

- Concurrent inserts at the same position → both survive, in a deterministic order
- Concurrent delete + insert → the insert survives when outside the deleted range
- Five-way concurrent editing → all five replicas converge to identical state
- Out-of-order update application → same final state regardless of arrival order
- Binary encode/decode round-trip → zero data loss

```bash
npm run test:crdt
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- Docker and Docker Compose (or your own PostgreSQL 16 + Redis 7)

### Development

```bash
git clone https://github.com/Ashishayu100/collab-editor.git
cd collab-editor

# PostgreSQL + Redis in containers
npm run docker:dev

npm install

# server/.env drives the server — see the comments in .env.example
cp .env.example server/.env

npm run prisma:migrate
npm run db:seed          # optional: alice@demo.com / bob@demo.com / carol@demo.com (demo1234)

npm run dev              # client + server together
```

- Client: http://localhost:5173
- Server: http://localhost:3001 (the Vite dev proxy makes API and WS calls same-origin)

### Docker (production-like, single host)

```bash
npm run docker:build
npm run docker:up        # http://localhost
```

### AWS

See [deployment/aws/QUICK_START.md](deployment/aws/QUICK_START.md) and
[deployment/aws/SETUP.md](deployment/aws/SETUP.md).

---

## Project Structure

```
collab-editor/
├── client/                       React frontend (Vite)
│   └── src/
│       ├── api/                  Axios instance w/ refresh interceptor + endpoint modules
│       ├── components/
│       │   ├── editor/           TipTap editor, toolbar, cursors, panels, dialogs
│       │   ├── comments/         Comments panel
│       │   ├── dashboard/        Sidebar, move-to-folder dialog
│       │   ├── admin/            Metric cards
│       │   └── ui/               Buttons, inputs, skeletons, toasts, confirm dialogs
│       ├── extensions/           Custom TipTap extension (slash commands)
│       ├── hooks/                Awareness, versions, IndexedDB sync, presence toasts
│       ├── lib/                  WebSocketProvider, Yjs helpers, colors, export helpers
│       ├── pages/                Landing, auth, dashboard, editor, admin, share accept
│       └── stores/               Zustand stores (auth, documents, comments, folders, toasts)
├── server/                       Node.js backend
│   ├── src/
│   │   ├── routes/               Express routers
│   │   ├── controllers/          Request handlers
│   │   ├── services/             Domain logic, Redis pub/sub, metrics, presence tracker
│   │   ├── middleware/           Auth, RBAC, validation, rate limiting, quotas, metrics
│   │   ├── websocket/            Custom WebSocket server + registry
│   │   ├── config/               Env schema, database, Redis, hardening limits
│   │   ├── utils/                JWT, hashing, Yjs helpers, error types
│   │   ├── test/                 unit/ + integration/ suites
│   │   ├── app.ts                Express app factory (supertest-friendly)
│   │   └── index.ts              HTTP + WebSocket + Redis lifecycle
│   └── prisma/                   Schema, migrations, seed
├── shared/                       Types shared across client and server
├── loadtest/                     k6 scripts + results
├── deployment/aws/               EC2/RDS/ElastiCache setup, Nginx, deploy + ops scripts
├── docker-compose.yml            Full stack
├── docker-compose.dev.yml        Dev infrastructure only
└── Makefile                      Developer shortcuts
```

---

## Testing

```bash
npm test                  # everything
npm run test:coverage
npm run test:unit         # validators, JWT, hashing, limits, Yjs utils, CRDT
npm run test:integration  # REST endpoints, access control, sharing, WebSocket
npm run test:crdt         # CRDT merge correctness only
```

Integration tests run against a separate `collab_test` database — see `TEST_DATABASE_URL` in
`.env.example`.

## Load Testing

```bash
npm run loadtest:api
npm run loadtest:ws
npm run loadtest:health
```

Read [loadtest/README.md](loadtest/README.md) first — the API and WebSocket scripts need the
server started with `LOAD_TEST_MODE=true`, or the rate limiters reject the load generator (one
IP, many throwaway users) and the run measures the limiter instead of the app.

---

## Key Design Decisions

1. **CRDTs over operational transforms.** OT needs a central server to order operations. CRDTs
   converge without coordination, which is what makes offline editing and multi-instance fan-out
   possible at all — any server can accept any update in any order.

2. **A custom WebSocket protocol over Socket.io / y-websocket.** Full control of the binary
   framing, no framework overhead, and room state that plugs straight into Redis pub/sub. It
   also made room for protocol-level features a generic provider has no concept of: live role
   changes, access revocation, and comment events on the same socket.

3. **PostgreSQL over a document store.** The interesting data here is relational — users,
   collaborators, roles, threaded comments — and benefits from real transactions and cascade
   rules. Yjs state lives alongside it as a `bytea` column, so a document and its permissions
   commit together.

4. **Redis pub/sub over a broker like Kafka.** No durability is needed for the fan-out: Yjs
   already guarantees convergence, so a dropped message costs nothing once the next sync runs.
   That makes latency the only metric that matters, and Redis wins it — while doing double duty
   as the rate-limit store and presence tracker.

5. **TipTap v3 over Quill or Slate.** ProseMirror underneath, with a maintained Yjs binding and
   an extension API clean enough to add comment-highlight marks and a slash-command menu without
   forking anything.

6. **Zustand over Redux.** Several small independent stores, no provider tree, and TypeScript
   inference that works without generics gymnastics.

7. **Graceful degradation everywhere.** Redis down → single-server mode. Rate-limit store
   unreachable → fail open rather than 500. WebSocket down → REST fallback saves and local
   IndexedDB persistence. None of these turn an infrastructure hiccup into an outage.

---

## Performance Characteristics

These are the system's **configured budgets and design targets**, not benchmark results — the k6
scripts in [loadtest/](loadtest/) are how you produce real numbers for your own deployment.

| Path | Target / configured value |
|------|---------------------------|
| Local edit → on screen | Immediate — Yjs applies locally before anything is sent |
| Same-server broadcast | Sent on the update event, no batching |
| Cross-server fan-out | Up to 50 ms Yjs batch window + Redis hop |
| Awareness across servers | Throttled to ~10 publishes/sec per document |
| Document persistence | 5 s debounce after the last edit, 30 s periodic backstop |
| REST p95 | < 500 ms threshold, enforced by `loadtest/api-load-test.js` |
| Dashboard list p95 | < 300 ms threshold |
| WebSocket handshake p95 | < 2 s threshold (JWT verify + access check + room load + sync) |
| Max document size | 5 MB of encoded Yjs state |
| Max WebSocket message | 2 MB; 50 msg/s soft limit, 100 msg/s hard disconnect |

---

## License

MIT

---

Built by **Ashish** — IIT Patna · [GitHub](https://github.com/Ashishayu100)
