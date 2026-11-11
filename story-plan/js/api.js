/* AllForOne Story Planner — BreadBackend data layer.
 *
 * Everything here goes through the officially supplied SDK
 * (https://kaidaz18.duckdns.org/sdk/bread-client.js). Only documented methods
 * are used:
 *   bread.auth.{signup,login,me,refresh,logout,forgotPassword,resetPassword,
 *               listSessions,revokeSession,revokeOtherSessions}
 * (Email verification is intentionally NOT wrapped: accounts are admitted by an
 * operator-created `members` record, never by self-service verification.)
 *   bread.collection(name).{get,getById,create,update,delete,subscribe}
 *   bread.files.upload
 *   bread.analytics.logEvent
 *
 * The SDK's documented query support is `get({limit, orderBy, order})` only —
 * there is no `where` filter, so filtering/sorting happens client-side over
 * fetched documents (see store.js). This module also normalises response
 * envelopes so the app is not coupled to one undocumented shape.
 */

const BASE_URL = "https://kaidaz18.duckdns.org";
const PROJECT_SLUG = "allforone-story-planner";
const API_KEY = "pk_live_jmJGifgRjFF34yCOwvGRAAKI";

export const COLLECTIONS = {
    seasons: "seasons",
    chapters: "chapters",
    arcs: "story_arcs",
    threads: "story_threads",
    events: "events",
    characters: "characters",
    relationships: "character_relationships",
    lore: "lore",
    factions: "factions",
    factionRelationships: "faction_relationships",
    locations: "locations",
    storyboards: "storyboards",
    scenes: "storyboard_scenes",
    notes: "notes",
    diagrams: "diagrams",
    settings: "planner_settings",
    members: "members",
    history: "change_history",
};

/* Mirrors the shipped SDK, used only as a fallback if the <script> tag is
   blocked (e.g. offline preview). Not a modified copy of the guide — it is the
   same class, kept so the page fails gracefully instead of throwing. */
function FallbackBreadClient({ baseUrl, projectSlug, apiKey }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.projectSlug = projectSlug;
    this.apiKey = apiKey;
    this.token = localStorage.getItem(`bread_auth_${projectSlug}`);
    this.refreshToken = localStorage.getItem(`bread_refresh_${projectSlug}`);
    const self = this;
    const request = async (method, path, body) => {
        const headers = { "Content-Type": "application/json", "x-api-key": self.apiKey };
        if (self.token) headers.Authorization = `Bearer ${self.token}`;
        const res = await fetch(`${self.baseUrl}/api/v1/${self.projectSlug}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign({ status: res.status }, data);
        return data;
    };
    this._request = request;
    this._setTokens = (token, refresh) => {
        self.token = token;
        self.refreshToken = refresh;
        localStorage.setItem(`bread_auth_${projectSlug}`, token);
        if (refresh) localStorage.setItem(`bread_refresh_${projectSlug}`, refresh);
    };
    this.auth = {
        signup: (email, password) => request("POST", "/auth/signup", { email, password }),
        login: async (email, password) => {
            const res = await request("POST", "/auth/login", { email, password });
            if (res.token) self._setTokens(res.token, res.refreshToken);
            return res;
        },
        me: () => request("GET", "/auth/me"),
        refresh: async () => {
            const res = await request("POST", "/auth/refresh", { refreshToken: self.refreshToken });
            if (res.token) self._setTokens(res.token, res.refreshToken);
            return res;
        },
        logout: () => {
            self.token = null;
            self.refreshToken = null;
            localStorage.removeItem(`bread_auth_${projectSlug}`);
            localStorage.removeItem(`bread_refresh_${projectSlug}`);
        },
        forgotPassword: (email) => request("POST", "/auth/forgot-password", { email }),
        resetPassword: (token, newPassword) => request("POST", "/auth/reset-password", { token, newPassword }),
        verifyEmail: (token) => request("POST", "/auth/verify-email", { token }),
        resendVerification: (email) => request("POST", "/auth/resend-verification", { email }),
        listSessions: () => request("GET", "/auth/sessions"),
        revokeSession: (sessionId) => request("DELETE", "/auth/sessions", { sessionId }),
        revokeOtherSessions: () =>
            request("DELETE", "/auth/sessions", { revokeAllOthers: true, currentRefreshToken: self.refreshToken }),
    };
    this.collection = (name) => ({
        get: (params = {}) => {
            const q = new URLSearchParams(params).toString();
            return request("GET", `/collections/${name}${q ? "?" + q : ""}`);
        },
        getById: (id) => request("GET", `/collections/${name}/${id}`),
        create: (data, id) => request("POST", `/collections/${name}`, { id, data }),
        update: (id, data) => request("PATCH", `/collections/${name}/${id}`, { data }),
        put: (id, data) => request("PUT", `/collections/${name}/${id}`, { data }),
        delete: (id) => request("DELETE", `/collections/${name}/${id}`),
        subscribe: () => () => {},
    });
    this.files = {
        upload: async (file) => {
            const fd = new FormData();
            fd.append("file", file);
            const headers = { "x-api-key": self.apiKey };
            if (self.token) headers.Authorization = `Bearer ${self.token}`;
            const res = await fetch(`${self.baseUrl}/api/v1/${self.projectSlug}/files/upload`, {
                method: "POST",
                headers,
                body: fd,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw Object.assign({ status: res.status }, data);
            return data;
        },
    };
    this.analytics = { logEvent: (name, props) => request("POST", "/analytics/events", { name, props }) };
}

/* ------------------------------------------------------------------ client */

let client = null;

export function initClient() {
    if (client) return client;
    const Ctor = window.BreadClient || FallbackBreadClient;
    client = new Ctor({ baseUrl: BASE_URL, projectSlug: PROJECT_SLUG, apiKey: API_KEY });
    const tagPresent = Boolean(window.BreadClient);
    if (!tagPresent) console.warn("[story-plan] SDK script unavailable — using interface-compatible fallback.");
    return client;
}

export function getClient() {
    return client || initClient();
}

/* --------------------------------------------------------------- errors */

export class ApiError extends Error {
    constructor(message, { status = 0, code = "", cause = null, retryable = false } = {}) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
        this.cause = cause;
        this.retryable = retryable;
    }
}

const NETWORK_HINT =
    "Could not reach BreadBackend. Check your connection — your work is kept locally until the save succeeds.";

function friendly(err) {
    if (!err) return new ApiError("Something went wrong.");
    if (err instanceof ApiError) return err;

    const status = Number(err.status) || 0;
    const raw =
        (typeof err.message === "string" && err.message) ||
        (typeof err.error === "string" && err.error) ||
        (typeof err.detail === "string" && err.detail) ||
        "";
    const code = String(err.code || err.errorCode || "");

    if (status === 0) {
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        return new ApiError(isOffline ? "You are offline." : NETWORK_HINT, {
            status: 0,
            retryable: true,
            cause: err,
        });
    }
    if (status === 401) {
        return new ApiError(raw || "Your session has expired. Please sign in again.", {
            status,
            code: "unauthorized",
            cause: err,
        });
    }
    if (status === 403) {
        return new ApiError(
            raw || "The backend denied this request (403). Collection access is controlled by the BreadBackend project rules.",
            { status, code: "forbidden", cause: err }
        );
    }
    if (status === 404) {
        return new ApiError(raw || "Not found — the record or collection does not exist yet.", {
            status,
            code: "notfound",
            cause: err,
        });
    }
    if (status === 409) {
        return new ApiError(raw || "That record already exists (409).", { status, code: "conflict", cause: err });
    }
    if (status === 422 || status === 400) {
        return new ApiError(raw || "The backend rejected that data. Check the values and try again.", {
            status,
            code: "invalid",
            cause: err,
        });
    }
    if (status === 429) {
        return new ApiError(raw || "Too many requests — slow down for a moment and retry.", {
            status,
            retryable: true,
            cause: err,
        });
    }
    if (status >= 500) {
        return new ApiError(raw || "BreadBackend had a server error. Retrying usually helps.", {
            status,
            retryable: true,
            cause: err,
        });
    }
    return new ApiError(raw || "Request failed.", { status, code, cause: err });
}

/* ------------------------------------------------------------ normalising */

/** Unwrap `{documents:[…]}` / `{data:[…]}` / `{items:[…]}` / plain array. */
export function unwrapList(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    for (const key of ["documents", "docs", "items", "data", "results", "records"]) {
        if (Array.isArray(res[key])) return res[key];
    }
    return [];
}

/**
 * Flatten a stored document into `{ id, createdAt, updatedAt, ...fields }`.
 * BreadBackend may return `{ id, data:{…} }`; the UI should not care.
 */
export function normalizeDoc(doc) {
    if (!doc || typeof doc !== "object") return null;
    const id = doc.id ?? doc._id ?? doc.docId ?? doc.key ?? null;
    const payload = doc.data && typeof doc.data === "object" && !Array.isArray(doc.data) ? doc.data : null;
    const flat = payload ? { ...payload } : { ...doc };

    // metadata that must never leak into form fields
    delete flat.data;
    delete flat._id;
    if (payload) {
        for (const meta of ["id", "_id", "createdAt", "created_at", "updatedAt", "updated_at", "owner", "userId"]) {
            if (doc[meta] !== undefined && flat[meta] === undefined && meta !== "id") flat[meta] = doc[meta];
        }
    }
    return {
        ...flat,
        id: String(id ?? flat.id ?? ""),
        createdAt: flat.createdAt ?? flat.created_at ?? doc.createdAt ?? null,
        updatedAt: flat.updatedAt ?? flat.updated_at ?? doc.updatedAt ?? null,
    };
}

/* ------------------------------------------------------------- transport */

const RETRY_DELAYS = [600, 1600, 3600];

async function withRetry(fn, { attempts = 3 } = {}) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            const e = friendly(err);
            lastErr = e;
            if (!e.retryable || i === attempts - 1) throw e;
            await new Promise((r) => setTimeout(r, RETRY_DELAYS[i] || 4000));
        }
    }
    throw lastErr;
}

let refreshPromise = null;

/** Try a token refresh before giving up on a 401 (expired session). */
export async function tryRefresh() {
    const c = getClient();
    if (!c.refreshToken) return false;
    if (!refreshPromise) {
        refreshPromise = (async () => {
            try {
                await c.auth.refresh();
                return true;
            } catch (_) {
                return false;
            } finally {
                setTimeout(() => (refreshPromise = null), 0);
            }
        })();
    }
    return refreshPromise;
}

const unauthorizedHandlers = new Set();
export function onUnauthorized(fn) {
    unauthorizedHandlers.add(fn);
    return () => unauthorizedHandlers.delete(fn);
}

function fireUnauthorized() {
    for (const fn of unauthorizedHandlers) {
        try {
            fn();
        } catch (_) {}
    }
}

async function guarded(fn, { retry = true, allowRefresh = true } = {}) {
    const run = async () => {
        try {
            return await fn();
        } catch (err) {
            const e = friendly(err);
            if (e.status === 401 && allowRefresh && (await tryRefresh())) {
                return await fn();
            }
            if (e.status === 401) fireUnauthorized();
            throw e;
        }
    };
    return retry ? withRetry(run) : run();
}

/* ------------------------------------------------------------------- auth */

export const auth = {
    async login(email, password) {
        const c = getClient();
        return guarded(() => c.auth.login(email.trim(), password), { allowRefresh: false });
    },

    async signup(email, password) {
        const c = getClient();
        return guarded(() => c.auth.signup(email.trim(), password), { allowRefresh: false });
    },

    async me() {
        const c = getClient();
        const res = await guarded(() => c.auth.me(), { retry: false });
        const user = res?.user || res?.data?.user || res;
        return user && typeof user === "object" ? user : null;
    },

    async logout() {
        const c = getClient();
        try {
            await c.auth.logout();
        } catch (_) {
            /* local token clear is the important part */
        }
    },

    async forgotPassword(email) {
        const c = getClient();
        return guarded(() => c.auth.forgotPassword(email.trim()), { allowRefresh: false });
    },

    async resetPassword(token, newPassword) {
        const c = getClient();
        return guarded(() => c.auth.resetPassword(token.trim(), newPassword), { allowRefresh: false });
    },

    async listSessions() {
        const c = getClient();
        const res = await guarded(() => c.auth.listSessions());
        return Array.isArray(res?.sessions) ? res.sessions : unwrapList(res);
    },

    async revokeSession(id) {
        const c = getClient();
        return guarded(() => c.auth.revokeSession(id));
    },

    async revokeOtherSessions() {
        const c = getClient();
        return guarded(() => c.auth.revokeOtherSessions());
    },

    hasToken() {
        const c = getClient();
        return Boolean(c && c.token);
    },
};

/* -------------------------------------------------------------- collections */

export const db = {
    /**
     * Fetch a collection. BreadBackend exposes limit/orderBy/order; we pass them
     * through and also support explicit paging via `offset` when the backend
     * honours it, falling back to client-side slicing in store.js.
     */
    async list(name, params = {}) {
        const c = getClient();
        const query = {};
        if (params.limit) query.limit = params.limit;
        if (params.offset) query.offset = params.offset;
        if (params.orderBy) {
            query.orderBy = params.orderBy;
            query.order = params.order || "desc";
        }
        let res;
        try {
            res = await guarded(() => c.collection(name).get(query));
        } catch (err) {
            // Some deployments reject unknown query parameters. Retry plain.
            if (!Object.keys(query).length) throw err;
            res = await guarded(() => c.collection(name).get({}));
        }
        return unwrapList(res).map(normalizeDoc).filter(Boolean);
    },

    async get(name, id) {
        const c = getClient();
        const res = await guarded(() => c.collection(name).getById(id));
        const doc = res?.document || res?.doc || res?.data || res;
        return normalizeDoc(doc);
    },

    async create(name, data, id) {
        const c = getClient();
        const payload = { ...data };
        const res = await guarded(() => c.collection(name).create(payload, id || payload.id), { allowRefresh: true });
        const doc = normalizeDoc(res?.document || res?.doc || res?.data || res);
        return { ...(doc || payload), id: (doc && doc.id) || id || payload.id };
    },

    async update(name, id, data) {
        const c = getClient();
        const res = await guarded(() => c.collection(name).update(id, data));
        const doc = normalizeDoc(res?.document || res?.doc || res?.data || res);
        return doc || { ...data, id };
    },

    async remove(name, id) {
        const c = getClient();
        return guarded(() => c.collection(name).delete(id));
    },

    async upload(file) {
        const c = getClient();
        if (!c.files || typeof c.files.upload !== "function") {
            throw new ApiError("This BreadBackend SDK build does not expose file uploads.", { code: "unsupported" });
        }
        const res = await guarded(() => c.files.upload(file));
        const url = res?.fullUrl || res?.url || res?.secureUrl || res?.data?.fullUrl || res?.data?.url;
        if (!url) throw new ApiError("Upload finished but no file URL was returned.");
        return { url, raw: res };
    },

    /** Realtime subscription; silently no-ops when the backend does not stream. */
    subscribe(name, handler) {
        try {
            const c = getClient();
            const fn = c.collection(name).subscribe((event) => handler(event));
            return typeof fn === "function" ? fn : () => {};
        } catch (err) {
            console.warn(`[story-plan] realtime unavailable for ${name}`, err?.message || err);
            return () => {};
        }
    },
};

export function logEvent(name, props) {
    try {
        const c = getClient();
        if (c?.analytics?.logEvent) c.analytics.logEvent(name, props).catch(() => {});
    } catch (_) {
        /* analytics must never break the app */
    }
}
