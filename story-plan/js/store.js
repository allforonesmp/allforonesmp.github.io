/* AllForOne Story Planner — in-memory store, indexes, autosave, change history.
 *
 * BreadBackend's SDK has no `where` filtering, so each collection is fetched
 * once and cached; all filtering/sorting/relationship work happens here on the
 * client. Saves are per-document so edits never rewrite the whole collection.
 */

import { db, COLLECTIONS, logEvent } from "./api.js";
import { ENTITIES, LINKS } from "./schema.js";
import { toArray, deepClone, uid } from "./util.js";

const COLLECTION_KEYS = Object.keys(ENTITIES);

const PREFS_KEY = "afo_storyplan_prefs";

export const prefs = {
    autosave: true,
    autosaveDelay: 1200,
    defaultTimelineView: "detail",
    defaultSeasonId: "",
    theme: "light",
    diagramLabels: true,
    confirmDelete: true,
    ...readPrefs(),
};

function readPrefs() {
    try {
        return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {};
    } catch (_) {
        return {};
    }
}

export function savePrefs(patch = {}) {
    Object.assign(prefs, patch);
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (_) {
        /* storage may be unavailable; prefs just won't persist */
    }
}

/* ------------------------------------------------------------------ state */

export const state = {
    collections: Object.fromEntries(COLLECTION_KEYS.map((k) => [k, []])),
    loaded: new Set(), // collections fetched at least once this session
    loading: new Set(),
    inflight: new Map(), // collection -> promise (concurrent callers share one request)
    errors: new Map(), // collection -> ApiError
    pending: new Map(), // `${collection}:${id}` -> patch awaiting save
    saving: new Map(), // docKey -> promise
    saveState: "saved", // saved | dirty | saving | error
    saveStateAt: 0,
    user: null,
    member: null,
    log: [], // recent local activity
    realtimeOn: false,
};

const typed = new Set(); // collections the user explicitly opened

const listeners = new Set();
const errorListeners = new Set();

/* Store events: { type, collection?, id?, doc?, detail? } */
export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function onApiError(fn) {
    errorListeners.add(fn);
    return () => errorListeners.delete(fn);
}

/**
 * Dispatch a store event to the listeners that were registered when it started.
 *
 * The snapshot matters: a Set iterator visits entries added during iteration, so
 * a listener that re-renders itself (re-subscribing in the process) used to keep
 * the loop alive forever. That froze the tab on any save. Listeners that
 * unsubscribed mid-dispatch are skipped, so a disposed view never runs.
 */
function emit(event) {
    for (const fn of Array.from(listeners)) {
        if (!listeners.has(fn)) continue;
        try {
            fn(event);
        } catch (err) {
            console.error("[story-plan] listener failed", err);
        }
    }
}

export function reportError(err, context = "") {
    for (const fn of errorListeners) {
        try {
            fn(err, context);
        } catch (_) {}
    }
}

/* ------------------------------------------------------------- save state */

let saveStateTimer = null;

export function setSaveState(next, detail = "") {
    // error is sticky until a successful write
    if (state.saveState === "error" && next !== "error" && pendingCount() > 0) return;
    if (state.saveState === next) return;
    state.saveState = next;
    state.saveStateAt = Date.now();
    clearTimeout(saveStateTimer);
    emit({ type: "savestate", state: next, detail });
}

export function pendingCount() {
    return state.pending.size;
}

/* -------------------------------------------------------------- loading */

export function docs(collection) {
    return state.collections[collection] || [];
}

export function byId(collection, id) {
    if (!id) return null;
    const list = state.collections[collection] || [];
    for (const d of list) if (String(d.id) === String(id)) return d;
    return null;
}

export function isLoaded(collection) {
    return state.loaded.has(collection);
}

export async function loadCollection(collection, { force = false } = {}) {
    if (!COLLECTION_KEYS.includes(collection)) return [];
    if (!force && state.loaded.has(collection)) return docs(collection);

    // Share one request per collection. The old version spun on a 40ms timer,
    // which stacked up under realtime bursts and made the tab feel frozen.
    const inflight = state.inflight.get(collection);
    if (inflight) {
        // Coalesce: a reload that is already running fetched from the server
        // moments ago, so returning its result is fresher than queueing another
        // round-trip. Realtime bursts therefore cost one request, not N.
        await inflight.catch(() => {});
        return docs(collection);
    }

    const task = (async () => {
        state.loading.add(collection);
        emit({ type: "loading", collection });
        try {
            const list = await db.list(collection, { limit: 2000, orderBy: "createdAt", order: "asc" });
            // preserve local (unsaved) edits that are still pending
            const merged = list.map((doc) => {
                const pendingPatch = state.pending.get(`${collection}:${doc.id}`);
                return pendingPatch ? { ...doc, ...pendingPatch } : doc;
            });
            state.collections[collection] = merged;
            state.loaded.add(collection);
            state.errors.delete(collection);
            applySettingsDoc(collection);
            emit({ type: "loaded", collection, count: merged.length });
            return merged;
        } catch (err) {
            state.errors.set(collection, err);
            emit({ type: "error", collection, error: err });
            throw err;
        } finally {
            state.loading.delete(collection);
            state.inflight.delete(collection);
        }
    })();

    state.inflight.set(collection, task);
    return task;
}

/* Load many collections at once, tolerating individual failures. */
export async function loadCollections(list) {
    const results = await Promise.allSettled(list.map((c) => loadCollection(c)));
    return results;
}

/* Collections the app touches on every screen. */
export const CORE_COLLECTIONS = COLLECTION_KEYS.filter((c) => c !== "storyboard_scenes");

export function markTyped(collection) {
    typed.add(collection);
}

/* ------------------------------------------------------------- settings doc */

let settingsDoc = null;

function applySettingsDoc(collection) {
    if (collection !== COLLECTIONS.settings) return;
    const list = docs(COLLECTIONS.settings);
    settingsDoc = list[0] || null;
    if (settingsDoc && settingsDoc.workspace) {
        workspaceName = settingsDoc.workspace.name || workspaceName;
    }
}

export function getSettingsDoc() {
    return settingsDoc;
}

export function getWorkspaceMeta() {
    return (
        settingsDoc || {
            currentSeasonId: "",
            currentChapterId: "",
            currentArcId: "",
            storyStatus: "",
            overallProgress: 0,
            milestones: [],
        }
    );
}

export async function saveWorkspaceMeta(patch) {
    const current = settingsDoc || {};
    const id = current.id || "workspace";
    const next = { ...current, ...patch, updatedAt: new Date().toISOString(), singleton: true };
    try {
        if (current.id) {
            await db.update(COLLECTIONS.settings, current.id, next);
        } else {
            await db.create(COLLECTIONS.settings, next, id);
        }
        settingsDoc = { ...next, id: current.id || id };
        state.collections[COLLECTIONS.settings] = [settingsDoc];
        state.loaded.add(COLLECTIONS.settings);
        emit({ type: "changed", collection: COLLECTIONS.settings, id: settingsDoc.id, doc: settingsDoc });
        return settingsDoc;
    } catch (err) {
        // First-write may fail if the collection has not been created on the
        // backend yet; keep the value locally so the dashboard still reflects it.
        settingsDoc = { ...next, id: current.id || id };
        state.collections[COLLECTIONS.settings] = [settingsDoc];
        throw err;
    }
}

let workspaceName = "AllForOne SMP";

export function getWorkspaceName() {
    return workspaceName;
}

/* ------------------------------------------------------------- mutations */

function nowISO() {
    return new Date().toISOString();
}

function ensureLocal(collection, doc) {
    if (!state.collections[collection]) state.collections[collection] = [];
    const list = state.collections[collection];
    const idx = list.findIndex((d) => String(d.id) === String(doc.id));
    if (idx >= 0) list[idx] = doc;
    else list.push(doc);
    return doc;
}

/** Create a record optimistically; it is written to BreadBackend immediately. */
export async function createRecord(collection, data, { silent = false } = {}) {
    const timestamp = nowISO();
    const id = data.id || uid(collection.replace(/[^a-z]/g, "").slice(0, 4));
    data.id = id; // let callers address the record even if the write later fails
    const record = {
        ...data,
        id,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: state.user?.email || "",
        archived: Boolean(data.archived),
    };
    ensureLocal(collection, record);
    pushLog("create", collection, record);
    emit({ type: "changed", collection, id, doc: record, origin: "create" });

    setSaveState("saving");
    state.saving.set(`${collection}:${id}`, true);
    try {
        await db.create(collection, stripMeta(record), id);
        state.pending.delete(`${collection}:${id}`);
        setSaveState(pendingCount() ? "dirty" : "saved");
        if (!silent) emit({ type: "saved", collection, id, doc: record });
        logEvent("storyplan_create", { collection });
        return record;
    } catch (err) {
        state.pending.set(`${collection}:${id}`, record);
        setSaveState("error");
        reportError(err, `Creating ${entityLabel(collection)}`);
        throw err;
    } finally {
        state.saving.delete(`${collection}:${id}`);
    }
}

function stripMeta(doc) {
    const out = { ...doc };
    delete out.id;
    return out;
}

/**
 * Patch a record. With autosave on (default) the change is debounced; call
 * `flushPending()` before navigating or signing out.
 */
export function updateRecord(collection, id, patch, { immediate = false, silent = false } = {}) {
    const existing = byId(collection, id);
    if (!existing) throw new Error(`Unknown ${collection} record ${id}`);
    const next = { ...existing, ...patch, updatedAt: nowISO(), updatedBy: state.user?.email || "" };
    ensureLocal(collection, next);
    pushLog("update", collection, next, patch);
    emit({ type: "changed", collection, id, doc: next, origin: "update" });

    const key = `${collection}:${id}`;
    const merged = { ...(state.pending.get(key) || {}), ...patch, updatedAt: next.updatedAt };
    state.pending.set(key, merged);
    setSaveState("dirty");

    if (immediate || !prefs.autosave) {
        return flushDoc(collection, id);
    }
    scheduleFlush(collection, id);
    return Promise.resolve(next);
}

const flushTimers = new Map();

function scheduleFlush(collection, id) {
    const key = `${collection}:${id}`;
    clearTimeout(flushTimers.get(key));
    flushTimers.set(
        key,
        setTimeout(() => {
            flushTimers.delete(key);
            flushDoc(collection, id);
        }, Math.max(350, prefs.autosaveDelay))
    );
}

export async function flushDoc(collection, id) {
    const key = `${collection}:${id}`;
    const patch = state.pending.get(key);
    if (!patch) return null;
    clearTimeout(flushTimers.get(key));
    flushTimers.delete(key);

    state.pending.delete(key);
    state.saving.set(key, true);
    setSaveState("saving");
    try {
        await db.update(collection, id, patch);
        const doc = byId(collection, id);
        if (doc) await recordHistory(collection, doc, patch);
        setSaveState(pendingCount() ? "dirty" : "saved");
        emit({ type: "saved", collection, id, doc: byId(collection, id) });
        logEvent("storyplan_update", { collection });
        return byId(collection, id);
    } catch (err) {
        // keep the patch so a retry (or the next edit) can resend it
        state.pending.set(key, { ...(state.pending.get(key) || {}), ...patch });
        setSaveState("error");
        reportError(err, `Saving ${entityLabel(collection)}`);
        throw err;
    } finally {
        state.saving.delete(key);
    }
}

export async function flushPending() {
    const entries = Array.from(state.pending.keys());
    if (!entries.length) return { ok: 0, failed: 0 };
    let ok = 0;
    let failed = 0;
    for (const key of entries) {
        const [collection, ...rest] = key.split(":");
        const id = rest.join(":");
        try {
            await flushDoc(collection, id);
            ok++;
        } catch (_) {
            failed++;
        }
    }
    return { ok, failed };
}

export function hasUnsaved() {
    return state.pending.size > 0;
}

const STATUS_ON_RESTORE = {
    events: "Planned",
    characters: "Active",
    seasons: "Active",
    chapters: "Planning",
    story_arcs: "Active",
    story_threads: "Active",
    factions: "Active",
    storyboards: "Planning",
};

/**
 * Archive (soft delete). Records are flagged, never destroyed, and every
 * reference to them keeps resolving — nothing is silently broken.
 */
export async function archiveRecord(collection, id, archived = true) {
    const doc = byId(collection, id);
    if (!doc) return null;
    const patch = {
        archived,
        archivedAt: archived ? nowISO() : null,
    };
    if (archived) {
        patch.previousStatus = doc.status || "";
        if (Object.prototype.hasOwnProperty.call(STATUS_ON_RESTORE, collection)) patch.status = "Archived";
    } else if (Object.prototype.hasOwnProperty.call(STATUS_ON_RESTORE, collection)) {
        patch.status = doc.previousStatus || STATUS_ON_RESTORE[collection];
        patch.previousStatus = "";
    }
    return updateRecord(collection, id, patch, { immediate: true });
}

/** Hard delete — only ever used for deliberately disposable records. */
export async function deleteRecord(collection, id) {
    const doc = byId(collection, id);
    if (!doc) return;
    state.collections[collection] = docs(collection).filter((d) => String(d.id) !== String(id));
    emit({ type: "changed", collection, id, origin: "delete" });
    try {
        await db.remove(collection, id);
        pushLog("delete", collection, doc);
        logEvent("storyplan_delete", { collection });
    } catch (err) {
        // roll back the optimistic removal so the UI stays truthful
        ensureLocal(collection, doc);
        emit({ type: "changed", collection, id, doc, origin: "rollback" });
        reportError(err, `Deleting ${entityLabel(collection)}`);
        throw err;
    }
}

export function entityLabel(collection) {
    return ENTITIES[collection]?.label || collection;
}

/* --------------------------------------------------------- change history */

const HISTORY_LIMIT = 400;
const TRACKED_FIELDS_SKIP = new Set(["updatedAt", "updatedBy", "createdAt", "createdBy", "id"]);

let historyCache = [];

export async function loadHistory() {
    try {
        const list = await db.list(COLLECTIONS.history, { limit: HISTORY_LIMIT, orderBy: "createdAt", order: "desc" });
        historyCache = list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        state.collections[COLLECTIONS.history] = historyCache;
        state.loaded.add(COLLECTIONS.history);
        emit({ type: "loaded", collection: COLLECTIONS.history });
        return historyCache;
    } catch (err) {
        // History is best-effort: a missing collection must not break editing.
        console.warn("[story-plan] change history unavailable", err?.message || err);
        return historyCache;
    }
}

export function historyFor(collection, id) {
    return historyCache.filter((h) => h.entityCollection === collection && String(h.entityId) === String(id));
}

export async function recordHistory(collection, doc, patch) {
    const changes = {};
    for (const [key, value] of Object.entries(patch || {})) {
        if (TRACKED_FIELDS_SKIP.has(key)) continue;
        changes[key] = { from: doc[key], to: value };
    }
    if (!Object.keys(changes).length) return;
    const entry = {
        entityCollection: collection,
        entityId: doc.id,
        entityTitle: ENTITIES[collection]?.title(doc) || "",
        changes,
        snapshot: compactSnapshot(doc),
        author: state.user?.email || "",
        createdAt: nowISO(),
    };
    historyCache.unshift(entry);
    state.collections[COLLECTIONS.history] = historyCache;
    try {
        const saved = await db.create(COLLECTIONS.history, stripMeta(entry), uid("hist"));
        entry.id = saved.id;
    } catch (err) {
        console.warn("[story-plan] could not persist history entry", err?.message || err);
    }
}

function compactSnapshot(doc) {
    const snap = {};
    for (const [k, v] of Object.entries(doc)) {
        if (typeof v === "string" && v.length > 4000) snap[k] = v.slice(0, 4000) + "…";
        else if (Array.isArray(v) && v.length > 60) snap[k] = v.slice(0, 60);
        else if (v && typeof v === "object" && JSON.stringify(v).length > 8000) snap[k] = "[omitted]";
        else snap[k] = v;
    }
    return snap;
}

/* --------------------------------------------------------------- activity */

export function pushLog(kind, collection, doc, patch) {
    state.log.unshift({
        kind,
        collection,
        id: doc?.id || "",
        title: ENTITIES[collection]?.title(doc || {}) || "",
        fields: patch ? Object.keys(patch) : [],
        at: Date.now(),
    });
    if (state.log.length > 60) state.log.length = 60;
    emit({ type: "activity" });
}

export function recentActivity(limit = 12) {
    // merge local session activity with server-side updatedAt timestamps
    const merged = [];
    for (const collection of COLLECTION_KEYS) {
        for (const doc of docs(collection)) {
            if (!doc.updatedAt) continue;
            merged.push({
                collection,
                doc,
                at: Date.parse(doc.updatedAt) || 0,
                title: ENTITIES[collection].title(doc),
            });
        }
    }
    merged.sort((a, b) => b.at - a.at);
    const seen = new Set();
    const out = [];
    for (const item of merged) {
        const key = `${item.collection}:${item.doc.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
        if (out.length >= limit) break;
    }
    return out;
}

/* -------------------------------------------------------------- reference */

export function labelFor(collection, id) {
    const doc = byId(collection, id);
    if (!doc) return null;
    return ENTITIES[collection]?.title(doc) || id;
}

/**
 * Everything that references a given entity, across every schema link.
 * Derived on demand from the canonical ref fields, so links can never drift.
 */
export function referencesTo(collection, id) {
    const out = [];
    if (!id) return out;
    for (const link of LINKS) {
        for (const doc of docs(link.collection)) {
            if (String(doc.id) === String(id) && link.collection === collection) continue;
            const values = toArray(doc[link.field]).map(String);
            if (values.includes(String(id))) {
                out.push({ collection: link.collection, field: link.field, fieldLabel: link.label, doc });
            }
        }
    }
    return out;
}

/** Group references by the collection they live in. */
export function referencesGrouped(collection, id) {
    const groups = new Map();
    for (const ref of referencesTo(collection, id)) {
        if (!groups.has(ref.collection)) groups.set(ref.collection, []);
        const list = groups.get(ref.collection);
        if (!list.some((r) => r.doc.id === ref.doc.id)) list.push(ref);
    }
    return groups;
}

/** Outgoing references declared on a document (used for connection panels). */
export function outgoing(collection, doc) {
    const def = ENTITIES[collection];
    if (!def || !doc) return [];
    const out = [];
    for (const group of def.groups) {
        for (const field of group.fields) {
            if (field.type !== "ref" && field.type !== "refs") continue;
            const ids = toArray(doc[field.key]);
            for (const id of ids) {
                out.push({ refType: field.refType, id: String(id), label: field.label, value: doc[field.key] });
            }
        }
    }
    return out;
}

export function resolveRef(refType, id) {
    return byId(refType, id);
}

/* ----------------------------------------------------------------- helpers */

export function activeDocs(collection) {
    return docs(collection).filter((d) => !d.archived);
}

export function archivedDocs(collection) {
    return docs(collection).filter((d) => d.archived);
}

export function nextNumber(collection, field = "number") {
    const nums = docs(collection)
        .map((d) => Number(d[field]))
        .filter((n) => Number.isFinite(n));
    return nums.length ? Math.max(...nums) + 1 : 1;
}

export function generateCode(collection, prefix) {
    const list = docs(collection);
    let n = list.length + 1;
    const used = new Set(list.map((d) => String(d.code || "")));
    let code = `${prefix}-${String(n).padStart(3, "0")}`;
    while (used.has(code)) code = `${prefix}-${String(++n).padStart(3, "0")}`;
    return code;
}

export function resetStore() {
    for (const key of COLLECTION_KEYS) {
        state.collections[key] = [];
    }
    state.loaded.clear();
    state.loading.clear();
    state.errors.clear();
    state.pending.clear();
    state.saving.clear();
    state.log = [];
    state.user = null;
    state.member = null;
    settingsDoc = null;
    historyCache = [];
    typed.clear();
    setSaveState("saved");
    emit({ type: "reset" });
}

/* ------------------------------------------------------------- realtime */

const REALTIME_COLLECTIONS = [
    "events",
    "characters",
    "lore",
    "factions",
    "locations",
    "story_arcs",
    "story_threads",
    "chapters",
    "seasons",
    "notes",
    "character_relationships",
    "faction_relationships",
];

/**
 * Subscribe to every entity collection. Falls back silently when the backend
 * does not stream. Refreshes are debounced per collection.
 */
export function enableRealtimeSync({ onRemoteChange } = {}) {
    if (state.realtimeOn) return [];
    state.realtimeOn = true;
    const timers = new Map();
    const offs = [];
    for (const collection of REALTIME_COLLECTIONS) {
        const off = db.subscribe(collection, () => {
            // Ignore our own echo: a save here already updated the cache, so
            // refetching the whole collection would re-render for nothing.
            if (state.saving.size > 0) return;
            if (state.pending.size > 0) return;
            clearTimeout(timers.get(collection));
            timers.set(
                collection,
                setTimeout(async () => {
                    if (!state.loaded.has(collection)) return;
                    if (state.saving.size > 0 || state.pending.size > 0) return;
                    try {
                        await loadCollection(collection, { force: true });
                        if (onRemoteChange) onRemoteChange(collection);
                    } catch (_) {
                        /* offline or forbidden — the cache stays usable */
                    }
                }, 1200)
            );
        });
        offs.push(off);
    }
    return offs;
}

let historyLoading = null;

/** Load change history on demand (the detail History tab, settings, etc.). */
export function ensureHistory() {
    if (state.loaded.has(COLLECTIONS.history)) return Promise.resolve(historyCache);
    if (!historyLoading) {
        historyLoading = loadHistory().finally(() => {
            historyLoading = null;
        });
    }
    return historyLoading;
}

export function ensureCollection(collection) {
    if (state.loaded.has(collection)) return Promise.resolve(docs(collection));
    return loadCollection(collection).catch(() => docs(collection));
}

export function exportPayload(collections = COLLECTION_KEYS) {
    const out = {
        app: "allforone-story-planner",
        exportedAt: new Date().toISOString(),
        version: 1,
        user: state.user?.email || "",
        collections: {},
    };
    for (const key of collections) {
        if (!state.collections[key]) continue;
        out.collections[key] = deepClone(state.collections[key]);
    }
    return out;
}
