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
    ├── auth.js           session gate (operator-verified email)
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

## 4. Access: operator-verified email — no self-service

There is **no** way for a person to let themselves in. The workspace opens only
for accounts whose **email is marked verified on the backend**, and you do that
by hand in the BreadBackend console.

The gate checks this before anything else: an unverified account (or one whose
verification state is missing) is stopped before any collection is touched, and
the data layer refuses every read, write, upload and subscription. It lands on
the **Access pending** screen, which offers exactly two actions: *Check again*
and *Sign out*. Verification is re-checked while the app is open, so
un-verifying an account locks it out within a couple of minutes.

**To give someone access:** have them sign up, mark their email verified in the
backend console, and have them press *Check again*. They enter as an editor.

**To revoke access:** un-verify the email.

**The `members` collection is optional.** A record whose `email` matches an
account can:

- set its role — `{ "email": "them@example.com", "role": "owner" }` (`owner`,
  `admin`, `editor` or `viewer`);
- block it even though it is verified — `{ "email": "…", "status": "revoked" }`.
  Any `status` other than `active` / `approved`, or an unrecognised `role`,
  blocks the account.

If the collection is empty or cannot be read, verified accounts still get in
with the default role.

**The app never performs verification.** `auth.verifyEmail` and
`resendVerification` are not wrapped; the app only reads the verified flag the
backend reports (`isVerified`) and requires it to be exactly `true`. If your
backend also emails self-service verification links on signup, turn that off —
otherwise people could verify themselves outside this app.

## 5. Before using it — two required backend settings

1. **Require a verified email in the project rules.** The app's gate runs in the browser, and
   BreadBackend's public client key has no per-user roles, so the true boundary is the project
   rule that decides who may read collections. Also turn off self-service verification mail.
2. **Allow authenticated collection access** for the collections listed above, otherwise reads
   return `403 Forbidden by project rules` (the app surfaces this explicitly rather than failing
   silently).

## 6. Known limitations (by design, not oversights)

- The SDK exposes `limit` / `orderBy` only — **no `where` filters** — so each collection is
  fetched once and filtered client-side. Change history and storyboard scenes load lazily.
- No server-side RBAC; the verified-email check runs in the browser. A signed-up account could
  still call the API directly if collection reads are open to all authenticated users — which
  is why §5 step 1 matters.
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

The gate was also driven in a browser against a mocked backend: an unverified account (or one
with no verification state) makes zero collection requests and a direct data-layer call is
refused; verifying the account then pressing *Check again* admits it; a verified account with
no members record enters as an editor; a `revoked` members record blocks a verified account;
and un-verifying an account mid-session locks it out.

## 8. Adding an entity type

Add one entry to `ENTITIES` in `js/schema.js`; the editor, detail view, list view,
cross-reference index, search and exports pick it up automatically.
