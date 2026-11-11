# AllForOne SMP — Story Planner

A private narrative-management workspace for the AllForOne SMP storyline, served at
`https://allforonesmp.github.io/story-plan/`.

It is a zero-build, dependency-free static application: plain HTML, CSS and ES modules,
talking to **BreadBackend** (project `allforone-story-planner`) through the supplied SDK.

---

## 1. What's here

```
story-plan/
├── index.html            app shell + authentication gate (noindex)
├── 404.html              private not-found page
├── robots.txt            disallow-all for this folder
├── css/app.css           design system (matches the main site palette/typography)
└── js/
    ├── app.js            shell: nav, routing, global search, save indicator, realtime
    ├── api.js            BreadBackend data layer (auth, collections, uploads, errors)
    ├── auth.js           session gate + members approval flow
    ├── store.js          cache, cross-reference index, autosave queue, change history
    ├── schema.js         one declarative definition per entity (drives editor/views/search)
    ├── router.js         hash router (GitHub Pages friendly, no rewrites)
    ├── graph.js          dependency-free SVG force-directed diagram engine
    ├── md.js             Markdown renderer (escapes HTML first — no XSS)
    ├── components/       ui primitives, schema-driven editor, list view, detail view
    └── pages/            dashboard, storyline, timeline, events, characters, lore,
                          factions, locations, arcs, diagrams, storyboards, notes,
                          insights, archive, settings
```

## 2. Features

| Area | What it does |
| --- | --- |
| Dashboard | Current season/arc/chapter, manual progress meters, milestones, upcoming events, recent activity, quick actions |
| Storyline | Seasons → chapters → arcs → events, plus a dedicated story-thread tracker that flags threads with no recent development |
| Events | Main vs normal events, full narrative + production fields, dependency chains, statuses, custom categories/importance |
| Timeline | Detailed / month / year views, zoom, filters (season, character, arc, type, status), drag a card onto a month to reschedule |
| Characters | Full profiles, personal timeline, relationships, knowledge/secrets, side-by-side comparison |
| Relationships | Interactive character map, typed relationships with a preserved history (`Friends → Rivals → Enemies`) |
| Lore | Encyclopedia with knowledge classification (creator-only secrets vs character knowledge) and a lore web |
| Factions / Locations | Goals, membership over time, faction relations, coordinates + dimension + screenshots |
| Diagrams | Live graph over real records, type filters, saved layouts, custom diagrams |
| Storyboards | Ordered scenes with drag-to-reorder, dialogue, props, camera notes |
| Notes | Tagged ideas that convert into events/characters/lore/threads/arcs — the note is always kept |
| Insights | Descriptive, non-prescriptive analytics that surface gaps (missing prerequisites, stale threads, thin profiles) |
| Archive | Soft-deleted records stay searchable and restorable; nothing is destroyed |
| Settings | Account, active sessions, theme, autosave, members, export/import, backend limits |

Cross-references are **derived, never duplicated**: opening a character computes every event,
lore entry, relationship and thread that points at it from the canonical link fields.

## 3. Data model

Collections (created on first write):

`seasons`, `chapters`, `story_arcs`, `story_threads`, `events`, `characters`,
`character_relationships`, `lore`, `factions`, `faction_relationships`, `locations`,
`storyboards`, `storyboard_scenes`, `notes`, `diagrams`, `planner_settings`, `members`,
`change_history`.

Every record carries `id`, `createdAt`, `updatedAt`, and (when archived) `archived` +
`previousStatus`. References are stored as singular IDs or arrays of IDs on the record that
"owns" the relationship, so deleting nothing silently orphans anything.

## 4. Access: operator-verified email + manual allowlist — no self-service

There is **no** way for a person to let themselves in. Two things must both be
true, and only the operator can make either of them true:

1. **The account's email is marked verified on the backend.** You do this by
   hand in the BreadBackend console. The gate checks this first: an unverified
   account (or one whose verification state is missing) is stopped before any
   collection is touched, and the data layer refuses every read, write, upload
   and subscription. Verification is re-checked while the app is open, so
   un-verifying an account locks it out within a couple of minutes.
2. **The account has a record in the `members` collection:**

```json
{ "email": "them@example.com", "role": "editor", "status": "active" }
```

`role` may be `owner`, `admin`, `editor` or `viewer`. `status` must be `active`
(or `approved`). Anything else — `pending`, `revoked`, a missing status, an
unrecognised role — lands on the **Access pending** screen, which offers exactly
two actions: *Check again* (re-reads the database) and *Sign out*.

**To give someone access:** have them sign up, mark their email verified in the
backend console, and create the members record above with that exact email.
They then press *Check again*.

**To revoke access:** un-verify the email, set `status` to `revoked`, or delete the record. The gate
re-reads the allowlist on every load, so this takes effect on their next
navigation — no session needs to be manually killed.

**What the app deliberately does not do:**

- It never verifies an email (`auth.verifyEmail` is not wrapped at all).
- It never sends verification mail (`resendVerification` is not wrapped).
- It never creates, approves or deletes member records. Settings → Members is a
  read-only view so you can confirm who is in.
- It does not bootstrap an owner from the first signup. An empty `members`
  collection means **nobody** gets in, including you — seed your own record.

**The app never performs verification.** It only reads the verified flag the
backend reports (`isVerified`) and requires it to be exactly `true`. If your
backend also emails self-service verification links on signup, turn that off —
otherwise people could verify themselves outside this app.

**If the allowlist cannot be read** (wrong project rules, network failure), the
gate refuses access rather than falling open.

## 5. Before using it — two required backend settings

1. **Restrict signup.** The app's access gate is real, but BreadBackend's public client key has
   no per-user roles, so the true boundary is the project rule that decides who may read
   collections. Make signup **invite-only / disabled** in the BreadBackend dashboard.
2. **Allow authenticated collection access** for the collections listed above, otherwise reads
   return `403 Forbidden by project rules` (the app surfaces this explicitly rather than failing
   silently).

No account is recorded automatically. Until you add the first `members` record by hand, every
sign-in (yours included) stops at **Access pending**.

## 6. Known limitations (by design, not oversights)

- The SDK exposes `limit` / `orderBy` only — **no `where` filters** — so each collection is
  fetched once and filtered client-side. Change history and storyboard scenes load lazily.
- No server-side RBAC; the verified-email and members checks run in the browser. For a hard
  guarantee, also require a verified email in the backend project rules. A signed-up account could still call the API directly if collection
  reads are open to all authenticated users — which is why §5 step 1 matters.
- Version history is application-level: snapshots are written to `change_history` on save and
  can be restored from the record's **History** tab.
- File uploads use `bread.files.upload`; URLs are stored, never base64.
- Realtime uses the SDK's SSE subscription and silently degrades to the local cache if the
  backend does not stream.

## 7. Verification performed

Automated tests drive the real modules against a mocked BreadBackend (jsdom): authentication
gate, login/logout, every route and every detail tab, editor autosave → `PATCH` persistence,
create-with-failed-write resilience, archive/restore, history, Markdown XSS escaping, graph
filter/select/fit, URL-driven filters, global search and session expiry.

A dedicated 28-check allowlist suite proves the gate fails closed: an empty `members`
collection refuses even the first signup and auto-creates nothing; unlisted and revoked
accounts are refused; `status: pending` is refused with a message naming the fix; a listed
`active` account enters (case/whitespace insensitive); adding a record then pressing
*Check again* admits the user live; an unreadable allowlist refuses rather than opening; and
the shipped source contains no verification panel, no request-access button, no
resend-verification control and no owner bootstrap.

## 8. Adding an entity type

Add one entry to `ENTITIES` in `js/schema.js`; the editor, detail view, list view,
cross-reference index, search and exports pick it up automatically.
