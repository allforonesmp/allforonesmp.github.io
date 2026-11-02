# Story Plan — cloud sync notes

## The reported symptom

> "The cloud has a line through it on my iPhone but can sometimes still pull data."

That was real, and it was the app lying about its own state. `syncStateMeta()` in
`app/main.js` showed the crossed-out cloud whenever **one** `state.sync.status`
flag was `"offline"`. `core/store.js` set that flag if **any one** of the 13
collections failed to load, or if **any one** queued write failed — while the
other 12 collections were merged and realtime events kept arriving. The chip also
had no `.ok/.warn/.err` CSS and hid its text label on small screens, so on an
iPhone the only visible clue was a bare icon with a slash.

## Follow-up: "everything just says queued" (Chrome on iPhone, also Safari)

`queued` means the edit was saved in this browser's `localStorage` but the
`POST`/`PATCH` to BreadBackend has not been accepted yet. Chrome and Safari on
iOS have **separate** `localStorage`, so a queue in Chrome is not visible to
Safari; the reason Safari also shows nothing is that those writes never reached
the shared archive.

Digging into the real `bread-client.js` and the published AFO Backend guide
showed several ways a write can fail while reads keep working:

- **Create response envelopes.** The backend has returned documents wrapped in
  `{ document }`, `{ record }`, `{ data }` or `{ doc }`. The previous
  `create()` only looked at `res.doc` and then **threw** when no id was found —
  that stuck the first queued op forever, and `flush()` broke on the first
  failure, so every later change stayed "queued" too.
- **Expired bearer token.** The SDK stores `bread_auth_<slug>` in localStorage
  but never refreshes it. A 401 makes every POST/PATCH fail while GETs with the
  public `x-api-key` still work.
- **Access rules / CORS.** The backend guide states writes require a bearer
  token and that a denied request usually means the project's **Rules** need
  adjusting; CORS must allow the site origin plus `PATCH`/`POST` and the
  `Authorization` / `x-api-key` headers. A 403 or a fetch/CORS TypeError would
  produce exactly this symptom.
- **Stale `remoteId`.** A cached id for a document that was deleted remotely
  makes `PATCH` return 404, which also blocked the queue.

`/api/health` on the backend returned `{"ok":true}`, so the server itself was
up when this was investigated. The client cannot tell whether a 403 (rules),
401 (session) or CORS block is the cause without seeing the error — the app now
shows it.

### What changed in this follow-up

- `normalizeDoc()` / `normalizeList()` unwrap all known single-document
  envelopes; `create()` recovers an id by looking the record up by its `key`,
  and no longer throws (which was creating infinite retries and duplicates).
- All SDK calls go through `_withRefresh()`: a 401 triggers `auth.refresh()`
  and one retry. `me()` accepts the profile directly, under `user` or `data`.
- `flush()` no longer stops at the first failure: a single bad record is
  rotated to the back so the rest of the queue still syncs. Auth/rules failures
  (401/403) still short-circuit because they affect every write.
- 404 on `PATCH` recreates the document; 404 on `DELETE` is treated as done.
- Errors are translated into plain language (401 → "sign in again", 403 →
  "check project Rules", network → "network/CORS block") and surfaced as a
  **persistent banner** plus a toast, not just a hidden chip label.
- A **Sign in again** action re-authenticates without clearing the local cache
  or queue, then immediately retries the sync.
- 6 more regression checks (`npm test` now runs 15).

### On the phone

1. Tap the cloud chip → **Details** (or read the red banner) to see the exact
   error, failed collections and last successful sync.
2. `401 / session expired` → tap **Sign in again** in the banner. Your queued
   edits stay on the device and are sent afterwards.
3. `403 / Rules` → the archive owner must allow writes for these collections in
   the BreadBackend dashboard (default rules are `allow: "never"`).
4. `network / CORS` → the backend must allow `https://allforonesmp.github.io`
   with `POST`, `PATCH`, `DELETE` and the `Authorization`, `x-api-key`,
   `Content-Type` headers. This cannot be fixed from GitHub Pages alone.

## Issues found

1. **Reads and writes shared a single "offline" flag.** A partial read failure
   marked the whole archive offline and `assertOnlineWrites()` then refused every
   save, even though data was still loading. `navigator.onLine === false` also
   hard-blocked saves; iOS Safari reports that unreliably.
2. **Half-authenticated sessions.** `RemoteDriver.login()` fell back to a
   fabricated `{ email }` user when `me()` failed, so a browser that blocked the
   cross-site session could still enter the archive and pull whatever the
   backend allowed — usually showing a crossed-out cloud with partial data.
3. **Offline mode was read-only and never reconnected.** The auth screen promised
   "changes will be stored locally", but `assertOnlineWrites()` threw for
   `LocalDriver`. The boot fallback was gated on `!navigator.onLine`, so a
   blocked SDK script on a connected iPhone showed a hard error page instead.
4. **Cross-device deletions never propagated.** `mergeRemote()` only added or
   updated. Realtime delete events carry the backend id, but `subscribeAll()`
   looked them up by the app's `key`, so they matched nothing; a delete with no
   doc fell back to `pull()`, which also never removed anything.
5. **Cross-device field removals never propagated.** Merges used
   `{...local, ...remote}` shallow spreads, so fields deleted on another device
   survived locally forever.
6. **No polling fallback.** A clean `pull()` cleared the retry timer; cross-device
   updates depended entirely on realtime subscriptions. iOS suspends those when
   a tab is backgrounded or the screen locks, leaving a device stale while the
   chip still said "Synced".
7. **Silent truncation.** `list()` used `limit: 1000` plus
   `orderBy: "createdAt"`, which both truncates large collections and (on
   Firestore-style backends) drops documents with no `createdAt`. Devices could
   legitimately see different subsets.
8. **Duplicate records.** `create()` returned `{...doc}` when the backend response
   had no id, so `remoteId` was never attached and the next save created another
   cloud document.
9. **Per-device cache bleed.** The cache/queue/verified-session keys were global,
   not account-scoped. Settings → Sign out only called `store.signOut()` and left
   the cache and verified-session flag behind, so a shared phone could reopen the
   archive offline without signing in. Drafts were also skipped whenever the chip
   said offline, losing typed work when iOS killed the tab.
10. **Client-clock conflict resolution.** `updatedAt` comes from each device. A
    phone with a skewed clock always wins (or always loses) against other
    devices; full-document `update()` has no revision check.

## What changed

- `core/store.js`: separate `readStatus` / `writeStatus` / `writeError` /
  `failedCollections` / `truncatedCollections` state; honest `partial` status;
  writes always accepted into the local cache + queue (never blocked by the
  chip); authoritative reconciliation for fully loaded collections; delete
  matching by backend id; full-record replacement for newer remote rows;
  visibility/focus/online heartbeat with backoff; cache owner checks; storage
  quota failures now fail the save instead of reporting success; unified
  `signOut()` clearing cache, queue, session and drafts.
- `core/api.js`: SDK `<script>` error detection; `me()` distinguishes "logged
  out" from "backend unreachable"; `login()` verifies the session instead of
  inventing one; paged `list()` without `orderBy` and with truncation flagging;
  `create()` requires a remote id; normalised realtime actions; `remember`
  passed through.
- `index.html`: SDK `onerror` flag and a longer boot watchdog.
- `main.js`: offline fallback whenever a verified session exists (no
  `navigator.onLine` gate); reconnect watcher; honest cloud chip with
  `aria-label`, real colours and a tap-to-open diagnostics panel; offline banner
  with "Try cloud again"; sign-out paths use `store.signOut()`.
- `core/auth.js`, `components/ui.js`, `views/settings.js`, CSS: corrected copy,
  draft persistence, sync diagnostics in Settings, chip colours.
- `tests/sync.test.mjs` + `package.json`: nine regression checks (`npm test`).

## What the cloud chip means now

| Icon | Meaning |
| --- | --- |
| Green cloud, "Synced" | Reads OK, no queued writes |
| Amber cloud, "N queued" | N edits saved on this device, waiting to send |
| Amber cloud, "Partial" | Some collections failed or were truncated; the rest loaded |
| Red cloud, "Offline" / "Save failed" | Nothing could be read/written |
| Crossed-out cloud, "Local only" | Offline mode; edits queue until reconnect |

Tap the chip (or open Settings → Account) for the exact failed collections,
last pull, last sync, realtime status, SDK status and session error.

## Still needs server-side work

These cannot be fully solved from a static GitHub Pages client:

- **CORS and project Rules (most likely cause of stuck writes).** The backend
  must allow origin `https://allforonesmp.github.io` for `POST`, `PATCH` and
  `DELETE` (plus the `OPTIONS` preflight) and the `Authorization`,
  `x-api-key`, `Content-Type` headers. Its Rules editor defaults to
  `read/write: allow "never"`, so every collection the app writes to
  (`characters`, `events`, `activity`, `access`, …) needs an explicit allow
  rule. A 403 here is invisible to the client beyond the error text.
- **Cross-site sessions on iOS.** The archive lives at
  `kaidaz18.duckdns.org` while the site is on `allforonesmp.github.io`. Safari's
  ITP blocks third-party cookies by default. Prefer a token-based session stored
  in first-party storage, or serve the backend under the same site (a custom
  domain / proxy) so the session is first-party. The SDK does store its bearer
  token in localStorage, but it never refreshes it; the client now calls
  `auth.refresh()` on a 401.
- **Server timestamps / revisions.** Have the backend assign `updatedAt` (or a
  version/ETag) and reject stale updates; otherwise device clock skew and
  last-writer-wins can still clobber edits between devices.
- **Realtime reconnect.** The SDK should reconnect subscriptions after iOS
  backgrounding; the client now polls as a fallback, but a healthy socket is
  still better.
- **Pagination.** Confirm that `collection.get({ offset })` is supported. If it
  is not, the client flags the collection as truncated and refuses to reconcile
  it — no data is deleted, but large collections will not fully sync.
- **Local storage limits.** Safari can evict `localStorage` after days of
  inactivity. Export backups regularly (Settings → Backup everything) for
  anything not yet synced.
