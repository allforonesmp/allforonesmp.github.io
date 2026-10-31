/* =========================================================================
   Store — local-first data layer over the backend driver.

   • Records keep a stable local `key` and an optional backend `remoteId`.
   • Every write is mirrored to localStorage instantly, then queued for the
     backend. Failed writes stay queued and retry automatically.
   • Remote changes from other authors are merged in realtime by updatedAt.
   ========================================================================= */

import { bus, uid } from "./util.js";
import { TYPES, REF_LABEL } from "./schema.js";

export const COLLECTIONS = [
    "characters",
    "events",
    "factions",
    "storylines",
    "relationships",
    "mysteries",
    "secrets",
    "locations",
    "items",
    "links",
    "maps",
    "activity",
    "access",
];

const CACHE_KEY = "afo_story_plan_cache_v2";
const QUEUE_KEY = "afo_story_plan_queue_v2";
const PREFS_KEY = "afo_story_plan_prefs_v2";
const DEFAULT_PREFS = {
    sidebarCollapsed: false,
    density: "comfortable",
    edgeColors: {
        ally: "#4fbf82",
        enemy: "#e05d52",
        family: "#5f96e8",
        conflict: "#e09a4f",
        secret: "#a67ce8",
        historic: "#6f7b89",
        romance: "#e07fae",
        mentor: "#4ec7bd",
    },
    showEdgeLabels: true,
    showNodeLabels: true,
    lastMapId: null,
    dashboardSection: "all",
};

function loadJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (err) {
        console.warn("[store] could not parse", key, err);
        return fallback;
    }
}

function saveJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (err) {
        console.error("[store] localStorage write failed", err);
        bus.emit("storage-error", err);
        return false;
    }
}

const emptyData = () => Object.fromEntries(COLLECTIONS.map((c) => [c, []]));

export const state = {
    ready: false,
    user: null,
    approved: null,
    driverKind: "remote",
    sync: { status: "idle", pending: 0, lastSync: null, error: null },
    data: emptyData(),
    prefs: { ...DEFAULT_PREFS, ...loadJSON(PREFS_KEY, {}) },
    accessSupported: true,
    demoPresent: false,
};

state.prefs.edgeColors = { ...DEFAULT_PREFS.edgeColors, ...(state.prefs.edgeColors || {}) };

let driver = null;
let queue = loadJSON(QUEUE_KEY, []);
let retryTimer = null;
let flushing = false;
const unsubs = [];

/* -------------------------------------------------------------------------
   Cache
   ------------------------------------------------------------------------- */
function loadCache() {
    const cached = loadJSON(CACHE_KEY, null);
    if (cached && cached.data) {
        for (const c of COLLECTIONS) {
            const rows = cached.data[c];
            if (Array.isArray(rows)) state.data[c] = rows;
        }
        state.demoPresent = Object.values(state.data)
            .flat()
            .some((r) => r && r.demo);
    }
}

function persistCache() {
    const slim = {};
    for (const c of COLLECTIONS) slim[c] = state.data[c];
    saveJSON(CACHE_KEY, { savedAt: new Date().toISOString(), data: slim });
}

loadCache();

/* -------------------------------------------------------------------------
   Basic accessors
   ------------------------------------------------------------------------- */
export const store = {
    get state() {
        return state;
    },

    /* ---------------------------------------------------------------- reads */
    all(type, { includeArchived = false } = {}) {
        const rows = state.data[type] || [];
        return includeArchived ? rows.slice() : rows.filter((r) => !r.archived);
    },

    get(type, id) {
        if (!id) return null;
        return (state.data[type] || []).find((r) => r.key === id || r.id === id) || null;
    },

    nameOf(type, id) {
        const row = this.get(type, id);
        if (!row) return null;
        const field = REF_LABEL[type] || "name";
        return row[field] || row.name || row.title || "Untitled";
    },

    label(type, id, fallback = "Unknown record") {
        return this.nameOf(type, id) || fallback;
    },

    refOptions(type) {
        const field = REF_LABEL[type] || "name";
        return this.all(type, { includeArchived: true })
            .filter((r) => !r.archived)
            .map((r) => ({ value: r.key, label: r[field] || r.name || r.title || "Untitled" }))
            .sort((a, b) => String(a.label ?? "").localeCompare(String(b.label ?? "")));
    },

    count(type, opts) {
        return this.all(type, opts).length;
    },

    /* --------------------------------------------------------------- writes */
    save(type, record, { silent = false, activity } = {}) {
        if (!COLLECTIONS.includes(type)) throw new Error(`Unknown collection ${type}`);
        const now = new Date().toISOString();
        const exists = record.key ? this.get(type, record.key) : null;
        const row = JSON.parse(JSON.stringify(record));
        row.key = row.key || row.id || uid(type.slice(0, 3));
        delete row.id;
        row.createdAt = exists?.createdAt || row.createdAt || now;
        row.updatedAt = now;
        if (exists?.remoteId) row.remoteId = exists.remoteId;
        if (exists?.demo) row.demo = true;

        // Canon is append-only history: changing the canon label (for example
        // retconning a record) preserves a snapshot of what came before.
        if (exists && exists.canon && row.canon && exists.canon !== row.canon) {
            const snapshot = {};
            for (const field of ["name", "title", "description", "summary", "status", "canon", "truth", "premise", "subtitle", "content"]) {
                if (exists[field] !== undefined) snapshot[field] = exists[field];
            }
            row.canonHistory = [
                ...(Array.isArray(exists.canonHistory) ? exists.canonHistory : []),
                {
                    from: exists.canon,
                    to: row.canon,
                    at: now,
                    by: state.user?.email || "local",
                    snapshot,
                },
            ].slice(-25);
        } else if (exists?.canonHistory) {
            row.canonHistory = exists.canonHistory;
        }

        const list = state.data[type];
        const idx = list.findIndex((r) => r.key === row.key);
        if (idx >= 0) list[idx] = row;
        else list.push(row);

        const action = exists ? "update" : "create";
        persistCache();
        enqueue({ op: "upsert", type, key: row.key });
        flushSoon();
        bus.emit("change", { type, action, record: row, silent });
        if (!silent && type !== "activity" && type !== "access") {
            this.log({
                action: action === "create" ? "created" : "updated",
                type,
                key: row.key,
                message: activity || `${TYPES[type]?.singular || type} "${this.nameOf(type, row.key) || "Untitled"}" ${action === "create" ? "was added" : "was updated"}.`,
            });
        }
        return row;
    },

    remove(type, { key, cleanup = true } = {}) {
        const row = this.get(type, key);
        if (!row) return false;
        state.data[type] = state.data[type].filter((r) => r.key !== key);
        if (cleanup) purgeReferences(type, key);
        persistCache();
        enqueue({ op: "delete", type, key, remoteId: row.remoteId });
        flushSoon();
        bus.emit("change", { type, action: "delete", record: row });
        if (type !== "activity") {
            this.log({
                action: "deleted",
                type,
                key,
                message: `${TYPES[type]?.singular || type} "${this.nameOf(type, key) || row.name || row.title || "Untitled"}" was deleted.`,
            });
        }
        return true;
    },

    archive(type, key, archived = true) {
        const row = this.get(type, key);
        if (!row) return null;
        return this.save(type, { ...row, archived }, { activity: `"${this.nameOf(type, key) || "Record"}" was ${archived ? "archived" : "restored"}.` });
    },

    duplicate(type, key) {
        const row = this.get(type, key);
        if (!row) return null;
        const copy = JSON.parse(JSON.stringify(row));
        delete copy.key;
        delete copy.remoteId;
        delete copy.demo;
        const nameField = REF_LABEL[type] || "name";
        copy[nameField] = `${row[nameField] || "Untitled"} (copy)`;
        return this.save(type, copy, { activity: `${TYPES[type].singular} duplicated.` });
    },

    /* ------------------------------------------------------------- activity */
    log({ action, type, key, message }) {
        const row = {
            key: uid("act"),
            action,
            entityType: type,
            entityKey: key || "",
            message,
            email: state.user?.email || "local",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        state.data.activity.unshift(row);
        if (state.data.activity.length > 500) state.data.activity.length = 500;
        persistCache();
        enqueue({ op: "upsert", type: "activity", key: row.key });
        flushSoon();
        bus.emit("activity", row);
        return row;
    },

    /* ----------------------------------------------------------------- prefs */
    prefs() {
        return state.prefs;
    },

    setPref(key, value) {
        state.prefs[key] = value;
        saveJSON(PREFS_KEY, state.prefs);
        bus.emit("prefs", { key, value });
    },

    setEdgeColor(kind, color) {
        state.prefs.edgeColors[kind] = color;
        saveJSON(PREFS_KEY, state.prefs);
        bus.emit("prefs", { key: "edgeColors" });
    },

    resetPrefs() {
        state.prefs = JSON.parse(JSON.stringify(DEFAULT_PREFS));
        saveJSON(PREFS_KEY, state.prefs);
        bus.emit("prefs", { key: "*" });
    },

    /* --------------------------------------------------------------- driver */
    async boot({ driver: drv, user }) {
        driver = drv;
        state.user = user;
        state.driverKind = drv.kind;
        state.ready = true;
        bus.emit("ready", state);
        await this.pull({ initial: true });
        subscribeAll();
        if (queue.length) this.flush();
        flushSoon(1200);
    },

    setUser(user) {
        state.user = user;
    },

    async pull({ initial = false } = {}) {
        if (!driver || driver.kind === "local") {
            state.sync.status = "local";
            bus.emit("sync", state.sync);
            return;
        }
        state.sync.status = "syncing";
        bus.emit("sync", state.sync);
        try {
            const results = await Promise.all(
                COLLECTIONS.map(async (c) => {
                    try {
                        return [c, await driver.list(c)];
                    } catch (err) {
                        console.warn(`[store] could not load ${c}`, err);
                        return [c, null];
                    }
                }),
            );
            let merged = 0;
            const failedCollections = [];
            for (const [collection, rows] of results) {
                if (!rows) {
                    failedCollections.push(collection);
                    continue;
                }
                merged += mergeRemote(collection, rows);
            }
            state.sync = failedCollections.length
                ? {
                      status: "offline",
                      pending: queue.length,
                      lastSync: state.sync.lastSync,
                      error: `Could not load ${failedCollections.join(", ")} from the backend.`,
                  }
                : { status: "online", pending: queue.length, lastSync: new Date().toISOString(), error: null };
            state.demoPresent = Object.values(state.data)
                .flat()
                .some((r) => r && r.demo);
            persistCache();
            bus.emit("change", { type: "*", action: "pull", merged });
            bus.emit("sync", state.sync);
            if (failedCollections.length || queue.length) scheduleRetry();
            else clearTimeout(retryTimer);
        } catch (err) {
            state.sync = { ...state.sync, status: "offline", error: err.message || "Backend unreachable", pending: queue.length };
            bus.emit("sync", state.sync);
            scheduleRetry();
        }
    },

    async flush() {
        if (flushing || !driver || driver.kind === "local" || !queue.length) {
            if (!queue.length) {
                state.sync.pending = 0;
                if (state.sync.status === "syncing") state.sync.status = "online";
                bus.emit("sync", state.sync);
            }
            return;
        }
        flushing = true;
        state.sync.status = "syncing";
        state.sync.pending = queue.length;
        bus.emit("sync", state.sync);

        let failed = false;
        while (queue.length) {
            const op = queue[0];
            const local = this.get(op.type, op.key);
            try {
                if (op.op === "delete") {
                    if (local?.remoteId || op.remoteId) await driver.remove(op.type, local?.remoteId || op.remoteId);
                } else {
                    if (!local) {
                        queue.shift();
                        continue;
                    }
                    const payload = payloadFor(local);
                    if (local.remoteId) {
                        await driver.update(op.type, local.remoteId, payload);
                    } else {
                        const created = await driver.create(op.type, payload);
                        if (created?.id) {
                            const target = this.get(op.type, op.key);
                            if (target) {
                                target.remoteId = created.id;
                                persistCache();
                            }
                        }
                    }
                }
                queue.shift();
                state.sync.pending = queue.length;
            } catch (err) {
                failed = true;
                // Keep failed writes queued. In particular, authentication or
                // rule errors must never silently discard locally saved work;
                // once credentials/rules are fixed, a retry can sync it.
                op.attempts = (op.attempts || 0) + 1;
                state.sync.error = err.message || "Could not save to the backend";
                console.warn("[store] save remains queued for retry", op, err);
                break;
            }
        }
        saveJSON(QUEUE_KEY, queue);
        flushing = false;
        state.sync = {
            ...state.sync,
            status: failed ? "offline" : "online",
            pending: queue.length,
            lastSync: failed ? state.sync.lastSync : new Date().toISOString(),
            error: failed ? state.sync.error : null,
        };
        bus.emit("sync", state.sync);
        if (failed) {
            scheduleRetry();
        }
    },

    async retry() {
        clearTimeout(retryTimer);
        await this.pull();
        await this.flush();
    },

    queueSize() {
        return queue.length;
    },

    /* --------------------------------------------------------------- uploads */
    async uploadFile(file) {
        if (!driver) throw new Error("Not connected");
        if (file.size > 8 * 1024 * 1024) throw new Error("That image is larger than 8 MB.");
        const { url } = await driver.upload(file);
        return url;
    },

    /* ------------------------------------------------------------- access */
    async loadAccess() {
        if (!driver) return [];
        try {
            const rows = await driver.list("access");
            state.data.access = rows.map((r) => ({ ...r, key: r.key || r.id }));
            state.accessSupported = true;
            persistCache();
            return state.data.access;
        } catch (err) {
            console.warn("[store] access list unavailable", err);
            state.accessSupported = false;
            return [];
        }
    },

    isApproved(email) {
        if (state.user?.role === "owner") return true;
        const rows = state.data.access || [];
        if (!rows.length || !state.accessSupported) return true; // bootstrap / restricted backend
        const target = String(email || "").toLowerCase();
        const match = rows.find((r) => String(r.email || "").toLowerCase() === target);
        return Boolean(match && match.active !== false);
    },

    async bootstrapAccess(user, { makeOwner = false } = {}) {
        const email = String(user?.email || "").toLowerCase();
        if (!email) return null;
        const existing = (state.data.access || []).find((r) => String(r.email || "").toLowerCase() === email);
        if (existing) {
            if (existing.active === false) return existing;
            return existing;
        }
        try {
            const row = await this.save("access", {
                email,
                role: makeOwner || !state.data.access.length ? "owner" : "viewer",
                active: true,
                addedBy: email,
            });
            return row;
        } catch (err) {
            console.warn("[store] could not bootstrap access", err);
            return null;
        }
    },

    async grantAccess(email, role = "editor") {
        const clean = String(email || "").trim().toLowerCase();
        if (!clean) throw new Error("Enter an email address.");
        const existing = (state.data.access || []).find((r) => String(r.email || "").toLowerCase() === clean);
        if (existing) return this.save("access", { ...existing, role, active: true });
        return this.save("access", { email: clean, role, active: true, addedBy: state.user?.email || "" });
    },

    async revokeAccess(key) {
        const row = this.get("access", key);
        if (!row) return;
        return this.save("access", { ...row, active: false });
    },

    async removeAccess(key) {
        return this.remove("access", { key, cleanup: false });
    },

    /* --------------------------------------------------------------- demo */
    async seedDemo(builder) {
        const dataset = builder();
        const created = [];
        for (const [collection, rows] of Object.entries(dataset)) {
            if (!COLLECTIONS.includes(collection)) continue;
            for (const row of rows) {
                created.push(
                    this.save(collection, { ...row, demo: true, key: row.key }, { silent: true }),
                );
            }
        }
        state.demoPresent = true;
        this.log({ action: "seeded", type: "demo", key: "", message: `Demonstration archive loaded — ${created.length} records across ${Object.keys(dataset).length} collections.` });
        await this.flush();
        bus.emit("change", { type: "*", action: "seed" });
        return created.length;
    },

    async removeDemo() {
        const removed = [];
        for (const collection of COLLECTIONS) {
            const rows = [...(state.data[collection] || [])].filter((r) => r.demo);
            for (const row of rows) {
                state.data[collection] = state.data[collection].filter((r) => r.key !== row.key);
                enqueue({ op: "delete", type: collection, key: row.key, remoteId: row.remoteId });
                removed.push(`${collection}/${row.key}`);
            }
        }
        state.demoPresent = false;
        persistCache();
        this.log({ action: "seeded", type: "demo", key: "", message: `Demonstration archive removed — ${removed.length} records cleared.` });
        await this.flush();
        bus.emit("change", { type: "*", action: "demo-removed" });
        return removed.length;
    },

    /* ------------------------------------------------------------ export */
    exportData() {
        const data = {};
        for (const c of COLLECTIONS) data[c] = state.data[c] || [];
        return {
            app: "AllForOne Story Plan",
            version: 2,
            exportedAt: new Date().toISOString(),
            exportedBy: state.user?.email || "",
            data,
            prefs: state.prefs,
        };
    },

    async importData(payload, { mode = "merge" } = {}) {
        if (!payload || !payload.data) throw new Error("That file does not contain a Story Plan archive.");
        const incoming = payload.data;
        let count = 0;
        if (mode === "replace") {
            for (const c of COLLECTIONS) {
                if (c === "access") continue;
                state.data[c] = [];
            }
        }
        for (const c of COLLECTIONS) {
            if (!Array.isArray(incoming[c])) continue;
            for (const row of incoming[c]) {
                if (!row || (!row.key && !row.id)) continue;
                const key = row.key || row.id;
                const copy = { ...row, key };
                delete copy.id;
                copy.updatedAt = copy.updatedAt || new Date().toISOString();
                const existing = this.get(c, key);
                if (existing) {
                    if (mode === "merge" && (existing.updatedAt || "") > (copy.updatedAt || "")) continue;
                    copy.remoteId = existing.remoteId || copy.remoteId;
                }
                const list = state.data[c];
                const idx = list.findIndex((r) => r.key === key);
                if (idx >= 0) list[idx] = copy;
                else list.push(copy);
                enqueue({ op: "upsert", type: c, key });
                count++;
            }
        }
        if (payload.prefs) {
            state.prefs = { ...state.prefs, ...payload.prefs, edgeColors: { ...state.prefs.edgeColors, ...(payload.prefs.edgeColors || {}) } };
            saveJSON(PREFS_KEY, state.prefs);
        }
        persistCache();
        this.log({ action: "imported", type: "backup", key: "", message: `Imported ${count} records from a JSON backup.` });
        bus.emit("change", { type: "*", action: "import" });
        await this.flush();
        return count;
    },

    async clearAll({ keepDemo = false } = {}) {
        for (const c of COLLECTIONS) {
            if (c === "access") continue;
            const keep = keepDemo ? (state.data[c] || []).filter((r) => r.demo) : [];
            const removed = (state.data[c] || []).filter((r) => !keep.includes(r));
            for (const row of removed) enqueue({ op: "delete", type: c, key: row.key, remoteId: row.remoteId });
            state.data[c] = keep;
        }
        persistCache();
        this.log({ action: "cleared", type: "database", key: "", message: "The archive was cleared." });
        await this.flush();
        bus.emit("change", { type: "*", action: "clear" });
    },

    async signOut() {
        unsubs.forEach((u) => {
            try {
                u?.();
            } catch (err) {}
        });
        unsubs.length = 0;
        if (driver) await driver.logout();
        bus.emit("signed-out");
    },
};

/* -------------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------------- */
function payloadFor(record) {
    const out = { ...record, key: record.key };
    delete out.remoteId;
    return out;
}

function enqueue(op) {
    const idx = queue.findIndex((q) => q.type === op.type && q.key === op.key);
    if (op.op === "delete") {
        if (idx >= 0 && queue[idx].op === "upsert" && !queue[idx].remoteId) queue.splice(idx, 1);
        const existing = queue.find((q) => q.type === op.type && q.key === op.key);
        if (!existing) queue.push(op);
        else Object.assign(existing, op);
    } else if (idx >= 0) {
        queue[idx].op = "upsert";
    } else {
        queue.push({ ...op });
    }
    saveJSON(QUEUE_KEY, queue.map((q) => ({ ...q, attempts: q.attempts || 0 })));
    state.sync.pending = queue.length;
}

function flushSoon(delay = 350) {
    clearTimeout(flushSoon.t);
    flushSoon.t = setTimeout(() => store.flush(), delay);
}

function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
        if (queue.length) store.flush();
        else store.pull();
    }, 20000);
    bus.emit("sync", state.sync);
}

function mergeRemote(collection, rows) {
    let merged = 0;
    const list = state.data[collection] || (state.data[collection] = []);
    for (const raw of rows) {
        const key = raw.key || raw.id;
        if (!key) continue;
        const incoming = { ...raw, key, remoteId: raw.id && raw.id !== key ? raw.id : raw.remoteId || raw.id };
        delete incoming.id;
        const idx = list.findIndex((r) => r.key === key);
        const pending = queue.some((q) => q.type === collection && q.key === key);
        if (idx === -1) {
            if (!pending) {
                list.push(incoming);
                merged++;
            }
        } else if (!pending) {
            const localTime = new Date(list[idx].updatedAt || 0).getTime();
            const remoteTime = new Date(incoming.updatedAt || 0).getTime();
            if (remoteTime >= localTime && JSON.stringify(list[idx]) !== JSON.stringify(incoming)) {
                list[idx] = { ...list[idx], ...incoming };
                merged++;
            }
        }
    }
    return merged;
}

function subscribeAll() {
    if (!driver || driver.kind === "local") return;
    for (const collection of COLLECTIONS) {
        try {
            const unsub = driver.subscribe(collection, ({ action, doc }) => {
                if (!doc || !doc.id) {
                    if (action === "delete") store.pull();
                    return;
                }
                const key = doc.key || doc.id;
                if (queue.some((q) => q.type === collection && q.key === key)) return;
                const list = state.data[collection] || (state.data[collection] = []);
                const idx = list.findIndex((r) => r.key === key);
                if (action === "delete") {
                    if (idx >= 0) list.splice(idx, 1);
                } else if (idx === -1) {
                    list.push({ ...doc, key, remoteId: doc.id });
                } else {
                    const remoteTime = new Date(doc.updatedAt || 0).getTime();
                    const localTime = new Date(list[idx].updatedAt || 0).getTime();
                    if (remoteTime >= localTime) list[idx] = { ...list[idx], ...doc, key };
                }
                persistCache();
                bus.emit("change", { type: collection, action: "realtime" });
            });
            unsubs.push(unsub);
        } catch (err) {
            /* realtime is optional */
        }
    }
}

function purgeReferences(deletedType, deletedKey) {
    const REF_RE = /(Id|Ids)$/;
    const walk = (value, owner) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
            value.forEach((item) => walk(item, owner));
            return;
        }
        for (const [k, v] of Object.entries(value)) {
            if (REF_RE.test(k)) {
                if (Array.isArray(v)) {
                    const next = v.filter((x) => x !== deletedKey);
                    if (next.length !== v.length) value[k] = next;
                } else if (v === deletedKey) {
                    value[k] = "";
                }
            } else if (v && typeof v === "object") {
                walk(v, owner);
            }
        }
    };
    for (const collection of COLLECTIONS) {
        if (collection === deletedType) continue;
        for (const row of [...(state.data[collection] || [])]) {
            if (collection === "relationships" && (row.aId === deletedKey || row.bId === deletedKey)) {
                // A relationship without a character is meaningless.
                state.data[collection] = state.data[collection].filter((r) => r.key !== row.key);
                enqueue({ op: "delete", type: collection, key: row.key, remoteId: row.remoteId });
                continue;
            }
            if (collection === "links") {
                if (row.fromId === deletedKey || row.toId === deletedKey) {
                    state.data[collection] = state.data[collection].filter((r) => r.key !== row.key);
                    enqueue({ op: "delete", type: collection, key: row.key, remoteId: row.remoteId });
                    continue;
                }
            }
            const before = JSON.stringify(row);
            walk(row, row);
            if (JSON.stringify(row) !== before) {
                row.updatedAt = new Date().toISOString();
                enqueue({ op: "upsert", type: collection, key: row.key });
            }
        }
    }
}

// Retry when the browser comes back online.
if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
        if (queue.length) setTimeout(() => store.flush(), 800);
    });
    window.addEventListener("storage", (e) => {
        if (e.key === QUEUE_KEY) {
            try {
                queue = JSON.parse(e.newValue || "[]");
            } catch (err) {
                queue = [];
            }
        }
    });
}
