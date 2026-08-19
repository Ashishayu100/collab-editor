# Load Testing — CollabEdit

Three [k6](https://k6.io) scripts that put real load on the deployed stack:

| Script | What it measures |
|--------|------------------|
| `api-load-test.js` | Full REST document lifecycle (signup → create → read → comment → search → delete) ramping 10 → 25 → 50 concurrent users |
| `ws-load-test.js` | Concurrent WebSocket collaboration sessions — upgrade handshake latency, room lifecycle, ping round-trip — ramping 10 → 25 |
| `health-stress-test.js` | Raw request ceiling at 50 → 100 VUs, exercising the Postgres and Redis connection pools |

## Before you run: enable `LOAD_TEST_MODE`

**`api-load-test.js` and `ws-load-test.js` will not produce meaningful numbers against a
default-configured server.** Every limit in this app is keyed by IP or by user, and a load
generator is one IP creating throwaway users:

| Guard | Limit | Effect on a load test |
|-------|-------|----------------------|
| `authLimiter` | 10 attempts / 15 min **per IP** | Signups start returning 429 within seconds |
| `generalLimiter` | 100 requests / min per user or IP | Pre-auth requests share one IP bucket |
| `documentCreateLimiter` | 20 documents / hour per user | Fine — each iteration uses a fresh user |
| `WS_LIMITS.MAX_CONNECTIONS_PER_IP` | 20 concurrent | Hard ceiling below the 25-VU stage |
| `WS_LIMITS.CONNECTION_RATE_LIMIT` | 10 new connections / min per IP | Rejects almost every VU after the first few |

Set `LOAD_TEST_MODE=true` in the server's environment and restart it. That flag disables the
HTTP rate limiters and the per-IP WebSocket connection guards — and nothing else. The server
logs a loud warning at startup while it is on.

```bash
# local dev — add LOAD_TEST_MODE=true to server/.env, or:
LOAD_TEST_MODE=true npm run dev:server

# root docker-compose.yml — the variable is passed through to the server service
LOAD_TEST_MODE=true docker compose up -d server

# AWS (deployment/aws/docker-compose.production.yml reads /opt/collab-editor/.env.production)
echo 'LOAD_TEST_MODE=true' >> /opt/collab-editor/.env.production
docker compose -f deployment/aws/docker-compose.production.yml up -d server
```

**Never leave this on for an internet-facing deployment.** It removes brute-force and
connection-flood protection. Turn it off and restart as soon as the run finishes. Ideally, load
test a throwaway stack rather than the one on your résumé link.

`health-stress-test.js` needs none of this — `/api/health` is already exempt from the general
limiter.

## Install k6

| Platform | Command |
|----------|---------|
| Windows | `choco install k6` or `winget install k6 --source winget` |
| macOS | `brew install k6` |
| Linux | See the [apt/yum instructions](https://grafana.com/docs/k6/latest/set-up/install-k6/) |
| Docker | `docker run --rm -i grafana/k6 run - <loadtest/api-load-test.js` |

Verify with `k6 version`.

## Run

Run from the **repository root** — the scripts write their JSON output to `loadtest/results/`,
a path relative to k6's working directory.

```bash
# Against a local server
k6 run loadtest/api-load-test.js
k6 run loadtest/ws-load-test.js
k6 run loadtest/health-stress-test.js

# Against a deployment (WS_URL defaults to BASE_URL with http→ws, so it is usually optional)
k6 run -e BASE_URL=http://13.127.254.142 loadtest/api-load-test.js
k6 run -e BASE_URL=http://13.127.254.142 -e WS_URL=ws://13.127.254.142 loadtest/ws-load-test.js
k6 run -e BASE_URL=http://13.127.254.142 loadtest/health-stress-test.js

# Quick smoke test — overrides the stages entirely
k6 run --vus 5 --duration 30s loadtest/api-load-test.js
```

Or via the npm scripts: `npm run loadtest:api`, `npm run loadtest:ws`, `npm run loadtest:health`.

## Reading the results

Each run prints a summary and writes the full k6 dataset to `loadtest/results/*-results.json`
(gitignored). k6 exits non-zero if any threshold is breached, which makes these usable as a CI
gate.

Thresholds worth quoting:

| Metric | Threshold | Why |
|--------|-----------|-----|
| `http_req_duration` p95 | < 500 ms | End-to-end REST responsiveness |
| `list_docs_duration` p95 | < 300 ms | The dashboard's hot path |
| `signup_duration` p95 | < 1500 ms | Deliberately loose — bcrypt dominates it by design |
| `ws_connect_duration` p95 | < 2000 ms | Upgrade = JWT verify + access check + room load + initial sync |
| `ws_pong_latency` p95 | < 500 ms | Round-trip responsiveness while rooms are live |
| `errors` / `http_req_failed` | < 10% / < 1% | Correctness under load |

**Calibration caveat:** these are tuned for a load generator on localhost or in the same
LAN/VPC as the server. Running from a laptop against AWS adds one internet round trip
(typically 30–150 ms) to *every* request, so a p95 breach there may be measuring your ISP
rather than the server. For numbers you want to quote, run k6 on an EC2 instance in the same
region.

## What these scripts do not cover

`ws-load-test.js` opens real collaboration sessions but does not generate Yjs edits — encoding a
sync or awareness update requires `yjs` and `lib0`, which k6's JavaScript runtime cannot load.
It exercises the expensive part of the path (auth on upgrade, room creation, the initial
sync-step-1 and awareness broadcast, per-connection bookkeeping, ping round-trips), while CRDT
merge correctness is covered by the dedicated suite:

```bash
npm run test:crdt --workspace=server
```

## Cleaning up test data

Each iteration deletes the document it created, but the throwaway user accounts remain. They all
use the `@loadtest.invalid` email domain, so they are straightforward to remove:

```sql
DELETE FROM "User" WHERE email LIKE '%@loadtest.invalid';
```

Documents, comments, and collaborator rows cascade from the user (see `server/prisma/schema.prisma`).
