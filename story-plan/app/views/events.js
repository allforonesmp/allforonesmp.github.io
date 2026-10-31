/* Event archive */

import { store } from "../core/store.js";
import { icon } from "../core/icons.js";
import { esc, fmtDate, fmtDateShort, debounce, avatarHtml, truncate, parseDate } from "../core/util.js";
import { EVENT_CATEGORIES, CANON, IMPORTANCE, PHASES } from "../core/schema.js";
import { openQuickView } from "../components/details.js";
import { openEntityForm, toast, confirmDialog } from "../components/ui.js";
import {
    categoryMeta,
    categoryIcon,
    CATEGORY_COLORS,
    importanceBars,
    canonBadge,
    castChips,
    eventCard,
    emptyState,
} from "../components/cards.js";

export const flush = false;
let state = { query: "", category: "", character: "", faction: "", storyline: "", canon: "", importance: 0, from: "", to: "", sort: "newest", view: "list" };

export function heading() {
    return "Events";
}

export function render(ctx) {
    return `<div class="page events-page">
        <div class="page-head">
            <div>
                <div class="eyebrow">Historical records</div>
                <h2>Event archive</h2>
                <p>${store.all("events").length} recorded events and ${store.all("events").reduce((n, e) => n + (e.consequenceLinks || []).length, 0)} linked consequences. Every event ripples into the characters, factions and arcs attached to it.</p>
            </div>
            <div class="actions">
                <a class="btn" href="#/timeline">${icon("timeline")} Timeline view</a>
                <button class="btn primary" data-new-event>${icon("plus")} Record event</button>
            </div>
        </div>

        <div class="toolbar">
            <div class="filter-input">${icon("search")}<input data-ev-search placeholder="Search title, summary, cause, outcome…" value="${esc(state.query)}" /></div>
            <select class="filter-sel" data-ev-category><option value="">All categories</option>${EVENT_CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join("")}</select>
            <select class="filter-sel" data-ev-character><option value="">Any character</option>${store.all("characters").sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${c.key}">${c.name}</option>`).join("")}</select>
            <select class="filter-sel" data-ev-faction><option value="">Any faction</option>${store.all("factions").map((f) => `<option value="${f.key}">${f.name}</option>`).join("")}</select>
            <select class="filter-sel" data-ev-storyline><option value="">Any storyline</option>${store.all("storylines").map((s) => `<option value="${s.key}">${s.name}</option>`).join("")}</select>
            <select class="filter-sel" data-ev-canon><option value="">Any canon</option>${CANON.map((c) => `<option value="${c.value}">${c.label}</option>`).join("")}</select>
            <select class="filter-sel" data-ev-importance><option value="0">Any importance</option>${IMPORTANCE.map((i) => `<option value="${i.value}">${i.label}+</option>`).join("")}</select>
            <select class="filter-sel" data-ev-sort>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="importance">Most important</option>
            </select>
            <div class="segmented">
                <button class="seg ${state.view === "list" ? "active" : ""}" data-ev-view="list">${icon("list")}</button>
                <button class="seg ${state.view === "cards" ? "active" : ""}" data-ev-view="cards">${icon("grid")}</button>
            </div>
            <span class="result-count" data-ev-count></span>
        </div>

        <div class="date-range-row">
            <span class="tiny dim eyebrow plain">Date range</span>
            <input type="date" class="input sm" data-ev-from value="${esc(state.from)}" style="max-width:150px" />
            <span class="dim">→</span>
            <input type="date" class="input sm" data-ev-to value="${esc(state.to)}" style="max-width:150px" />
            <button class="btn sm ghost" data-ev-reset>${icon("refresh")} Reset filters</button>
            <span class="spacer"></span>
            <div class="ev-inline-legend">${EVENT_CATEGORIES.slice(0, 6).map((c) => `<span><i style="background:${CATEGORY_COLORS[c.value]}"></i>${c.label}</span>`).join("")}</div>
        </div>

        <div data-ev-results></div>
    </div>`;
}

export function mount(root, ctx) {
    const results = root.querySelector("[data-ev-results]");

    const applyDefaults = () => {
        root.querySelector("[data-ev-category]").value = state.category;
        root.querySelector("[data-ev-character]").value = state.character;
        root.querySelector("[data-ev-faction]").value = state.faction;
        root.querySelector("[data-ev-storyline]").value = state.storyline;
        root.querySelector("[data-ev-canon]").value = state.canon;
        root.querySelector("[data-ev-importance]").value = String(state.importance);
        root.querySelector("[data-ev-sort]").value = state.sort;
        root.querySelectorAll("[data-ev-view]").forEach((b) => b.classList.toggle("active", b.dataset.evView === state.view));
        root.querySelector("[data-ev-from]").value = state.from;
        root.querySelector("[data-ev-to]").value = state.to;
    };

    const filtered = () => {
        const q = state.query.trim().toLowerCase();
        let rows = store.all("events").filter((e) => {
            if (state.category && e.category !== state.category) return false;
            if (state.character && !(e.characterIds || []).includes(state.character)) return false;
            if (state.faction && !(e.factionIds || []).includes(state.faction)) return false;
            if (state.storyline && !(e.storylineIds || []).includes(state.storyline)) return false;
            if (state.canon && (e.canon || "confirmed") !== state.canon) return false;
            if (state.importance && Number(e.importance || 0) < Number(state.importance)) return false;
            if (state.from && (e.date || "") < state.from) return false;
            if (state.to && (e.date || "") > state.to) return false;
            if (q) {
                const hay = `${e.title} ${e.summary || ""} ${e.description || ""} ${e.cause || ""} ${e.outcome || ""} ${e.consequences || ""}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
        if (state.sort === "importance") rows.sort((a, b) => (b.importance || 0) - (a.importance || 0) || (b.date || "").localeCompare(a.date || ""));
        else if (state.sort === "oldest") rows.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        else rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        return rows;
    };

    const draw = () => {
        const rows = filtered();
        const count = root.querySelector("[data-ev-count]");
        if (count) count.textContent = `${rows.length} of ${store.all("events").length}`;
        applyDefaults();
        if (!rows.length) {
            results.innerHTML = emptyState({
                icon: "events",
                title: store.all("events").length ? "No events match" : "No events recorded",
                text: "Adjust the filters or record what happened.",
                action: `<button class="btn sm primary" data-new-event>${icon("plus")} Record event</button>`,
            });
            return;
        }
        if (state.view === "cards") {
            results.innerHTML = `<div class="event-card-grid">${rows.map((e) => eventCard(e)).join("")}</div>`;
            return;
        }
        const groups = new Map();
        for (const ev of rows) {
            const d = parseDate(ev.date);
            const key = d ? String(d.getFullYear()) : "Undated";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(ev);
        }
        const ordered = [...groups.entries()].sort((a, b) =>
            state.sort === "oldest" ? String(a[0]).localeCompare(String(b[0])) : String(b[0]).localeCompare(String(a[0])),
        );
        results.innerHTML = `<div class="event-archive">${ordered
            .map(
                ([year, list]) => `<div class="event-year-group">
                    <div class="event-year"><span class="display">${esc(year)}</span><span class="tiny dim">${list.length} event${list.length === 1 ? "" : "s"}</span></div>
                    <div class="event-rows">
                        ${list
                            .map(
                                (ev) => `<button class="event-row" data-view-event="${esc(ev.key)}">
                                    <span class="ev-date">
                                        <span class="mono">${esc(ev.date ? fmtDateShort(ev.date) : "—")}</span>
                                        <span class="ev-cat-dot" style="--cat:${CATEGORY_COLORS[ev.category] || "#999"}">${icon(categoryIcon(ev.category))}</span>
                                    </span>
                                    <span class="ev-main">
                                        <span class="row wrap gap-6"><span class="cat-label" style="color:${CATEGORY_COLORS[ev.category] || "var(--muted)"}">${esc(categoryMeta(ev.category).label)}</span>${canonBadge(ev.canon)}${ev.phase ? `<span class="chip">${esc((PHASES.find((p) => p.value === ev.phase) || {}).label)}</span>` : ""}</span>
                                        <b class="ev-title">${esc(ev.title)}</b>
                                        <span class="tiny dim clamp-1">${esc(ev.summary || ev.description || "")}</span>
                                    </span>
                                    <span class="ev-cast">${castChips(ev.characterIds, { limit: 3, link: false })}</span>
                                    <span class="ev-loc tiny dim">${ev.locationId ? `${icon("pin")} ${esc(store.nameOf("locations", ev.locationId) || "")}` : ""}</span>
                                    <span class="ev-imp">${importanceBars(ev.importance)}</span>
                                    <span class="ev-arrow">${icon("chevronRight")}</span>
                                </button>`,
                            )
                            .join("")}
                    </div>
                </div>`,
            )
            .join("")}</div>`;
    };

    /* filters */
    root.querySelector("[data-ev-search]").addEventListener("input", debounce((e) => { state.query = e.target.value; draw(); }, 150));
    [
        ["category", "category"],
        ["character", "character"],
        ["faction", "faction"],
        ["storyline", "storyline"],
        ["canon", "canon"],
    ].forEach(([dom]) => {
        root.querySelector(`[data-ev-${dom}]`).addEventListener("change", (e) => {
            state[dom] = e.target.value;
            draw();
        });
    });
    root.querySelector("[data-ev-importance]").addEventListener("change", (e) => { state.importance = Number(e.target.value); draw(); });
    root.querySelector("[data-ev-sort]").addEventListener("change", (e) => { state.sort = e.target.value; draw(); });
    root.querySelector("[data-ev-from]").addEventListener("change", (e) => { state.from = e.target.value; draw(); });
    root.querySelector("[data-ev-to]").addEventListener("change", (e) => { state.to = e.target.value; draw(); });
    root.querySelector("[data-ev-reset]").addEventListener("click", () => {
        state = { query: "", category: "", character: "", faction: "", storyline: "", canon: "", importance: 0, from: "", to: "", sort: "newest", view: state.view };
        root.querySelector("[data-ev-search]").value = "";
        draw();
    });
    root.querySelectorAll("[data-ev-view]").forEach((btn) =>
        btn.addEventListener("click", () => {
            state.view = btn.dataset.evView;
            draw();
        }),
    );

    root.addEventListener("click", (e) => {
        if (e.target.closest("[data-new-event]")) {
            openEntityForm({ type: "events", onSaved: () => { draw(); ctx.refresh(); } });
            return;
        }
        const card = e.target.closest("[data-event]");
        if (card) {
            e.preventDefault();
            openQuickView("events", card.dataset.event);
        }
    });

    draw();

    if (ctx.query.open) {
        const ev = store.get("events", ctx.query.open);
        if (ev) setTimeout(() => openQuickView("events", ev.key), 220);
    }
}
