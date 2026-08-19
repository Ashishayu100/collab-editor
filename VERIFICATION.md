# Deployment Verification Checklist

Run through this against a deployment before sharing the link. Where a check has a command, use
it — clicking around proves less than the endpoint does.

Commands below target the live deployment at `13.127.254.142`.

---

## Infrastructure

- [ ] EC2 instance running, security groups allow 80/443 inbound
- [ ] RDS PostgreSQL reachable from the instance
- [ ] ElastiCache Redis reachable from the instance
- [ ] Nginx up, proxying both `/api` and the `/ws` upgrade
- [ ] Containers healthy: `docker compose ps`
- [ ] Health endpoint reports **healthy** (not `degraded` — that means Postgres or Redis is down):

```bash
curl -s http://13.127.254.142/api/health
# → {"status":"healthy","serverId":"...","redis":"connected","database":"connected",...}
```

- [ ] Migrations applied: `npx prisma migrate status --schema=server/prisma/schema.prisma`
- [ ] **`LOAD_TEST_MODE` is unset or `false`** — leaving it on disables rate limiting and the
      per-IP WebSocket guards on a public host
- [ ] `ADMIN_EMAILS` set explicitly (in production it must not fall back to "first user wins")
- [ ] JWT secrets are not the `.env.example` placeholders

## Auth

- [ ] Signup creates an account and returns tokens (201)
- [ ] Login returns tokens (200)
- [ ] Protected routes reject a missing or bad token with 401:
      `curl -i http://13.127.254.142/api/documents`
- [ ] Refresh issues a new access token
- [ ] Rate limiting is live — repeated bad logins eventually return 429

## Editor

- [ ] Creating a document opens the editor
- [ ] Typing auto-saves; the save indicator settles on "Saved"
- [ ] A refresh reloads the saved content
- [ ] Toolbar works: bold, italic, headings, lists, code block, link, image
- [ ] Slash commands open on `/` and insert the right node
- [ ] Word and character count update
- [ ] `Ctrl+/` opens the shortcuts dialog

## Real-time collaboration

- [ ] Two users edit the same document simultaneously without conflicts
- [ ] Remote cursors appear with the right names and colors
- [ ] Selections render for remote users
- [ ] Typing indicator shows "X is typing…"
- [ ] Join/leave toasts fire
- [ ] Presence panel lists everyone; follow mode tracks the selected user's viewport
- [ ] Awareness is smooth — cursors move rather than jump
- [ ] A third user joining mid-session receives the full current state

## Comments

- [ ] Comment on a selection creates a highlight in the editor
- [ ] The comment appears for the other user without a refresh
- [ ] Replies thread correctly
- [ ] Resolve / unresolve works and syncs
- [ ] Deleting a comment removes its highlight

## Access control

- [ ] Owner can share, change roles, and delete
- [ ] Editor can edit and comment but **cannot** delete the document
- [ ] Viewer can read but **cannot** edit — confirm at the WebSocket layer too, not just the UI:
      a viewer's edits must not reach other clients
- [ ] Changing a user's role mid-session pushes a live update (no refresh needed)
- [ ] Revoking access ejects the user from the document
- [ ] Share link: generate → open as another user → accept → correct role granted

## Offline

- [ ] DevTools → Network → Offline: editing continues
- [ ] Connection banner shows disconnected, then reconnecting
- [ ] Back online: local edits merge in and appear for the other user
- [ ] A refresh while offline preserves the local edits (IndexedDB)
- [ ] No duplicated or lost text after the merge

## Version history

- [ ] `Ctrl+Shift+H` lists versions
- [ ] Creating a named snapshot works
- [ ] Preview shows the historical content
- [ ] Restore applies and broadcasts to other connected clients
- [ ] Auto-snapshots prune past 50; labeled snapshots survive

## Organization

- [ ] Create, rename, nest, and delete folders
- [ ] Move a document into a folder
- [ ] Star / unstar
- [ ] `Ctrl+K` search returns matches by title
- [ ] Views filter correctly: All, Starred, Shared with me, Recent

## Export

- [ ] PDF downloads and renders correctly (Puppeteer is installed in the server image)
- [ ] Markdown downloads with formatting preserved
- [ ] HTML downloads and opens styled
- [ ] Export rate limit returns 429 after 10 exports in 10 minutes

## Performance

- [ ] Page loads in under 3 seconds on a cold cache
- [ ] Typing has no perceptible lag with two users connected
- [ ] No console errors in DevTools
- [ ] No unhandled rejections in `docker compose logs server`
- [ ] Load tests pass their thresholds (see [loadtest/README.md](loadtest/README.md)):

```bash
k6 run -e BASE_URL=http://13.127.254.142 loadtest/health-stress-test.js   # no special setup
k6 run -e BASE_URL=http://13.127.254.142 loadtest/api-load-test.js        # needs LOAD_TEST_MODE=true
k6 run -e BASE_URL=http://13.127.254.142 loadtest/ws-load-test.js         # needs LOAD_TEST_MODE=true
```

- [ ] **`LOAD_TEST_MODE` turned back off and the server restarted** after those runs
- [ ] Load-test accounts cleaned up: `DELETE FROM "User" WHERE email LIKE '%@loadtest.invalid';`

## Admin

- [ ] `/admin` loads for an email in `ADMIN_EMAILS` and 403s for anyone else
- [ ] Metrics update live
- [ ] Charts render (connections, rooms, throughput, latency, memory)
- [ ] Database counts look right
- [ ] Error log is empty, or every entry is explained

## Resilience

- [ ] Restart the server: clients reconnect and resync without losing edits
- [ ] Stop Redis: the app keeps working in single-server mode; health reports `degraded`
- [ ] Restart Redis: cross-server sync resumes
- [ ] `docker compose restart` leaves no orphaned rooms or stale presence entries
- [ ] Backup script produces a restorable dump (`deployment/aws/scripts/backup-db.sh`)

## Tests

```bash
npm test
npm run test:crdt
```

- [ ] All suites green
