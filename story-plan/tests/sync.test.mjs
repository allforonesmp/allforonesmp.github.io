/* Regression checks for cross-device cloud sync.
 *
 * Run with:  npm test   (from the story-plan directory)
 *
 * These exercise the real store.js / api.js against an in-memory fake backend.
 * No browser or network is needed; window/document are deliberately left
 * undefined so the store skips its browser-only listeners.
 */
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    key: (i) => [...mem.keys()][i],
    get length() {
        return mem.size;
    },
};

// Import after the localStorage stub is installed: store.js reads its cache
// at module load time.
const { store, state, clearLocalData } = await import("../app/core/store.js");
const { LocalDriver, RemoteDriver } = await import("../app/core/api.js");
const { bus } = await import("../app/core/util.js");

const user = { email: "writer@example.com" };
const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-02-01T00:00:00.000Z";

class FakeDriver {
    constructor({ fail = [] } = {}) {
        this.kind = "remote";
        this.sdkAvailable = true;
        this.reachable = true;
        this.realtimeFailed = false;
        this.listTruncated = new Set();
        this.rows = {};
        this.fail = new Set(fail);
        this.subs = {};
        this.idc = 0;
    }
    async list(name) {
        if (this.fail.has(name)) throw new Error("blocked " + name);
        return (this.rows[name] || []).map((r) => ({ ...r }));
    }
    async create(name, doc) {
        const id = "srv_" + ++this.idc;
        (this.rows[name] = this.rows[name] || []).push({ ...doc, id });
        return { id, ...doc };
    }
    async update(name, id, patch) {
        const row = (this.rows[name] || []).find((r) => r.id === id);
        if (row) Object.assign(row, patch);
        return { id, ...patch };
    }
    async remove(name, id) {
        this.rows[name] = (this.rows[name] || []).filter((r) => r.id !== id);
    }
    subscribe(name, cb) {
        this.subs[name] = cb;
        return () => {};
    }
    async logout() {}
}

const reset = async (drv) => {
    clearLocalData();
    await store.boot({ driver: drv, user });
};
const log = (name) => console.log("  ok -", name);

/* 1. One failed collection must not be reported as fully offline, and must
      not block writes. This was the "cloud crossed out but data still arrives"
      symptom on iPhone. */
{
    const d = new FakeDriver({ fail: ["access"] });
    d.rows.characters = [{ id: "docA", key: "char_a", name: "Alpha", updatedAt: T0 }];
    await reset(d);
    assert.equal(store.all("characters").length, 1);
    assert.equal(state.sync.readStatus, "partial");
    assert.equal(state.sync.status, "partial");
    assert.equal(store.canWriteOnline(), true);
    assert.equal(store.save("characters", { key: "char_b", name: "Beta" }).key, "char_b");
    await store.flush();
    assert.ok(d.rows.characters.some((r) => r.key === "char_b"));
    assert.equal(state.sync.writeStatus, "ok");
    log("partial read failure keeps data flowing and accepts writes");
}

/* 2. Deletions made on another device propagate on pull. */
{
    const d = new FakeDriver();
    d.rows.characters = [
        { id: "docA", key: "char_a", name: "Alpha", updatedAt: T0 },
        { id: "docB", key: "char_b", name: "Beta", updatedAt: T0 },
    ];
    await reset(d);
    assert.equal(store.all("characters").length, 2);
    d.rows.characters = [d.rows.characters[0]];
    await store.pull();
    assert.equal(store.all("characters").length, 1);
    assert.equal(store.get("characters", "char_b"), null);
    log("cross-device deletions reconcile on pull");
}

/* 3. Realtime delete events carrying only the backend id are honoured. */
{
    const d = new FakeDriver();
    d.rows.characters = [
        { id: "docA", key: "char_a", name: "Alpha", updatedAt: T0 },
        { id: "docB", key: "char_b", name: "Beta", updatedAt: T0 },
    ];
    await reset(d);
    d.rows.characters = [d.rows.characters[0]];
    d.subs.characters({ action: "delete", doc: { id: "docB" } });
    assert.equal(store.all("characters").length, 1);
    log("realtime delete by backend id removes the local record");
}

/* 4. Fields removed on another device actually disappear locally. */
{
    const d = new FakeDriver();
    d.rows.characters = [{ id: "docA", key: "char_a", name: "Alpha", notes: "keep", updatedAt: T0 }];
    await reset(d);
    assert.equal(store.get("characters", "char_a").notes, "keep");
    d.rows.characters = [{ id: "docA", key: "char_a", name: "Alpha", updatedAt: T1 }];
    await store.pull();
    assert.equal(store.get("characters", "char_a").notes, undefined);
    log("remote field removals propagate (no shallow-merge leftovers)");
}

/* 5. Offline writes are accepted locally, survive a reconnect, and sync. */
{
    await reset(new LocalDriver());
    assert.equal(store.save("characters", { key: "offline_1", name: "Written on a phone" }).key, "offline_1");
    const cache = JSON.parse(localStorage.getItem("afo_story_plan_cache_v2"));
    assert.ok(cache.data.characters.some((r) => r.key === "offline_1"));
    assert.ok(JSON.parse(localStorage.getItem("afo_story_plan_queue_v2")).length > 0);
    const d = new FakeDriver();
    await store.boot({ driver: d, user });
    await store.flush();
    assert.ok(d.rows.characters.some((r) => r.key === "offline_1"));
    log("offline edits are queued and sync after reconnect");
}

/* 6. list() pages instead of truncating at 1000 / ordering away documents. */
{
    const rd = new RemoteDriver();
    const calls = [];
    const page1 = Array.from({ length: 500 }, (_, i) => ({ id: "p1_" + i, key: "k1_" + i }));
    const page2 = Array.from({ length: 200 }, (_, i) => ({ id: "p2_" + i, key: "k2_" + i }));
    rd.client = {
        collection: () => ({
            get: async (opts) => {
                calls.push(opts);
                return opts.offset ? page2 : page1;
            },
        }),
    };
    assert.equal((await rd.list("characters")).length, 700);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].orderBy, undefined);
    log("list() pages through large collections without orderBy");
}

/* 7. A blocked/lost session must not fabricate a half-authenticated user. */
{
    const rd = new RemoteDriver();
    rd.client = {
        auth: {
            login: async () => ({ user: { email: user.email } }),
            me: async () => {
                throw new TypeError("Load failed");
            },
        },
    };
    await assert.rejects(() => rd.login(user.email, "pw"), /could not keep the session/i);
    assert.equal(rd.reachable, false);
    log("login refuses to continue when the session cannot be read back");
}

/* 8. Ignored pagination is flagged as truncated, not trusted as complete. */
{
    const rd = new RemoteDriver();
    const page = Array.from({ length: 500 }, (_, i) => ({ id: "x" + i, key: "x" + i }));
    rd.client = { collection: () => ({ get: async () => page }) };
    assert.equal((await rd.list("characters")).length, 500);
    assert.ok(rd.listTruncated.has("characters"));
    log("ignored offset is reported as truncated");
}

/* 9. A truncated collection must never delete local records. */
{
    const d = new FakeDriver();
    d.rows.characters = [
        { id: "docA", key: "char_a", name: "Alpha", updatedAt: T0 },
        { id: "docB", key: "char_b", name: "Beta", updatedAt: T0 },
    ];
    await reset(d);
    d.listTruncated = new Set(["characters"]);
    d.rows.characters = [d.rows.characters[0]];
    await store.pull();
    assert.equal(store.all("characters").length, 2);
    assert.equal(state.sync.readStatus, "partial");
    assert.ok(state.sync.truncatedCollections.includes("characters"));
    log("truncated reads are merged but never reconciled");
}

/* 10. create() wrapped in { document: ... } must not leave the queue stuck. */
{
    const rows = [];
    const rd = new RemoteDriver();
    rd.client = {
        auth: { refresh: async () => ({ token: "t" }) },
        collection: () => ({
            create: async (data) => {
                rows.push({ id: "srv_1", data });
                return { document: { id: "srv_1", data: { ...data } } };
            },
            get: async () => ({ documents: rows }),
        }),
    };
    const created = await rd.create("characters", { key: "wrapped_1", name: "Wrapped" });
    assert.equal(created.id, "srv_1");
    assert.equal(created.key, "wrapped_1");
    log("create response wrapped in { document } attaches the remote id");
}

/* 11. A create with no id is recovered by looking the record up by key. */
{
    const rows = [];
    const rd = new RemoteDriver();
    rd.client = {
        auth: { refresh: async () => ({ token: "t" }) },
        collection: () => ({
            create: async (data) => {
                rows.push({ id: "srv_77", data });
                return { ok: true };
            },
            get: async () => ({ documents: rows }),
        }),
    };
    const created = await rd.create("characters", { key: "k77", name: "No id returned" });
    assert.equal(created.id, "srv_77");
    log("create with no id is recovered from a list lookup");
}

/* 12. One failing write must not block all the other queued changes. */
{
    const d = new FakeDriver();
    const origCreate = d.create.bind(d);
    d.create = async (name, doc) => {
        if (doc.key === "bad") {
            const err = new Error("boom");
            err.status = 500;
            throw err;
        }
        return origCreate(name, doc);
    };
    await reset(d);
    store.save("characters", { key: "bad", name: "Bad" });
    store.save("characters", { key: "good", name: "Good" });
    await store.flush();
    assert.ok(d.rows.characters.some((r) => r.key === "good"), "later write still synced");
    assert.equal(state.sync.pending, 1, "only the failing op remains queued");
    assert.match(state.sync.writeError, /HTTP 500/);
    log("a single failing write no longer blocks the whole queue");
}

/* 13. Auth failures are reported in plain language and emitted to the UI. */
{
    const d = new FakeDriver();
    d.create = async () => {
        const err = { status: 401, error: "unauthorized" };
        throw err;
    };
    let event = null;
    const off = bus.on("sync-write-error", (e) => { event = e; });
    await reset(d);
    store.save("characters", { key: "auth_1", name: "Auth" });
    await store.flush();
    off();
    assert.match(state.sync.writeError, /session expired/i);
    assert.match(event?.message || "", /session expired/i);
    assert.ok(state.sync.pending > 0, "failed writes stay queued");
    log("401 write failures produce an actionable error instead of silence");
}

/* 14. A stale remoteId (404 on PATCH) is recreated instead of blocking. */
{
    const d = new FakeDriver();
    d.rows.characters = [{ id: "docA", key: "char_a", name: "Alpha", updatedAt: T0 }];
    const origUpdate = d.update.bind(d);
    d.update = async (name, id, patch) => {
        if (!(d.rows[name] || []).some((r) => r.id === id)) {
            const err = new Error("not found");
            err.status = 404;
            throw err;
        }
        return origUpdate(name, id, patch);
    };
    await reset(d);
    d.rows.characters = [];
    store.save("characters", { ...store.get("characters", "char_a"), name: "Alpha II" });
    await store.flush();
    assert.ok(d.rows.characters.some((r) => r.key === "char_a" && r.name === "Alpha II"));
    assert.equal(state.sync.pending, 0);
    log("stale remote ids are recreated on a 404");
}

/* 15. /auth/me shapes and token refresh. */
{
    const rd = new RemoteDriver();
    let calls = 0;
    let refreshed = 0;
    rd.client = {
        auth: {
            me: async () => {
                calls++;
                if (calls === 1) {
                    const err = { status: 401, error: "expired" };
                    throw err;
                }
                return { id: "u1", email: user.email };
            },
            refresh: async () => { refreshed++; return { token: "new" }; },
        },
    };
    const session = await rd.me();
    assert.equal(session?.user?.email, user.email, "direct user object accepted");
    assert.equal(refreshed, 1, "401 triggered one token refresh");
    log("me() accepts unwrapped profiles and refreshes expired tokens");
}

console.log("\nAll cloud-sync regression checks passed.");
// The store keeps retry timers alive; don't make `npm test` hang for minutes.
process.exit(0);
