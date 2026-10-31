/* =========================================================================
   AllForOne Story Plan — application shell, routing and session handling
   ========================================================================= */

import { store, state, COLLECTIONS } from "./core/store.js";
import { createRemoteDriver, LocalDriver } from "./core/api.js";
import { renderAuth, renderAccessDenied, renderBackendError } from "./core/auth.js";
import { buildDemo } from "./core/demo.js";
import { icon } from "./core/icons.js";
import { $, $$, esc, bus, parseHash, navigate, timeAgo, avatarHtml, fmtDate, debounce } from "./core/util.js";
import { toast, openDrawer, openEntityForm, confirmDialog } from "./components/ui.js";
import { openSearch, openQuickCreate, openActivityPanel } from "./components/search.js";

import * as dashboard from "./views/dashboard.js";
import * as storyMap from "./views/map.js";
import * as timeline from "./views/timeline.js";
import * as characters from "./views/characters.js";
import * as storylines from "./views/storylines.js";
import * as relationships from "./views/relationships.js";
import * as events from "./views/events.js";
import * as factions from "./views/factions.js";
import * as secrets from "./views/secrets.js";
import * as locations from "./views/locations.js";
import * as items from "./views/items.js";
import * as analytics from "./views/analytics.js";
import * as settings from "./views/settings.js";

const PAGES = {
    overview: { mod: dashboard, eyebrow: "Situation report", title: "Overview", nav: "/overview" },
    map: { mod: storyMap, eyebrow: "Visual archive", title: "Story Map", nav: "/map" },
    timeline: { mod: timeline, eyebrow: "Chronology", title: "Timeline", nav: "/timeline" },
    characters: { mod: characters, eyebrow: "Who they are", title: "Characters", nav: "/characters" },
    storylines: { mod: storylines, eyebrow: "Arcs in motion", title: "Storylines", nav: "/storylines" },
    relationships: { mod: relationships, eyebrow: "Who is connected", title: "Relationships", nav: "/relationships" },
    events: { mod: events, eyebrow: "What happened", title: "Events", nav: "/events" },
    factions: { mod: factions, eyebrow: "Powers & alliances", title: "Factions", nav: "/factions" },
    secrets: { mod: secrets, eyebrow: "What is hidden", title: "Secrets & Mysteries", nav: "/secrets" },
    locations: { mod: locations, eyebrow: "The world", title: "Locations", nav: "/locations" },
    items: { mod: items, eyebrow: "Objects of power", title: "Items", nav: "/items" },
    analytics: { mod: analytics, eyebrow: "Derived from the archive", title: "Analytics", nav: "/analytics" },
    settings: { mod: settings, eyebrow: "Archive configuration", title: "Settings", nav: "/settings" },
};

const NAV = [
    {
        group: "Overview",
        items: [
            { path: "/overview", label: "Dashboard", icon: "overview" },
            { path: "/map", label: "Story Map", icon: "map", badge: "canvas" },
            { path: "/timeline", label: "Timeline", icon: "timeline" },
        ],
    },
    {
        group: "The story",
        items: [
            { path: "/characters", label: "Characters", icon: "characters", count: "characters" },
            { path: "/storylines", label: "Storylines", icon: "storylines", count: "storylines" },
            { path: "/relationships", label: "Relationships", icon: "relationships", count: "relationships" },
            { path: "/events", label: "Events", icon: "events", count: "events" },
        ],
    },
    {
        group: "The world",
        items: [
            { path: "/factions", label: "Factions", icon: "factions", count: "factions" },
            { path: "/secrets", label: "Secrets & Mysteries", icon: "secrets", count: "secretsMixed" },
            { path: "/locations", label: "Locations", icon: "locations", count: "locations" },
            { path: "/items", label: "Items", icon: "items", count: "items" },
        ],
    },
    {
        group: "System",
        items: [
            { path: "/analytics", label: "Analytics", icon: "analytics" },
            { path: "/settings", label: "Settings", icon: "settings" },
        ],
    },
];

let driver = null;
let bootStarted = false;
let currentCleanup = null;
let lastActivitySeen = Number(localStorage.getItem("afo_sp_activity_seen") || 0);
let syncBound = false;

/* -------------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------------- */
async function boot() {
    // Module scripts can run after parsing but before DOMContentLoaded; guard
    // both startup paths so they cannot initialize the app twice.
    if (bootStarted) return;
    bootStarted = true;
    const bootEl = document.getElementById("boot");
    const authEl = document.getElementById("auth-root");

    try {
        driver = await createRemoteDriver();
    } catch (err) {
        console.warn("[boot]", err);
        bootEl.classList.add("gone");
        const verified = localStorage.getItem("afo_sp_verified_session");
        if (verified && !navigator.onLine) {
            showAuth(authEl, { allowOffline: true, error: err.message });
        } else {
            renderBackendError(authEl, { message: err.message });
        }
        return;
    }

    try {
        const session = await driver.me();
        if (session?.user) {
            bootEl.querySelector(".boot-sub").textContent = "Restoring your session…";
            const ok = await afterAuth(session.user, { silent: true });
            if (!ok) return;
        } else {
            bootEl.classList.add("gone");
            showAuth(authEl);
        }
    } catch (err) {
        console.warn("[boot] session restore failed", err);
        bootEl.classList.add("gone");
        showAuth(authEl, { error: "Could not restore the previous session. Sign in again." });
    }
}

function showAuth(authEl, opts = {}) {
    authEl.hidden = false;
    document.getElementById("app").hidden = true;
    renderAuth(authEl, {
        error: opts.error || "",
        notice: opts.notice || "",
        allowOffline: Boolean(opts.allowOffline),
        onLogin: async (email, password) => {
            const user = await driver.login(email, password);
            const me = await driver.me();
            const finalUser = me?.user || user;
            const ok = await afterAuth(finalUser);
            if (!ok) throw new Error("__denied__");
        },
        onOffline: () => startOfflineMode(authEl),
    });
}

function bootstrapDenied(authEl, email) {
    document.getElementById("app").hidden = true;
    renderAccessDenied(authEl, {
        email,
        onSignOut: async () => {
            await driver.logout();
            localStorage.removeItem("afo_sp_verified_session");
            clearLocalArchive();
            location.reload();
        },
        onRetry: () => location.reload(),
    });
}

async function afterAuth(user, { silent = false } = {}) {
    const authEl = document.getElementById("auth-root");
    state.user = user;
    localStorage.setItem("afo_sp_verified_session", JSON.stringify({ email: user?.email, at: Date.now() }));

    // Load data only after the session is verified.
    await store.boot({ driver, user });

    await store.loadAccess();
    if (store.state.accessSupported && !store.state.data.access.length) {
        await store.bootstrapAccess(user, { makeOwner: true });
        await store.loadAccess();
    }
    const approved =
        store.isApproved(user?.email) ||
        !store.state.accessSupported ||
        (store.state.data.access || []).some((a) => String(a.email || "").toLowerCase() === String(user?.email || "").toLowerCase() && a.active !== false);

    if (!approved) {
        localStorage.removeItem("afo_sp_verified_session");
        clearLocalArchive();
        bootstrapDenied(authEl, user?.email || "unknown");
        return false;
    }

    document.getElementById("boot").classList.add("gone");
    authEl.hidden = true;
    authEl.innerHTML = "";
    startApp();
    if (!silent) toast(`Signed in as ${user?.email || "approved user"}.`, "success", { timeout: 2600 });
    return true;
}

async function startOfflineMode(authEl) {
    const verified = localStorage.getItem("afo_sp_verified_session");
    if (!verified) return;
    driver = new LocalDriver();
    const parsed = JSON.parse(verified);
    const user = { email: parsed.email || "offline@device", isVerified: true, offline: true };
    await store.boot({ driver, user });
    state.accessSupported = false;
    authEl.hidden = true;
    authEl.innerHTML = "";
    startApp({ offline: true });
    toast("Offline mode — changes are stored on this device and will not sync.", "warn", { timeout: 6000 });
}

function clearLocalArchive() {
    try {
        localStorage.removeItem("afo_story_plan_cache_v2");
        localStorage.removeItem("afo_story_plan_queue_v2");
    } catch (err) {}
}

/* -------------------------------------------------------------------------
   App shell
   ------------------------------------------------------------------------- */
function startApp({ offline = false } = {}) {
    const app = document.getElementById("app");
    app.hidden = false;
    app.classList.toggle("collapsed", Boolean(store.prefs().sidebarCollapsed));
    renderSidebar();
    renderTopbar();
    bindShell();
    if (!syncBound) {
        bus.on("change", debounce(() => {
            renderSidebar();
            updateSyncChip();
        }, 180));
        bus.on("sync", updateSyncChip);
        bus.on("storage-error", () => toast("Local storage is full. Export a backup and remove large images.", "error", { timeout: 7000 }));
        syncBound = true;
    }
    if (offline) {
        const viewEl = document.getElementById("view");
        viewEl.insertAdjacentHTML(
            "afterbegin",
            `<div class="banner" style="margin:14px 22px 0"><span>${icon("cloudOff")}</span><div><b>Offline mode.</b> The backend could not be reached. This session reads and writes to this browser only; queued changes will not be sent.</div></div>`,
        );
    }
    if (!location.hash || location.hash === "#" || location.hash === "#/") {
        navigate("/overview", { replace: true });
    }
    window.addEventListener("hashchange", route);
    route();
    document.addEventListener("keydown", handleShortcuts);
    window.addEventListener("afo-forgot-password", async (e) => {
        const email = e.detail?.email;
        try {
            await driver.forgotPassword(email);
            toast(`Password reset instructions sent to ${email}.`, "success", { timeout: 6000 });
        } catch (err) {
            toast(err.message || "Could not send a reset email.", "error");
        }
    });
}

function countFor(key) {
    if (key === "secretsMixed") return store.all("mysteries").length + store.all("secrets").length;
    if (!key) return "";
    const n = store.all(key).length;
    return n || "";
}

function renderSidebar() {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;
    const activePath = "/" + (parseHash().segments[0] || "overview");
    sidebar.innerHTML = `
        <div class="sb-brand">
            <div class="sb-logo">${state.driverKind === "local" ? "L" : "A"}</div>
            <div class="sb-name">Archives<span>AllForOne SMP</span></div>
        </div>
        <div class="sb-scroll">
            ${NAV.map(
                (group) => `
                <div class="sb-group-label">${esc(group.group)}</div>
                ${group.items
                    .map((item) => {
                        const count = countFor(item.count);
                        const active = activePath === item.path;
                        return `<a class="sb-item ${active ? "active" : ""}" href="#${item.path}" title="${esc(item.label)}">
                            ${icon(item.icon)}<span class="sb-label">${esc(item.label)}</span>
                            ${count !== "" ? `<span class="count">${count}</span>` : item.badge ? `<span class="dot" style="background:var(--gold);box-shadow:0 0 8px rgba(215,184,120,.7)"></span>` : ""}
                        </a>`;
                    })
                    .join("")}`,
            ).join("")}
        </div>
        <div class="sb-foot">
            <button class="sb-collapse" data-collapse aria-label="Collapse sidebar">
                ${icon("panelLeft")}<span>Collapse</span>
            </button>
        </div>`;
    sidebar.querySelector("[data-collapse]")?.addEventListener("click", () => {
        const app = document.getElementById("app");
        app.classList.toggle("collapsed");
        store.setPref("sidebarCollapsed", app.classList.contains("collapsed"));
    });
}

function syncStateMeta() {
    const s = state.sync;
    if (state.driverKind === "local") return { icon: "cloudOff", label: "Local only", cls: "warn", title: "Offline local mode — data stays in this browser" };
    if (s.status === "offline") return { icon: "cloudOff", label: s.pending ? `${s.pending} unsynced` : "Offline", cls: "err", title: s.error || "Backend unreachable — retrying" };
    if (s.status === "syncing") return { icon: "refresh", label: "Saving…", cls: "", title: "Syncing with BreadBackend" };
    if (s.status === "online") return { icon: "cloud", label: "Synced", cls: "ok", title: `Last synced ${s.lastSync ? timeAgo(s.lastSync) : "just now"}` };
    return { icon: "database", label: "Ready", cls: "", title: "Archive ready" };
}

function renderTopbar() {
    const bar = document.getElementById("topbar");
    if (!bar) return;
    const user = state.user || {};
    const email = user.email || "Unknown user";
    const initials = email.slice(0, 2).toUpperCase();
    const meta = syncStateMeta();
    const unread = (state.data.activity || []).some((a) => new Date(a.createdAt || 0).getTime() > lastActivitySeen);
    bar.innerHTML = `
        <button class="icon-btn tb-menu-btn" data-menu aria-label="Open navigation">${icon("menu")}</button>
        <div class="tb-title">
            <div class="eyebrow" data-eyebrow>Archive</div>
            <h1 data-page-title>Overview</h1>
        </div>
        <button class="tb-search" data-open-search aria-label="Search the archive">
            <span class="s-icon">${icon("search")}</span>
            <span class="search-fake">Search characters, events, places…</span>
            <kbd>⌘K</kbd>
        </button>
        <div class="row gap-4 tb-actions">
            <button class="icon-btn ${meta.cls}" data-sync-chip title="${esc(meta.title)}">
                ${icon(meta.icon)}<span class="sync-label hide-sm">${esc(meta.label)}</span>
            </button>
            <button class="btn primary sm" data-quick-create>${icon("plus")} New</button>
            <button class="icon-btn ${unread ? "alert" : ""}" data-activity aria-label="Recent activity" title="Recent activity">${icon("bell")}</button>
            <button class="tb-user" data-user-menu aria-label="Account menu">
                <span class="avatar">${esc(initials)}</span>
                <span class="who"><b>${esc(user.email ? user.email.split("@")[0] : "Archivist")}</b>${esc(user.role || "Editor")}</span>
                ${icon("chevronDown")}
            </button>
        </div>`;
    document.querySelector(".search-fake")?.addEventListener("click", () => openSearch());
}

function updateSyncChip() {
    const btn = document.querySelector("[data-sync-chip]");
    if (!btn) return;
    const meta = syncStateMeta();
    btn.className = `icon-btn ${meta.cls}`;
    btn.title = meta.title;
    btn.innerHTML = `${icon(meta.icon)}<span class="sync-label hide-sm">${esc(meta.label)}</span>`;
}

function bindShell() {
    const topbar = document.getElementById("topbar");
    topbar.addEventListener("click", (e) => {
        if (e.target.closest("[data-open-search]")) {
            openSearch();
            return;
        }
        if (e.target.closest("[data-quick-create]")) {
            openQuickCreate(e.target.closest("[data-quick-create]"));
            return;
        }
        if (e.target.closest("[data-activity]")) {
            lastActivitySeen = Date.now();
            localStorage.setItem("afo_sp_activity_seen", String(lastActivitySeen));
            e.target.closest("[data-activity]")?.classList.remove("alert");
            const panel = openActivityPanel();
            openDrawer(panel);
            return;
        }
        if (e.target.closest("[data-sync-chip]")) {
            if (state.driverKind === "local") {
                toast("This session is offline-only. Sign in with the backend available to sync.", "warn");
                return;
            }
            store.retry();
            toast("Retrying sync…", "info", { timeout: 1800 });
            return;
        }
        if (e.target.closest("[data-user-menu]")) {
            const btn = e.target.closest("[data-user-menu]");
            const pop = document.createElement("div");
            import("./components/ui.js").then(({ openPopover }) => {
                openPopover(
                    btn,
                    `<div class="pop-label">${esc(state.user?.email || "")}</div>
                     <div class="pop-item" style="cursor:default"><span class="chip gold">${state.driverKind === "local" ? "Offline mode" : "Approved account"}</span></div>
                     <div class="pop-sep"></div>
                     <button class="pop-item" data-go-settings>${icon("settings")} Archive settings</button>
                     <button class="pop-item" data-go-analytics>${icon("analytics")} Analytics</button>
                     <div class="pop-sep"></div>
                     <button class="pop-item" data-export>${icon("download")} Export backup</button>
                     <button class="pop-item danger" data-signout>${icon("logout")} Sign out</button>`,
                    {
                        width: 240,
                        align: "right",
                        onMount: (node) => {
                            node.addEventListener("click", async (ev) => {
                                if (ev.target.closest("[data-go-settings]")) {
                                    import("./components/ui.js").then(({ closePopover }) => closePopover());
                                    navigate("/settings");
                                } else if (ev.target.closest("[data-go-analytics]")) {
                                    import("./components/ui.js").then(({ closePopover }) => closePopover());
                                    navigate("/analytics");
                                } else if (ev.target.closest("[data-export]")) {
                                    const data = JSON.stringify(store.exportData(), null, 2);
                                    const { downloadFile } = await import("./core/util.js");
                                    downloadFile(`afo-story-plan-${new Date().toISOString().slice(0, 10)}.json`, data);
                                    toast("Backup exported.", "success");
                                } else if (ev.target.closest("[data-signout]")) {
                                    confirmDialog({
                                        title: "Sign out?",
                                        message: "Your cached archive will be removed from this device. Anything already saved to BreadBackend stays there.",
                                        detail: state.sync.pending ? `You have ${state.sync.pending} unsynced change(s). They will be lost if you sign out now.` : "",
                                        confirmLabel: "Sign out",
                                        danger: false,
                                        onConfirm: async () => {
                                            await store.signOut();
                                            localStorage.removeItem("afo_sp_verified_session");
                                            clearLocalArchive();
                                            location.reload();
                                        },
                                    });
                                }
                            });
                        },
                    },
                );
            });
            return;
        }
        if (e.target.closest("[data-menu]")) {
            document.getElementById("app").classList.toggle("mobile-open");
        }
    });

    document.getElementById("app").addEventListener("click", (e) => {
        if (e.target.closest(".view") && document.getElementById("app").classList.contains("mobile-open")) {
            document.getElementById("app").classList.remove("mobile-open");
        }
    });
    window.addEventListener("hashchange", () => document.getElementById("app").classList.remove("mobile-open"));
}

function handleShortcuts(e) {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
        return;
    }
    if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        openSearch();
        return;
    }
    if (e.key.toLowerCase() === "n" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const btn = document.querySelector("[data-quick-create]");
        if (btn) openQuickCreate(btn);
    }
}

/* -------------------------------------------------------------------------
   Router
   ------------------------------------------------------------------------- */
function route() {
    const parsed = parseHash();
    const pageName = parsed.segments[0] || "overview";
    const page = PAGES[pageName];
    if (!page) {
        navigate("/overview", { replace: true });
        return;
    }
    const ctx = {
        params: { id: parsed.segments[1] ? decodeURIComponent(parsed.segments[1]) : null, sub: parsed.segments[2] || null },
        query: parsed.query,
        path: parsed.path,
        navigate,
        refresh: () => {
            const scroll = document.getElementById("view").scrollTop;
            route();
            document.getElementById("view").scrollTop = scroll;
        },
    };

    if (typeof currentCleanup === "function") {
        try {
            currentCleanup();
        } catch (err) {
            console.warn("[route cleanup]", err);
        }
    }
    currentCleanup = null;

    // Replace the view node on every route so per-view delegated listeners
    // from the previous screen cannot accumulate on the shared container.
    const previousView = document.getElementById("view");
    const viewEl = document.createElement("div");
    viewEl.id = "view";
    viewEl.className = previousView.className;
    viewEl.setAttribute("role", previousView.getAttribute("role") || "main");
    previousView.replaceWith(viewEl);
    const flush = Boolean(page.mod.flush);
    viewEl.classList.toggle("flush", flush);
    try {
        const html = page.mod.render(ctx);
        viewEl.innerHTML = html instanceof HTMLElement ? "" : html;
        if (html instanceof HTMLElement) viewEl.appendChild(html);
        const cleanup = page.mod.mount?.(viewEl, ctx);
        if (typeof cleanup === "function") currentCleanup = cleanup;
    } catch (err) {
        console.error("[view]", pageName, err);
        viewEl.innerHTML = `<div class="page"><div class="empty"><div class="eicon">${icon("alert")}</div><h4>This view could not be rendered</h4><p>${esc(err.message)}</p><button class="btn" onclick="location.reload()">Reload</button></div></div>`;
    }

    document.querySelectorAll(".sb-item").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${page.nav}`));
    const title = page.mod.heading?.(ctx) || page.title;
    const eyebrow = page.mod.eyebrow?.(ctx) || page.eyebrow;
    const t = document.querySelector("[data-page-title]");
    const e = document.querySelector("[data-eyebrow]");
    if (t) t.textContent = title;
    if (e) e.textContent = eyebrow;
    document.title = `${title} · Story Plan · AllForOne SMP`;
    if (!flush) viewEl.scrollTop = 0;
    else viewEl.scrollTop = 0;
}

/* -------------------------------------------------------------------------
   Global safety nets
   ------------------------------------------------------------------------- */
window.addEventListener("error", (e) => {
    if (e.message && !/ResizeObserver/.test(e.message)) console.error("[global]", e.message);
});
window.addEventListener("unhandledrejection", (e) => {
    console.error("[promise]", e.reason);
});

document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href^='#/']");
    if (a && a.target === "_blank") return;
});
document.addEventListener("DOMContentLoaded", boot);
if (document.readyState !== "loading") boot();

export { buildDemo };
