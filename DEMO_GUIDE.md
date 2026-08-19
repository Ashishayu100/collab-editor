# Demo Recording Guide — CollabEdit

A 3–5 minute screen recording for the portfolio, README, and LinkedIn. OBS Studio (free) or
Loom both work.

---

## Before you record

1. **Seed the demo data** so the dashboard isn't empty:
   ```bash
   npm run db:seed
   ```
   That creates three accounts, all with the password **`demo1234`**:

   | Account | Set up as |
   |---------|-----------|
   | `alice@demo.com` | Owns documents and folders, has collaborators |
   | `bob@demo.com` | Owns documents, is an **editor** on Alice's roadmap |
   | `carol@demo.com` | Owns documents, is a **viewer** on Alice's roadmap |

   Alice + Bob is your two-browser pair for the collaboration demo. Carol is there if you want to
   show read-only enforcement.

   The deployed database is **not** seeded by default. To record against the live host rather
   than localhost, run the seed inside the server container there first:

   ```bash
   ssh ubuntu@13.127.254.142
   cd /opt/collab-editor && docker compose exec server npx prisma db seed
   ```

   Otherwise sign up fresh accounts on the deployed site and skip the seeded folders.

2. **Two browser windows side by side** — a normal window for Alice, an incognito window (or a
   second browser) for Bob. Same profile can't hold two sessions.

3. **Confirm `LOAD_TEST_MODE` is off** on whatever you're recording against. It disables rate
   limiting, and you don't want that running on a public URL.

4. **Clean up the screen** — close extra tabs, hide the bookmarks bar, silence notifications,
   set the display to 1920×1080.

5. **Warm the server.** The first request after an idle period pays cold-start cost on a
   t3.small. Click through once before you hit record.

---

## Script

Timings are a guide; the collaboration section is the one worth protecting.

### 1. Opening — 15s
Land on the deployed site: **http://13.127.254.142**

> "This is CollabEdit — a real-time collaborative document editor I built from scratch using Yjs
> CRDTs and a custom binary WebSocket protocol. No Socket.io, no y-websocket — the sync layer is
> mine."

### 2. Auth — 15s
Log in as Alice. Show the dashboard: folders in the sidebar, starred documents, the recent list.

### 3. Editor basics — 30s
Open a document. Type. Then show, in this order:
- The formatting toolbar — bold, a heading, a bulleted list
- **Slash commands** — type `/` and pick Heading 1 from the palette
- The status bar — word count and the save-status indicator flipping to "Saved"

> "Saves are debounced five seconds after the last edit, with a periodic backstop, and skipped
> entirely if the document state hasn't actually changed."

### 4. Real-time collaboration — 60s ← **the hero shot**
Bring up the second window with Bob.

- As Alice: open **Share**, add Bob as an **Editor**
- As Bob: open the shared document from "Shared with me"
- **Type in both windows at once.** Let the remote cursors move for a few seconds — this is the
  moment the whole project is about, so give it room
- Point out the avatar bar, the "Bob is typing…" indicator, the join toast
- Click Bob's avatar — the editor jumps straight to his cursor
- Open the **participants panel** and turn on **follow mode** for Bob — scroll in Bob's window
  and show Alice's viewport tracking it

> "Both clients hold a Yjs document. Edits merge as CRDT updates, so there's no server-side
> ordering and no conflict resolution to get wrong — the replicas converge no matter what order
> updates arrive in."

### 5. Comments — 30s
- Select text → add a comment (`Ctrl+Alt+M`)
- Show the highlight mark appearing in the editor
- Watch it show up in Bob's window in real time
- Reply from Bob, then resolve it from Alice
- `Ctrl+Shift+M` toggles the comments panel

### 6. Offline editing — 30s
In Bob's window: DevTools → Network → **Offline**.

- Keep typing. The connection banner switches to disconnected, and edits keep landing
- Optional and convincing: **refresh the page while still offline**. The text is still there —
  that's the Yjs state coming back out of IndexedDB, not the server
- Go back online. Show the banner reconnecting and Bob's offline edits appearing in Alice's
  window

> "Offline state persists to IndexedDB. On reconnect the two states merge as CRDT updates — no
> last-write-wins, no lost paragraphs."

This is the second-most convincing thing in the demo. Don't rush it.

### 7. Version history — 20s
`Ctrl+Shift+H`. Show the snapshot list, open one, restore it — and show the restore landing live
in the other browser.

### 8. Organization — 20s
Back on the dashboard: create a folder, move a document into it, star something, then `Ctrl+K`
and search.

### 9. Export — 15s
Export as **PDF** (rendered server-side with Puppeteer) and open the downloaded file. Mention
Markdown and HTML export exist too.

### 10. Access control — 15s *(optional but strong)*
Log in as Carol, who is a **viewer**. Show that the editor is read-only for her. If you want the
sharp version: with Carol's window open, have Alice change her role — the update lands live over
the socket without a refresh.

### 11. Closing — 15s
Flash the admin dashboard at `/admin` with its live metrics charts.

> "React and TipTap on the front end, Node with a custom WebSocket server on the back, Yjs CRDTs
> for merge, Redis pub/sub so it scales across instances, PostgreSQL for persistence — Dockerized
> and running on AWS."

---

## Keyboard shortcuts worth showing

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Search documents (dashboard) |
| `Ctrl+S` | Save |
| `Ctrl+Shift+H` | Version history |
| `Ctrl+Alt+M` | Comment on selection |
| `Ctrl+Shift+M` | Toggle comments panel |
| `Ctrl+/` | Show the shortcuts dialog |
| `/` | Slash command palette (in the editor) |

---

## Recording tips

- **1920×1080**, 30fps is plenty.
- For the collaboration section, record both windows in one frame rather than cutting between
  them — simultaneity is the whole point and a cut destroys it.
- **Zoom in** on the small stuff: remote cursor labels, the typing indicator, the save status.
  A viewer on a phone will not otherwise see them.
- **No dead air.** Cut the loading gaps in post.
- Do a silent run first to find the pacing, then record with narration.
- If you narrate live, keep it to what's on screen — the architecture story belongs in the
  README, not over a screen recording.

---

## Where it goes

1. **README** — link the video near the top, next to the live demo URL.
2. **LinkedIn** — post the video with the two or three technical points that actually
   differentiate the project (custom protocol, CRDT convergence, offline merge), not a feature
   list.
3. **Résumé** — live link plus GitHub link.
