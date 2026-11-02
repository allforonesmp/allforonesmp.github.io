/* =========================================================================
   Backend adapter
   Wraps the BreadBackend JS SDK. Everything above this file talks to a
   driver with a stable, tiny interface:

     driver.list(collection)         -> Promise<doc[]>
     driver.create(collection, doc)  -> Promise<doc>
     driver.update(collection, id, patch) -> Promise<doc>
     driver.remove(collection, id)   -> Promise<void>
     driver.upload(file)             -> Promise<{url}>
     driver.subscribe(collection,cb) -> unsubscribe fn
     driver.login(email, password)   -> Promise<user>
     driver.me()                     -> Promise<{user}|null>
     driver.logout()                 -> Promise<void>

   The storage layer (store.js) owns offline caching, queues and merging,
   so the backend can be swapped by replacing this driver.
   ========================================================================= */

import { SCHEMAS } from "./schema.js";

export const BACKEND = {
    baseUrl: "https://kaidaz18.duckdns.org",
    projectSlug: "allforone-story-plan",
    apiKey: "pk_live_WSjs9Lo5AzuzTyfAzP9vUZPE",
};

// iOS Safari can take a while to fetch a cross-origin SDK on a cold mobile
// connection. Give it longer, but fail fast when the <script> itself errors
// (content blockers / ITP / DNS) instead of leaving the boot spinner up.
const SDK_TIMEOUT_MS = 20000;

function isNetworkFailure(err, message = "") {
    if (err?.status === 0 || err?.statusCode === 0) return true;
    if (err?.name === "TypeError" || err?.code === "ECONNABORTED") return true;
    return /failed to fetch|fetch failed|network|load failed|timed out|timeout|cors|offline|dns|could not connect/i.test(String(message || ""));
}

export function normalizeDoc(doc) {
    if (!doc || typeof doc !== "object") return null;
    // The backend has shipped several envelopes for a single document:
    //   { id, data: {...} }  /  { document: {...} }  /  { record: {...} }
    //   { doc: {...} }       /  { data: { id, ...fields } }
    // Unwrap them before looking for the id, otherwise a perfectly good
    // create/update response looks like "no id" and the write queue sticks.
    const envelope = [doc.document, doc.record, doc.doc, doc.item, doc.result].find(
        (v) => v && typeof v === "object" && !Array.isArray(v) && v !== doc,
    );
    const inner =
        envelope ||
        (doc.data && typeof doc.data === "object" && !Array.isArray(doc.data) &&
        (doc.data.id || doc.data._id || doc.data.documentId)
            ? doc.data
            : doc);
    const payload = inner.data && typeof inner.data === "object" && !Array.isArray(inner.data) ? inner.data : null;
    const out = payload ? { ...inner, ...payload } : { ...inner };
    // Keep the backend document id distinct from the app's stable local key.
    const remoteId =
        inner.id || inner._id || inner.documentId || inner.uid ||
        payload?.id || payload?._id || payload?.documentId || payload?.uid ||
        doc.id || doc._id || doc.documentId || doc.uid;
    out.id = String(remoteId || "");
    if (!out.id) return null;
    delete out.data;
    expandDottedFields(out);
    for (const key of ["createdAt", "updatedAt"]) {
        const v = out[key];
        if (v && typeof v === "object") {
            const secs = v._seconds ?? v.seconds ?? v.sec;
            if (typeof secs === "number") out[key] = new Date(secs * 1000).toISOString();
        }
    }
    return out;
}

function expandDottedFields(record) {
    for (const [path, value] of Object.entries(record)) {
        if (!path.includes(".")) continue;
        const parts = path.split(".").filter(Boolean);
        if (parts.length < 2) continue;
        let target = record;
        for (const part of parts.slice(0, -1)) {
            if (!target[part] || typeof target[part] !== "object" || Array.isArray(target[part])) target[part] = {};
            target = target[part];
        }
        const leaf = parts[parts.length - 1];
        if (target[leaf] === undefined) target[leaf] = value;
        delete record[path];
    }
}

function arrayValue(value, type) {
    if (Array.isArray(value)) return value;
    if (value == null || value === "") return [];
    if (typeof value === "string") {
        const text = value.trim();
        if (!text) return [];
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) return parsed;
        } catch (err) {}
        if (type === "repeater" || type === "images") return [];
        return text.split(type === "tags" || type === "refs" ? /\s*,\s*/ : /\r?\n/).map((x) => x.trim()).filter(Boolean);
    }
    return typeof value === "object" ? Object.values(value) : [];
}

function normalizeSchemaFields(collection, record, fields = SCHEMAS[collection]?.flatMap((s) => s.fields) || []) {
    const getPath = (path) => path.split(".").reduce((value, part) => value?.[part], record);
    const setPath = (path, value) => {
        const parts = path.split(".");
        const leaf = parts.pop();
        const parent = parts.reduce((node, part) => {
            if (!node[part] || typeof node[part] !== "object" || Array.isArray(node[part])) node[part] = {};
            return node[part];
        }, record);
        parent[leaf] = value;
    };
    for (const field of fields) {
        const value = getPath(field.key);
        if (["tags", "list", "refs", "repeater", "images"].includes(field.type)) {
            const normalized = arrayValue(value, field.type);
            setPath(field.key, normalized);
            if (field.type === "repeater" && field.fields) {
                for (const item of normalized) if (item && typeof item === "object") normalizeSchemaFields(collection, item, field.fields);
            }
        }
    }
    return record;
}

function normalizeCollectionDoc(collection, doc) {
    const record = normalizeDoc(doc);
    return record ? normalizeSchemaFields(collection, record) : null;
}

function normalizeList(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    for (const key of ["items", "data", "docs", "documents", "results", "records"]) {
        if (Array.isArray(res[key])) return res[key];
    }
    for (const key of ["doc", "document", "record", "item"]) {
        if (res[key] && typeof res[key] === "object") return [res[key]];
    }
    return [];
}

function errorMessage(err, fallback) {
    if (!err) return fallback;
    if (typeof err === "string") return err;
    return err.message || err.error || err.detail || err.code || fallback;
}

function waitForSdk(timeout = SDK_TIMEOUT_MS) {
    return new Promise((resolve) => {
        if (typeof window === "undefined") return resolve(null);
        if (window.BreadClient) return resolve(window.BreadClient);
        // index.html sets this flag from the SDK <script> onerror handler.
        if (window.__afoSdkFailed) return resolve(null);
        const started = Date.now();
        const timer = setInterval(() => {
            if (window.BreadClient) {
                clearInterval(timer);
                resolve(window.BreadClient);
            } else if (window.__afoSdkFailed || Date.now() - started > timeout) {
                clearInterval(timer);
                resolve(null);
            }
        }, 120);
    });
}

export class RemoteDriver {
    constructor() {
        this.kind = "remote";
        this.client = null;
        this.sdkAvailable = false;
        this._collections = new Map();
        this.ready = false;
        // `reachable` is about the backend host, not about being signed in.
        // `me()` updates it so the shell can tell "logged out" apart from
        // "cloud unreachable" — the two look identical when a cookie is
        // blocked on iOS Safari.
        this.reachable = null;
        this.lastMeError = null;
        this.realtimeFailed = false;
        // Collections whose results had to be cut short. The store must not
        // treat a truncated list as the full truth and delete local copies.
        this.listTruncated = new Set();
    }

    async init() {
        const BreadClient = await waitForSdk();
        if (!BreadClient) {
            this.sdkAvailable = false;
            throw new Error(
                "The BreadBackend client could not be loaded. Check your network connection and reload the archive.",
            );
        }
        this.client = new BreadClient({
            baseUrl: BACKEND.baseUrl,
            projectSlug: BACKEND.projectSlug,
            apiKey: BACKEND.apiKey,
        });
        // Some SDK builds do not restore their own tokens on a fresh page
        // load, which makes every write 401 while reads with just the public
        // key still succeed. Re-attach the saved session defensively.
        try {
            if (typeof window !== "undefined" && !this.client.token) {
                this.client.token = window.localStorage.getItem(`bread_auth_${BACKEND.projectSlug}`) || null;
                this.client.refreshToken = window.localStorage.getItem(`bread_refresh_${BACKEND.projectSlug}`) || null;
            }
        } catch (err) {}
        this.sdkAvailable = true;
        this.ready = true;
        return this;
    }

    col(name) {
        if (!this._collections.has(name)) this._collections.set(name, this.client.collection(name));
        return this._collections.get(name);
    }

    /* The SDK stores the bearer token in localStorage but does not renew it.
       An expired token makes every POST/PATCH fail with 401 while GETs still
       work — the classic "everything is queued, nothing saves" symptom. */
    async _withRefresh(fn) {
        try {
            return await fn();
        } catch (err) {
            const status = Number(err?.status || err?.statusCode || 0);
            if (status !== 401 || typeof this.client?.auth?.refresh !== "function") throw err;
            let refreshed = null;
            try {
                refreshed = await this.client.auth.refresh();
            } catch (refreshErr) {
                throw err;
            }
            if (!refreshed?.token) throw err;
            return await fn();
        }
    }

    async login(email, password, { remember = true } = {}) {
        if (!this.client) throw new Error("Backend not initialised");
        try {
            await this.client.auth.login(String(email).trim().toLowerCase(), password, { remember });
            // Never fabricate a user from the typed email address. If the
            // session cannot be read back, the app would otherwise continue
            // with a half-authenticated user, pull whatever collections the
            // backend allows, and show "offline" while data trickles in.
            const verified = await this.me();
            if (!verified?.user) {
                throw new Error(
                    "Signed in, but this browser could not keep the session. On iPhone or iPad, allow cross-site tracking for this site (or disable content blockers) and try again.",
                );
            }
            return verified.user;
        } catch (err) {
            throw new Error(errorMessage(err, "Those credentials were not accepted."));
        }
    }

    async signup(email, password) {
        if (!this.client) throw new Error("Backend not initialised");
        try {
            return await this.client.auth.signup(String(email).trim().toLowerCase(), password);
        } catch (err) {
            throw new Error(errorMessage(err, "Could not create that account."));
        }
    }

    async me() {
        if (!this.client) return null;
        try {
            const res = await this._withRefresh(() => this.client.auth.me());
            this.reachable = true;
            this.lastMeError = null;
            // /auth/me has returned the profile directly, under `user`, and
            // under `data` in different SDK/backend versions.
            const user = res?.user || (res?.data && (res.data.user || res.data)) || res;
            const valid = user && typeof user === "object" && !Array.isArray(user) &&
                (user.email || user.id || user.uid || user._id || user.userId);
            return valid ? { user } : null;
        } catch (err) {
            const message = errorMessage(err, "");
            this.lastMeError = message;
            // A 401/403 still proves the backend answered; a fetch failure
            // means the device cannot reach it at all.
            this.reachable = !isNetworkFailure(err, message);
            if (!this.reachable) console.warn("[api] backend unreachable during session check", message);
            return null;
        }
    }

    async logout() {
        try {
            await this.client?.auth.logout();
        } catch (err) {
            /* session may already be gone */
        }
    }

    async forgotPassword(email) {
        return this.client.auth.forgotPassword(String(email).trim().toLowerCase());
    }

    async list(name) {
        // Two cross-device traps in the old single request:
        //   • `limit: 1000` silently truncated larger collections, so devices
        //     could legitimately see different subsets of the archive.
        //   • `orderBy: "createdAt"` makes Firestore-style backends omit any
        //     document that has no createdAt field.
        // Page through with an offset where the SDK supports it, and sort
        // locally instead. If offset is ignored, stop rather than looping.
        const PAGE = 500;
        const MAX_PAGES = 20;
        const out = [];
        const seen = new Set();
        let complete = false;
        let truncated = false;
        this.listTruncated.delete(name);
        for (let page = 0; page < MAX_PAGES; page++) {
            const opts = { limit: PAGE };
            if (page) opts.offset = page * PAGE;
            const res = await this._withRefresh(() => this.col(name).get(opts));
            const docs = normalizeList(res);
            let added = 0;
            for (const raw of docs) {
                const record = normalizeCollectionDoc(name, raw);
                if (!record) continue;
                const marker = String(record.id || record.key || "");
                if (marker && seen.has(marker)) continue;
                if (marker) seen.add(marker);
                out.push(record);
                added++;
            }
            const total =
                typeof res?.total === "number"
                    ? res.total
                    : typeof res?.pagination?.total === "number"
                      ? res.pagination.total
                      : null;
            if (docs.length < PAGE || (total !== null && out.length >= total) || res?.hasMore === false) {
                complete = true;
                break;
            }
            if (!added) {
                truncated = true;
                break;
            }
        }
        if (!complete) truncated = true;
        if (truncated) {
            this.listTruncated.add(name);
            console.warn(`[api] ${name} could not be fully paged; treating the result as partial.`);
        }
        out.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
        return out;
    }

    async create(name, doc) {
        const res = await this._withRefresh(() => this.col(name).create(doc));
        let normalized = normalizeCollectionDoc(name, res);
        if (!normalized?.id) {
            // Some backend versions answer a create with { ok: true } and no
            // document. Don't throw (that would retry the create forever and
            // make duplicates) — look the record up by its stable app key.
            try {
                const rows = await this.list(name);
                const match = rows.find((r) => r.key === doc.key || r.key === doc.id);
                if (match?.id) normalized = { ...(normalized || doc), id: match.id };
            } catch (err) {
                console.warn("[api] could not verify create response for", name, err);
            }
        }
        // An empty id tells the store to drop this op from the queue and
        // reconcile from a pull, rather than leaving every edit "queued".
        return { ...(normalized || doc), id: String(normalized?.id || "") };
    }

    async update(name, id, patch) {
        const res = await this._withRefresh(() => this.col(name).update(id, patch));
        return normalizeCollectionDoc(name, res) || { id, ...patch };
    }

    async remove(name, id) {
        await this._withRefresh(() => this.col(name).delete(id));
    }

    async upload(file) {
        const res = await this._withRefresh(() => this.client.files.upload(file));
        const url = res?.fullUrl || res?.url || res?.file?.fullUrl || res?.data?.fullUrl;
        if (!url) throw new Error("Upload succeeded but no file URL was returned.");
        return { url };
    }

    subscribe(name, cb) {
        try {
            return this.col(name).subscribe((event) => {
                const rawDoc =
                    event?.doc || event?.document || event?.record ||
                    (event?.data?.id || event?.data?._id ? event.data : event);
                cb({
                    action: String(event?.action || event?.type || "update").toLowerCase(),
                    doc: normalizeCollectionDoc(name, rawDoc),
                    raw: rawDoc,
                });
            });
        } catch (err) {
            // Realtime sockets are commonly dropped/blocked on iOS. Record it
            // so the store knows it cannot rely on subscriptions alone.
            this.realtimeFailed = true;
            console.warn("[api] subscribe failed", name, err);
            return () => {};
        }
    }

    async track(event, props) {
        try {
            await this.client.analytics.logEvent(event, props);
        } catch (err) {
            /* analytics must never break the app */
        }
    }
}

/* Local driver — used only when the backend cannot be reached after a
   verified session exists on this device (explicit offline fallback). */
export class LocalDriver {
    constructor(namespace = "afo_sp_local") {
        this.kind = "local";
        this.ns = namespace;
        this.sdkAvailable = true;
        this.ready = true;
        this._subs = new Map();
    }

    _read() {
        try {
            return JSON.parse(localStorage.getItem(this.ns) || "{}");
        } catch (err) {
            return {};
        }
    }

    _write(db) {
        try {
            localStorage.setItem(this.ns, JSON.stringify(db));
        } catch (err) {
            console.error("local storage write failed", err);
            throw new Error("This device's local storage is full. Export a backup, then remove unused images.");
        }
    }

    async login() {
        return { email: "offline@local" };
    }
    async me() {
        return null;
    }
    async logout() {}

    async list(name) {
        const db = this._read();
        return (db[name] || []).map((d) => ({ ...d }));
    }

    async create(name, doc) {
        const db = this._read();
        const row = { ...doc, id: doc.id || "local_" + Math.random().toString(36).slice(2, 10) };
        db[name] = db[name] || [];
        db[name].push(row);
        this._write(db);
        this._emit(name, "create", row);
        return row;
    }

    async update(name, id, patch) {
        const db = this._read();
        db[name] = db[name] || [];
        const idx = db[name].findIndex((d) => d.id === id);
        if (idx === -1) {
            const row = { ...patch, id };
            db[name].push(row);
            this._write(db);
            return row;
        }
        db[name][idx] = { ...db[name][idx], ...patch, id };
        this._write(db);
        this._emit(name, "update", db[name][idx]);
        return db[name][idx];
    }

    async remove(name, id) {
        const db = this._read();
        db[name] = (db[name] || []).filter((d) => d.id !== id);
        this._write(db);
        this._emit(name, "delete", { id });
    }

    async upload(file) {
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        return { url: dataUrl };
    }

    subscribe(name, cb) {
        if (!this._subs.has(name)) this._subs.set(name, new Set());
        this._subs.get(name).add(cb);
        return () => this._subs.get(name)?.delete(cb);
    }

    _emit(name, action, doc) {
        this._subs.get(name)?.forEach((cb) => cb({ action, doc }));
    }

    async track() {}
}

export async function createRemoteDriver() {
    const driver = new RemoteDriver();
    await driver.init();
    return driver;
}
