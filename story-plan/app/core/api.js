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

export const BACKEND = {
    baseUrl: "https://kaidaz18.duckdns.org",
    projectSlug: "allforone-story-plan",
    apiKey: "pk_live_WSjs9Lo5AzuzTyfAzP9vUZPE",
};

const SDK_TIMEOUT_MS = 15000;

export function normalizeDoc(doc) {
    if (!doc || typeof doc !== "object") return null;
    const out = { ...doc };
    out.id = String(doc.id || doc._id || doc.documentId || doc.uid || "");
    if (!out.id) return null;
    for (const key of ["createdAt", "updatedAt"]) {
        const v = out[key];
        if (v && typeof v === "object") {
            const secs = v._seconds ?? v.seconds ?? v.sec;
            if (typeof secs === "number") out[key] = new Date(secs * 1000).toISOString();
        }
    }
    return out;
}

function normalizeList(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    for (const key of ["items", "data", "docs", "documents", "results", "records"]) {
        if (Array.isArray(res[key])) return res[key];
    }
    if (res.doc) return [res.doc];
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
        const started = Date.now();
        const timer = setInterval(() => {
            if (window.BreadClient) {
                clearInterval(timer);
                resolve(window.BreadClient);
            } else if (Date.now() - started > timeout) {
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
        this.sdkAvailable = true;
        this.ready = true;
        return this;
    }

    col(name) {
        if (!this._collections.has(name)) this._collections.set(name, this.client.collection(name));
        return this._collections.get(name);
    }

    async login(email, password) {
        if (!this.client) throw new Error("Backend not initialised");
        try {
            const res = await this.client.auth.login(String(email).trim().toLowerCase(), password);
            return res?.user || (await this.me())?.user || { email };
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
            const res = await this.client.auth.me();
            return res?.user ? res : null;
        } catch (err) {
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
        const results = await this.col(name).get({ limit: 1000, orderBy: "createdAt", order: "asc" });
        return normalizeList(results)
            .map(normalizeDoc)
            .filter(Boolean);
    }

    async create(name, doc) {
        const res = await this.col(name).create(doc);
        const normalized = normalizeDoc(res?.doc || res?.data || res);
        return normalized || { ...doc };
    }

    async update(name, id, patch) {
        const res = await this.col(name).update(id, patch);
        return normalizeDoc(res?.doc || res?.data || res) || { id, ...patch };
    }

    async remove(name, id) {
        await this.col(name).delete(id);
    }

    async upload(file) {
        const res = await this.client.files.upload(file);
        const url = res?.fullUrl || res?.url || res?.file?.fullUrl || res?.data?.fullUrl;
        if (!url) throw new Error("Upload succeeded but no file URL was returned.");
        return { url };
    }

    subscribe(name, cb) {
        try {
            return this.col(name).subscribe((event) => {
                cb({ action: event?.action || event?.type || "update", doc: normalizeDoc(event?.doc || event?.data) });
            });
        } catch (err) {
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
