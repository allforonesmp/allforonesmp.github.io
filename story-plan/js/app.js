/* AllForOne SMP — Story Planner application shell. */

import { el, icon, clear, debounce } from "./util.js";
import { initClient, COLLECTIONS } from "./api.js";
import { ENTITIES } from "./schema.js";
import {
    state,
    prefs,
    savePrefs,
    loadCollection,
    loadCollections,
    onApiError,
    flushPending,
    docs,
    resetStore,
    subscribe as onStore,
    markTyped,
    enableRealtimeSync,
} from "./store.js";
import {startGate, signOut, getMember, isOwner} from "./auth.js";
import * as R from "./router.js";
import {toast, toastError, emptyState, loadingState, errorState, openModal, closeModal, confirmDialog} from "./components/ui.js";
import {isEditorOpen, closeEditor, createAndEdit} from "./components/editor.js";
import {entityDetail} from "./components/detail.js";

import {dashboardPage} from "./pages/dashboard.js";
import { storylinePage, arcsView, threadsView, chaptersView } from "./pages/storyline.js";
import { eventsPage, timelinePage } from "./pages/events.js";
import { charactersPage, comparePage, relationshipsPage } from "./pages/characters.js";
import { lorePage, loreWebPage } from "./pages/lore.js";
import {factionsPage, locationsPage} from "./pages/factions.js";
import { diagramsPage } from "./pages/diagrams.js";
import { storyboardsPage } from "./pages/storyboards.js";
import { notesPage } from "./pages/notes.js";
import { insightsPage } from "./pages/insights.js";
import { archivePage } from "./pages/archive.js";
import { settingsPage } from "./pages/settings.js";

const $ = (id) => document.getElementById(id);

/* -------------------------------------------------------------- navigation */

const NAV_GROUPS = [
    {
        label: "Overview",
        items: [
            { route: "dashboard", label: "Dashboard", icon: "dashboard" },
            { route: "insights", label: "Story Insights", icon: "sparkles" },
        ],
    },
    {
        label: "Narrative",
        items: [
            { route: "storyline", label: "Storyline", icon: "storyline" },
            { route: "timeline", label: "Timeline", icon: "timeline" },
            { route: "events", label: "Events", icon: "calendar" },
            { route: "arcs", label: "Chapters / Arcs", icon: "branch" },
        ],
    },
    {
        label: "World",
        items: [
            { route: "characters", label: "Characters", icon: "users" },
            { route: "relationships", label: "Relationships", icon: "link" },
            { route: "lore", label: "Lore Database", icon: "book" },
            { route: "locations", label: "Locations", icon: "mapPin" },
            { route: "factions", label: "Factions", icon: "flag" },
        ],
    },
    {
        label: "Craft",
        items: [
            { route: "diagrams", label: "Story Diagrams", icon: "share" },
            { route: "storyboards", label: "Storyboards", icon: "list" },
            { route: "notes", label: "Notes & Ideas", icon: "note" },
        ],
    },
    {
        label: "Manage",
        items: [
            { route: "archive", label: "Archive", icon: "archive" },
            { route: "settings", label: "Settings", icon: "settings" },
        ],
    },
];

let currentRoot = null;
let bootstrapped = false;

function disposeCurrent() {
    if (currentRoot) {
        try {
            currentRoot.dispatchEvent(new CustomEvent("planner:dispose"));
        } catch (_) {}
        currentRoot = null;
    }
    closeEditor();
}

function buildNav() {
    const nav = $("nav");
    clear(nav);
    NAV_GROUPS.forEach((group) => {
        nav.appendChild(el("div", { class: "nav-group-label", text: group.label }));
        group.items.forEach((item) => {
            const count = NAV_COUNTS[item.route];
            nav.appendChild(
                el("a", { class: "nav-item", href: `#/${item.route}`, dataset: { route: item.route }, title: item.label }, [
                    icon(item.icon),
                    el("span", { class: "nav-label", text: item.label }),
                    count != null ? el("span", { class: "nav-count", text: String(count) }) : null,
                ])
            );
        });
    });
    highlightNav();
}

const NAV_COUNTS = {};

function highlightNav() {
    const active = currentRouteName();
    document.querySelectorAll(".nav-item").forEach((a) => {
        a.classList.toggle("active", a.dataset.route === active);
    });
}

function currentRouteName() {
    const route = R.currentRoute();
    const base = route.name.split(":")[0];
    if (route.name.endsWith(":detail")) {
        const map = {
            events: "events",
            characters: "characters",
            lore: "lore",
            factions: "factions",
            locations: "locations",
            story_arcs: "arcs",
            story_threads: "storyline",
            seasons: "storyline",
            chapters: "arcs",
            storyboards: "storyboards",
            notes: "notes",
        };
        return map[route.collection] || "dashboard";
    }
    return base;
}

function updateNavCounts() {
    NAV_COUNTS.insights = null;
    NAV_COUNTS.events = docs("events").filter((d) => !d.archived).length;
    NAV_COUNTS.characters = docs("characters").filter((d) => !d.archived).length;
    NAV_COUNTS.lore = docs("lore").filter((d) => !d.archived).length;
    NAV_COUNTS.factions = docs("factions").filter((d) => !d.archived).length;
    NAV_COUNTS.locations = docs("locations").filter((d) => !d.archived).length;
    NAV_COUNTS.archive =
        ["seasons", "chapters", "story_arcs", "story_threads", "events", "characters", "lore", "factions", "locations", "storyboards", "notes"].reduce(
            (n, c) => n + docs(c).filter((d) => d.archived).length,
            0
        ) || null;
    document.querySelectorAll(".nav-item").forEach((a) => {
        const count = NAV_COUNTS[a.dataset.route];
        let badgeEl = a.querySelector(".nav-count");
        if (count == null) {
            if (badgeEl) badgeEl.remove();
            return;
        }
        if (!badgeEl) {
            badgeEl = el("span", { class: "nav-count" });
            a.appendChild(badgeEl);
        }
        badgeEl.textContent = String(count);
    });
}

/* ------------------------------------------------------------------ render */

const PAGES = {
    dashboard: () => dashboardPage(),
    storyline: (params) => storylinePage(params),
    timeline: (params) => timelinePage(params),
    events: (params) => eventsPage(params),
    characters: (params) => (params.get("compare") ? comparePage() : charactersPage(params)),
    relationships: (params) => relationshipsPage(params),
    lore: (params) => (params.get("web") ? loreWebPage() : lorePage(params)),
    factions: (params) => factionsPage(params),
    locations: (params) => locationsPage(params),
    arcs: (params) => arcsPage(params),
    diagrams: (params) => diagramsPage(params),
    storyboards: (params) => storyboardsPage(params),
    notes: (params) => notesPage(params),
    insights: () => insightsPage(),
    archive: () => archivePage(),
    settings: () => settingsPage(),
};

function arcsPage(params) {
    const root = el("div", { class: "page" });
    let tab = params.get("tab") || "arcs";
    root.appendChild(
        el("div", { class: "page-head" }, [
            el("div", {}, [
                el("h1", { text: "Chapters & arcs" }),
                el("p", { class: "lead", text: "Chapters group a season into movements. Arcs are the narrative sequences that may cut across them." }),
            ]),
            el("div", { class: "page-actions" }, [
                el("button", { class: "btn btn-ghost", type: "button", onclick: () => createAndEdit("chapters") }, [icon("book"), "New chapter"]),
                el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("story_arcs") }, [icon("plus"), "New arc"]),
            ]),
        ])
    );
    const tabs = el("div", { class: "tabs" });
    const body = el("div", {});
    const render = () => {
        tabs.innerHTML = "";
        body.innerHTML = "";
        [
            ["arcs", "Story arcs"],
            ["chapters", "Chapters"],
            ["threads", "Story threads"],
        ].forEach(([id, label]) => {
            tabs.appendChild(el("button", { type: "button", class: tab === id ? "active" : "", onclick: () => { tab = id; render(); } }, label));
        });
        if (tab === "arcs") body.appendChild(arcsView());
        else if (tab === "chapters") body.appendChild(chaptersView());
        else body.appendChild(threadsView());
    };
    render();
    root.append(tabs, body);
    return root;
}

let renderToken = 0;

async function renderRoute(route) {
    const workspace = $("workspace");
    const base = route.name.split(":")[0];
    const sectionLabel = R.ROUTES[base]?.label || (route.collection ? ENTITIES[route.collection]?.plural : "Dashboard");
    $("crumbSection").textContent = sectionLabel;
    highlightNav();

    disposeCurrent();
    if (document.body.classList.contains("drawer-open")) closeDrawer();

    const token = ++renderToken;
    let page;
    try {
        if (route.name.endsWith(":detail")) {
            page = entityDetail(route.collection, route.id);
        } else if (PAGES[base]) {
            page = PAGES[base](route.params || new URLSearchParams());
        } else {
            page = emptyState({ iconName: "info", title: "Page not found", message: "That section does not exist." });
        }
    } catch (err) {
        console.error("[story-plan] page render failed", err);
        page = el("div", { class: "page" }, [errorState(err, () => renderRoute(route))]);
    }
    if (token !== renderToken) return;

    clear(workspace);
    const pageEl = page instanceof HTMLElement ? page : el("div", { class: "page" }, [page]);
    workspace.appendChild(pageEl);
    currentRoot = pageEl;
    workspace.scrollTop = 0;

    const route2 = R.currentRoute();
    if (route2.name.endsWith(":detail")) {
        const doc = docs(route2.collection).find((d) => String(d.id) === String(route2.id));
        $("crumbSub").textContent = doc ? ENTITIES[route2.collection]?.title(doc) : "";
    } else {
        $("crumbSub").textContent = "";
    }
    updateNavCounts();
}

/* ------------------------------------------------------------------- boot */

function setSaveIndicator(nextState) {
    const node = $("saveState");
    const sidebar = $("sidebarSync");
    const label = { saved: "Saved", saving: "Saving…", error: "Save failed", dirty: "Unsaved" }[nextState] || "Saved";
    if (node) {
        node.dataset.state = nextState;
        node.querySelector(".save-label").textContent = label;
        node.title =
            nextState === "error"
                ? "Saving failed — your changes are kept and retried. Click to retry."
                : nextState === "dirty"
                ? "Unsaved changes — saving shortly."
                : "All changes stored in BreadBackend.";
    }
    if (sidebar) {
        sidebar.dataset.state = nextState;
        const text = sidebar.querySelector(".sync-text");
        if (text) text.textContent = { saved: "All changes saved", saving: "Saving…", error: "Save failed", dirty: "Unsaved changes" }[nextState] || "Idle";
    }
}

function closeDrawer() {
    document.body.classList.remove("drawer-open");
    $("scrim").hidden = true;
}
function openDrawer() {
    document.body.classList.add("drawer-open");
    $("scrim").hidden = false;
}

/* --------------------------------------------------------------- search UI */

let paletteEntry = null;

function openPalette() {
    if (paletteEntry) return;
    const input = el("input", { type: "search", placeholder: "Search events, characters, lore, factions, locations, arcs, threads, notes…", "aria-label": "Global search" });
    const results = el("div", { class: "palette-results" });
    let flat = [];
    let activeIndex = 0;

    const modalBody = el("div", { style: { display: "contents" } }, []);
    const wrap = el("div", { class: "modal palette" }, [
        el("div", { class: "palette-input" }, [icon("search"), input, el("kbd", { style: { fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--text-light)" }, text: "esc" })]),
        results,
        el("div", { class: "palette-foot" }, [
            el("span", {}, [el("kbd", { text: "↑↓" }), " navigate"]),
            el("span", {}, [el("kbd", { text: "↵" }), " open"]),
            el("span", {}, [el("kbd", { text: "esc" }), " close"]),
        ]),
    ]);
    const backdrop = el("div", { class: "modal-backdrop", style: { alignItems: "flex-start" } }, [wrap]);
    backdrop.addEventListener("mousedown", (e) => {
        if (e.target === backdrop) close();
    });
    $("modalRoot").appendChild(backdrop);
    document.body.style.overflow = "hidden";
    setTimeout(() => input.focus(), 60);

    function close() {
        backdrop.remove();
        paletteEntry = null;
        document.body.style.overflow = "";
    }
    paletteEntry = { close };

    function collect(term) {
        const q = term.trim().toLowerCase();
        const groups = [];
        if (!q) {
            // recent + quick links
            const recent = docs("events")
                .filter((d) => !d.archived && d.updatedAt)
                .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
                .slice(0, 5);
            if (recent.length) groups.push({ label: "Recently updated events", items: recent.map((d) => resultItem("events", d)) });
            groups.push({
                label: "Sections",
                items: R.ROUTES ? Object.entries(R.ROUTES).slice(0, 8).map(([key, def]) => ({ label: def.label, sub: "Go to section", iconName: "arrowRight", href: `#/${key}`, section: true })) : [],
            });
            return groups;
        }
        const collections = [
            ["events", "Events"],
            ["characters", "Characters"],
            ["lore", "Lore"],
            ["factions", "Factions"],
            ["locations", "Locations"],
            ["story_arcs", "Story arcs"],
            ["story_threads", "Story threads"],
            ["chapters", "Chapters"],
            ["notes", "Notes"],
            ["seasons", "Seasons"],
        ];
        for (const [collection, label] of collections) {
            const ent = ENTITIES[collection];
            const items = docs(collection)
                .filter((d) => {
                    if (d.archived) return false;
                    const fields = ent.search || ["title", "name"];
                    const hay = [...fields.map((f) => d[f]), d.code, d.username, ...(Array.isArray(d.tags) ? d.tags : [])]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();
                    return hay.includes(q);
                })
                .slice(0, 5)
                .map((d) => resultItem(collection, d, q));
            if (items.length) groups.push({ label, items });
        }
        return groups;
    }

    function resultItem(collection, doc, q) {
        const ent = ENTITIES[collection];
        return {
            label: ent.title(doc),
            sub: [ent.plural, doc.code, doc.status].filter(Boolean).join(" · "),
            iconName: ent.icon,
            accent: ent.color,
            href: R.detailPath(collection, doc.id),
            highlight: q,
        };
    }

    function render() {
        clear(results);
        const groups = collect(input.value);
        flat = [];
        if (!groups.length) {
            results.appendChild(el("div", { class: "picker-empty", text: `No results for “${input.value}”` }));
            return;
        }
        groups.forEach((group) => {
            results.appendChild(el("div", { class: "sr-group-label", text: group.label }));
            group.items.forEach((item) => {
                const idx = flat.length;
                flat.push(item);
                const node = el("a", { class: `sr-item${idx === activeIndex ? " hl" : ""}`, href: item.href }, [
                    el("span", { class: "ref-ico", style: item.accent ? { color: item.accent } : {} }, icon(item.iconName || "file")),
                    el("span", { class: "sr-main" }, [
                        el("span", { class: "sr-title", html: highlightText(item.label, item.highlight) }),
                        item.sub ? el("span", { class: "sr-sub", text: item.sub }) : null,
                    ]),
                ]);
                results.appendChild(node);
            });
        });
    }

    input.addEventListener("input", debounce(() => { activeIndex = 0; render(); }, 90));
    input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            activeIndex = Math.min(flat.length - 1, activeIndex + 1);
            render();
            scrollActive();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            activeIndex = Math.max(0, activeIndex - 1);
            render();
            scrollActive();
        } else if (e.key === "Enter") {
            e.preventDefault();
            const item = flat[activeIndex];
            if (item) {
                close();
                R.navigate(item.href.replace(/^#/, ""));
            }
        }
    });
    document.addEventListener("keydown", escClose);
    function escClose(e) {
        if (e.key === "Escape") {
            close();
            document.removeEventListener("keydown", escClose);
        }
    }
    function scrollActive() {
        const node = results.querySelectorAll(".sr-item")[activeIndex];
        if (node) node.scrollIntoView({ block: "nearest" });
    }

    render();
}

function highlightText(text, term) {
    const safe = String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    if (!term) return safe;
    const idx = safe.toLowerCase().indexOf(term.toLowerCase());
    if (idx < 0) return safe;
    return `${safe.slice(0, idx)}<mark>${safe.slice(idx, idx + term.length)}</mark>${safe.slice(idx + term.length)}`;
}

/* ------------------------------------------------------------------ shell */

function wireShell() {
    $("menuBtn").addEventListener("click", () => {
        if (window.innerWidth <= 1000) openDrawer();
        else {
            document.body.classList.toggle("sidebar-collapsed");
            savePrefs({ sidebarCollapsed: document.body.classList.contains("sidebar-collapsed") });
        }
    });
    $("sidebarClose").addEventListener("click", closeDrawer);
    $("scrim").addEventListener("click", closeDrawer);

    $("searchTrigger").addEventListener("click", openPalette);
    document.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            openPalette();
        }
        if (e.key === "Escape") {
            if (paletteEntry) paletteEntry.close();
            if (isEditorOpen()) closeEditor();
        }
    });

    const profileBtn = $("profileBtn");
    const menu = $("profileMenu");
    profileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = !menu.hidden;
        menu.hidden = open;
        profileBtn.setAttribute("aria-expanded", String(!open));
    });
    document.addEventListener("click", (e) => {
        if (!menu.hidden && !e.target.closest("#profile")) menu.hidden = true;
    });
    menu.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-menu]");
        if (!btn) return;
        menu.hidden = true;
        const action = btn.dataset.menu;
        if (action === "settings") R.navigate("#/settings");
        if (action === "sessions") {
            R.navigate("#/settings");
            setTimeout(() => {
                const node = Array.from(document.querySelectorAll(".card-head h2")).find((h) => /sessions/i.test(h.textContent));
                if (node) node.closest(".card").scrollIntoView({ behavior: "smooth", block: "center" });
            }, 250);
        }
        if (action === "theme") {
            const current = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
            window.__setTheme(current);
            savePrefs({ theme: current });
        }
        if (action === "export") {
            R.navigate("#/settings");
            setTimeout(() => {
                const node = Array.from(document.querySelectorAll(".card-head h2")).find((h) => /export/i.test(h.textContent));
                if (node) node.closest(".card").scrollIntoView({ behavior: "smooth", block: "center" });
            }, 250);
        }
        if (action === "logout") {
            const ok = await confirmDialog({ title: "Sign out?", message: "Any unsaved edits will be flushed first.", confirmLabel: "Sign out" });
            if (!ok) return;
            try {
                await flushPending();
            } catch (_) {}
            await signOut();
            resetStore();
            $("gate").hidden = false;
        }
    });

    $("saveState").addEventListener("click", async () => {
        if (state.saveState === "error" || state.pending.size) {
            const res = await flushPending();
            if (res.failed) toast(`${res.failed} change(s) still failing.`, "error");
            else toast("All changes saved.", "success", 1800);
        } else {
            toast("Everything is saved to BreadBackend.", "info", 1800);
        }
    });

    $("activityBtn").addEventListener("click", () => {
        const modal = openModal({
            title: "Recent activity",
            body: el(
                "div",
                {},
                [
                    el("p", { class: "field-hint", style: { marginBottom: "0.6rem" }, text: "Changes made in this session, newest first." }),
                    ...(state.log.length
                        ? state.log.slice(0, 25).map((entry) =>
                              el("div", { class: "history-item" }, [
                                  el("span", { class: "hi-dot" }),
                                  el("div", { class: "hi-main" }, [
                                      el("strong", { style: { fontSize: "0.85rem" }, text: `${entry.kind === "create" ? "Created" : entry.kind === "delete" ? "Deleted" : "Updated"} ${entry.title || "a record"}` }),
                                      el("div", { class: "hi-when", text: `${new Date(entry.at).toLocaleTimeString()} · ${entry.collection}` }),
                                  ]),
                              ])
                          )
                        : [el("p", { class: "field-hint", text: "No changes yet this session." })]),
                ]
            ),
            footer: [el("button", { class: "btn btn-ghost", type: "button", onclick: () => closeModal(modal) }, "Close")],
        });
    });

    window.addEventListener("beforeunload", (e) => {
        if (state.pending.size) {
            e.preventDefault();
            e.returnValue = "";
        }
    });
    window.addEventListener("offline", () => {
        saveIndicatorOffline(true);
    });
    window.addEventListener("online", () => {
        saveIndicatorOffline(false);
        flushPending().catch(() => {});
    });
}

function saveIndicatorOffline(offline) {
    const sidebar = $("sidebarSync");
    if (offline && sidebar) {
        sidebar.dataset.state = "offline";
        sidebar.querySelector(".sync-text").textContent = "Offline — changes kept locally";
    } else {
        setSaveIndicator(state.saveState);
    }
}

/* ------------------------------------------------------------ data loading */

async function loadInitialData() {
    const workspace = $("workspace");
    workspace.innerHTML = "";
    workspace.appendChild(el("div", { class: "page" }, [loadingState("Loading your story database…")]));
    await loadCollections(Object.keys(ENTITIES));
    // Heavy/rarely-needed collections load on demand (see ensureCollection calls
    // from the storyboards page and the detail History tab) so first paint stays
    // fast as the database grows.
    await Promise.allSettled([
        loadCollection(COLLECTIONS.diagrams),
        loadCollection(COLLECTIONS.members),
        loadCollection(COLLECTIONS.settings),
        loadCollection(COLLECTIONS.scenes),
    ]);
    startRealtime();
    updateNavCounts();
}

let realtimeTeardown = [];

/** Realtime: the SDK exposes an SSE subscription. Remote changes refresh the
 *  affected collection; pending local patches are re-applied on top, so a
 *  colleague's edit can never clobber unsaved work here. */
function startRealtime() {
    if (prefs.realtime === false) return;
    realtimeTeardown = enableRealtimeSync({
        onRemoteChange: (collection) => {
            if (!collection) return;
            const page = R.currentRoute();
            const visible = page.name.split(":")[0] === collection || page.collection === collection;
            if (!visible) return;
            toast("Another storyteller updated this section — refreshing.", "info", 2600);
        },
    });
}

async function boot() {
    initClient();
    wireShell();

    document.body.classList.toggle("sidebar-collapsed", Boolean(prefs.sidebarCollapsed));
    setSaveIndicator("saved");

    await startGate(async (user) => {
        if (bootstrapped) return;
        bootstrapped = true;
        $("app").hidden = false;
        $("gate").hidden = true;

        const email = user?.email || "";
        $("profileEmail").textContent = email || "—";
        $("profileRole").textContent = isOwner() ? "Owner" : getMember()?.role || "Member";
        $("avatar").textContent = (email || "A").slice(0, 1).toUpperCase();
        $("sidebarUser").innerHTML = "";
        $("sidebarUser").append(el("span", { class: "avatar", style: { width: "24px", height: "24px", fontSize: "0.7rem" }, text: (email || "A").slice(0, 1).toUpperCase() }), el("span", { text: email }));
        $("nav").innerHTML = "";
        buildNav();

        onStore((ev) => {
            if (ev.type === "savestate") setSaveIndicator(ev.state);
            if (ev.type === "activity") {
                const dot = $("activityDot");
                if (dot) dot.hidden = false;
                clearTimeout(window.__activityTimer);
                window.__activityTimer = setTimeout(() => dot && (dot.hidden = true), 6000);
            }
            if (ev.type === "loaded" || ev.type === "changed") updateNavCounts();
        });

        onApiError((err, context) => {
            if (err?.status === 401) return; // handled by the gate
            if (err?.status === 403) {
                toast(`${context || "Request"} blocked: the BreadBackend project rules deny this collection.`, "error", 7000);
                return;
            }
            if (err?.retryable) return; // save indicator already reflects this
            toastError(err, context);
        });

        await loadInitialData();
        R.start((route) => renderRoute(route));
    });
}

boot().catch((err) => {
    console.error("[story-plan] fatal boot error", err);
    const gate = $("gate");
    if (gate) {
        gate.hidden = false;
        ["Booting", "Login", "Signup", "Forgot", "Verify", "Denied"].forEach((p) => {
            const node = $(`gate${p}`);
            if (node) node.hidden = true;
        });
        const fatal = $("gateFatal");
        if (fatal) fatal.hidden = false;
        const copy = $("fatalCopy");
        if (copy) copy.textContent = err?.message || String(err);
    }
});

window.addEventListener("hashchange", () => {
    if (paletteEntry) paletteEntry.close();
});
