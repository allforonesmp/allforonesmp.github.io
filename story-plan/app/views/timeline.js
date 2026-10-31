/* Timeline — chronology, parallel arcs and character comparison */

import { store } from "../core/store.js";
import { icon } from "../core/icons.js";
import { esc, fmtDate, fmtDateShort, debounce, parseDate, clamp, unique, capitalize } from "../core/util.js";
import { EVENT_CATEGORIES, PHASES, CANON, IMPORTANCE, STORYLINE_STATUS } from "../core/schema.js";
import {
    CATEGORY_COLORS,
    categoryMeta,
    categoryIcon,
    importanceBars,
    canonBadge,
    statusPill,
    castChips,
    emptyState,
} from "../components/cards.js";
import { openQuickView } from "../components/details.js";

export const flush = false;

const DAY = 86400000;
let viewState = null;

export function heading() {
    return "Timeline";
}

function defaultState() {
    return {
        mode: "lanes",
        search: "",
        character: "",
        faction: "",
        category: "",
        importance: 0,
        canon: "",
        pxPerDay: 1.4,
        trackMode: "storylines",
        compareIds: [],
        zoomAnchor: null,
    };
}

export function render(ctx) {
    viewState = { ...defaultState(), ...(ctx.query.mode ? { mode: ctx.query.mode } : {}) };
    const events = store.all("events");
    const years = unique(events.map((e) => (e.date || "").slice(0, 4)).filter(Boolean)).sort();

    return `<div class="page tl-page">
        <div class="page-head">
            <div>
                <div class="eyebrow">Chronology</div>
                <h2>Everything that happened</h2>
                <p>${events.length} events across ${years.length || 0} year${years.length === 1 ? "" : "s"}. Watch arcs develop in parallel, or read the world in order.</p>
            </div>
            <div class="actions">
                <a class="btn" href="#/map">${icon("map")} Open story map</a>
                <button class="btn primary" data-tl-new>${icon("plus")} Record event</button>
            </div>
        </div>

        <div class="tl-controls panel">
            <div class="tl-controls-row">
                <div class="filter-input">
                    ${icon("search")}
                    <input data-tl-search placeholder="Search events…" value="${esc(viewState.search)}" />
                </div>
                <select class="filter-sel" data-tl-character>
                    <option value="">All characters</option>
                    ${store
                        .all("characters")
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((c) => `<option value="${esc(c.key)}">${esc(c.name)}</option>`)
                        .join("")}
                </select>
                <select class="filter-sel" data-tl-faction>
                    <option value="">All factions</option>
                    ${store
                        .all("factions")
                        .map((f) => `<option value="${esc(f.key)}">${esc(f.name)}</option>`)
                        .join("")}
                </select>
                <select class="filter-sel" data-tl-category>
                    <option value="">All categories</option>
                    ${EVENT_CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join("")}
                </select>
                <select class="filter-sel" data-tl-importance>
                    <option value="0">Any importance</option>
                    ${IMPORTANCE.map((i) => `<option value="${i.value}">${i.label}+</option>`).join("")}
                </select>
                <select class="filter-sel" data-tl-canon>
                    <option value="">Any canon</option>
                    ${CANON.map((c) => `<option value="${c.value}">${c.label}</option>`).join("")}
                </select>
                <button class="btn sm ghost" data-tl-reset>${icon("refresh")} Reset</button>
                <span class="spacer"></span>
                <span class="result-count" data-tl-count></span>
            </div>
            <div class="tl-controls-row tl-controls-second">
                <div class="segmented">
                    <button class="seg ${viewState.mode === "lanes" ? "active" : ""}" data-tl-mode="lanes">${icon("columns")} Parallel arcs</button>
                    <button class="seg ${viewState.mode === "list" ? "active" : ""}" data-tl-mode="list">${icon("list")} In order</button>
                    <button class="seg ${viewState.mode === "characters" ? "active" : ""}" data-tl-mode="characters">${icon("characters")} Compare characters</button>
                </div>
                <div class="segmented" data-track-switch>
                    <button class="seg ${viewState.trackMode === "storylines" ? "active" : ""}" data-track-mode="storylines">Storylines</button>
                    <button class="seg ${viewState.trackMode === "factions" ? "active" : ""}" data-track-mode="factions">Factions</button>
                    <button class="seg ${viewState.trackMode === "both" ? "active" : ""}" data-track-mode="both">Both</button>
                </div>
                <div class="tl-zoom">
                    ${icon("zoomOut")}
                    <input type="range" min="0.25" max="9" step="0.05" value="${viewState.pxPerDay}" data-tl-zoom />
                    ${icon("zoomIn")}
                    <span class="tiny dim mono" data-tl-zoom-label>${zoomLabel(viewState.pxPerDay)}</span>
                </div>
            </div>
        </div>

        <div data-tl-content></div>
    </div>`;
}

export function mount(root, ctx) {
    const content = root.querySelector("[data-tl-content]");

    const syncControls = () => {
        root.querySelector("[data-tl-search]").value = viewState.search;
        root.querySelector("[data-tl-character]").value = viewState.character;
        root.querySelector("[data-tl-faction]").value = viewState.faction;
        root.querySelector("[data-tl-category]").value = viewState.category;
        root.querySelector("[data-tl-importance]").value = String(viewState.importance);
        root.querySelector("[data-tl-canon]").value = viewState.canon;
        root.querySelectorAll("[data-tl-mode]").forEach((b) => b.classList.toggle("active", b.dataset.tlMode === viewState.mode));
        root.querySelectorAll("[data-track-mode]").forEach((b) => b.classList.toggle("active", b.dataset.trackMode === viewState.trackMode));
        root.querySelector("[data-track-switch]").style.display = viewState.mode === "lanes" ? "" : "none";
        const zoom = root.querySelector("[data-tl-zoom]");
        zoom.value = viewState.pxPerDay;
        root.querySelector("[data-tl-zoom-label]").textContent = zoomLabel(viewState.pxPerDay);
    };

    const draw = () => {
        const events = filteredEvents();
        root.querySelector("[data-tl-count]").textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;
        content.innerHTML =
            viewState.mode === "list"
                ? listHtml(events)
                : viewState.mode === "characters"
                  ? characterLanesHtml(events)
                  : lanesHtml(events);
        syncControls();
    };

    const filteredEvents = () => {
        const q = viewState.search.trim().toLowerCase();
        return store
            .all("events")
            .filter((e) => {
                if (q && !`${e.title} ${e.summary || ""} ${e.description || ""}`.toLowerCase().includes(q)) return false;
                if (viewState.character && !(e.characterIds || []).includes(viewState.character)) return false;
                if (viewState.faction && !(e.factionIds || []).includes(viewState.faction)) return false;
                if (viewState.category && e.category !== viewState.category) return false;
                if (viewState.importance && Number(e.importance || 0) < Number(viewState.importance)) return false;
                if (viewState.canon && (e.canon || "confirmed") !== viewState.canon) return false;
                return true;
            })
            .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    };

    /* -------------------------------------------------------------- events */
    root.querySelector("[data-tl-search]").addEventListener("input", debounce((e) => {
        viewState.search = e.target.value;
        draw();
    }, 160));
    ["character", "faction", "category", "importance", "canon"].forEach((key) => {
        root.querySelector(`[data-tl-${key}]`).addEventListener("change", (e) => {
            viewState[key] = key === "importance" ? Number(e.target.value) : e.target.value;
            draw();
        });
    });
    root.querySelector("[data-tl-reset]").addEventListener("click", () => {
        const mode = viewState.mode;
        viewState = { ...defaultState(), mode };
        draw();
    });
    root.querySelector("[data-tl-zoom]").addEventListener("input", (e) => {
        viewState.pxPerDay = Number(e.target.value);
        root.querySelector("[data-tl-zoom-label]").textContent = zoomLabel(viewState.pxPerDay);
        draw();
    });
    root.querySelectorAll("[data-tl-mode]").forEach((btn) =>
        btn.addEventListener("click", () => {
            viewState.mode = btn.dataset.tlMode;
            if (viewState.mode === "characters" && !viewState.compareIds.length) {
                viewState.compareIds = store
                    .all("characters")
                    .filter((c) => store.all("events").some((e) => (e.characterIds || []).includes(c.key)))
                    .slice(0, 4)
                    .map((c) => c.key);
            }
            draw();
        }),
    );
    root.querySelectorAll("[data-track-mode]").forEach((btn) =>
        btn.addEventListener("click", () => {
            viewState.trackMode = btn.dataset.trackMode;
            draw();
        }),
    );
    root.querySelector("[data-tl-new]").addEventListener("click", async () => {
        const { openEntityForm } = await import("../components/ui.js");
        openEntityForm({ type: "events", onSaved: () => draw() });
    });

    content.addEventListener("click", (e) => {
        const laneFocus = e.target.closest("[data-focus-lane]");
        if (laneFocus && viewState.mode === "lanes") {
            const type = laneFocus.dataset.focusType;
            const key = laneFocus.dataset.focusLane;
            if (type === "storylines") location.hash = `#/storylines/${key}`;
            else if (type === "factions") location.hash = `#/factions/${key}`;
            return;
        }
        const compareToggle = e.target.closest("[data-compare]");
        if (compareToggle) {
            const key = compareToggle.dataset.compare;
            viewState.compareIds = viewState.compareIds.includes(key)
                ? viewState.compareIds.filter((k) => k !== key)
                : [...viewState.compareIds, key].slice(-6);
            draw();
        }
        const chip = e.target.closest("[data-tl-filter-char]");
        if (chip) {
            viewState.character = viewState.character === chip.dataset.tlFilterChar ? "" : chip.dataset.tlFilterChar;
            draw();
        }
    });

    draw();
}

/* -------------------------------------------------------------------------
   Swimlanes
   ------------------------------------------------------------------------- */
function lanesHtml(events) {
    if (!events.length) return emptyState({ icon: "timeline", title: "No events match these filters", text: "Adjust the filters or record a new event to start the chronology." });

    const range = computeRange(events);
    const width = Math.max(760, Math.round(range.days * viewState.pxPerDay));
    const tracks = buildTracks(events);
    if (!tracks.length) return emptyState({ icon: "timeline", title: "No tracks to display", text: "Record an event and assign it to a storyline or faction." });

    return `<div class="tl-wrap panel">
        <div class="tl-scroll">
            <div class="tl-grid" style="--track-width:${width}px">
                <div class="tl-row tl-axis-row">
                    <div class="tl-lane-label tl-corner">
                        <span class="eyebrow plain">Tracks</span>
                        <span class="tiny dim">${range.label}</span>
                    </div>
                    <div class="tl-track tl-axis" style="width:${width}px">
                        ${axisTicks(range, width)}
                        ${nowLine(range, width)}
                    </div>
                </div>
                ${tracks
                    .map(
                        (track) => `
                    <div class="tl-row">
                        <button class="tl-lane-label" data-focus-lane="${esc(track.key)}" data-focus-type="${esc(track.type)}" style="--lane-color:${esc(track.color)}">
                            <span class="tl-lane-dot"></span>
                            <span class="tl-lane-name">${esc(track.label)}</span>
                            <span class="tl-lane-meta">${track.events.length} event${track.events.length === 1 ? "" : "s"}${track.meta ? ` · ${esc(track.meta)}` : ""}</span>
                        </button>
                        <div class="tl-track" style="width:${width}px">
                            ${eraBar(track, range, width)}
                            ${nowLine(range, width)}
                            ${track.events.map((ev) => marker(ev, range, width, track)).join("")}
                        </div>
                    </div>`,
                    )
                    .join("")}
            </div>
        </div>
        <div class="tl-legend">
            ${EVENT_CATEGORIES.slice(0, 10)
                .map((c) => `<span class="tl-legend-item"><i style="background:${CATEGORY_COLORS[c.value]}"></i>${c.label}</span>`)
                .join("")}
            <span class="tl-legend-item"><i class="now-dot"></i>Today</span>
        </div>
    </div>`;
}

function buildTracks(events) {
    const tracks = [];
    if (viewState.trackMode === "storylines" || viewState.trackMode === "both") {
        for (const s of store.all("storylines")) {
            const laneEvents = events.filter((e) => (e.storylineIds || []).includes(s.key));
            if (!laneEvents.length) continue;
            tracks.push({
                type: "storylines",
                key: s.key,
                label: s.name,
                meta: (STORYLINE_STATUS.find((x) => x.value === s.status) || {}).label,
                color: "#e9a05a",
                era: { start: s.startDate, end: s.endDate },
                events: laneEvents,
            });
        }
    }
    if (viewState.trackMode === "factions" || viewState.trackMode === "both") {
        for (const f of store.all("factions")) {
            const laneEvents = events.filter((e) => (e.factionIds || []).includes(f.key));
            if (!laneEvents.length) continue;
            tracks.push({ type: "factions", key: f.key, label: f.name, meta: "faction", color: f.color || "#77d29a", events: laneEvents });
        }
    }
    const unassigned = events.filter((e) => !(e.storylineIds || []).length && !(e.factionIds || []).length);
    if (unassigned.length) {
        tracks.push({ type: "other", key: "unassigned", label: "Unassigned records", meta: "not linked to an arc", color: "#8b93a0", events: unassigned });
    }
    return tracks;
}

function characterLanesHtml(events) {
    const chars = store.all("characters").filter((c) => store.all("events").some((e) => (e.characterIds || []).includes(c.key)));
    if (!chars.length) return emptyState({ icon: "characters", title: "No character histories yet", text: "Record events with characters attached to compare their timelines." });
    const selected = viewState.compareIds.filter((id) => store.get("characters", id));
    const active = selected.length ? selected : chars.slice(0, 4).map((c) => c.key);
    const range = computeRange(events);
    const width = Math.max(760, Math.round(range.days * viewState.pxPerDay));

    return `<div class="char-compare panel">
        <div class="char-compare-head">
            <div><div class="eyebrow plain">Compare characters</div><p class="small dim">Select up to six characters to line their histories up against each other.</p></div>
            <div class="tag-pick inline-pick">
                ${chars
                    .map(
                        (c) => `<button class="opt ${active.includes(c.key) ? "on" : ""}" data-compare="${esc(c.key)}">${esc(c.name)}</button>`,
                    )
                    .join("")}
            </div>
        </div>
        ${
            !events.length
                ? emptyState({ icon: "timeline", title: "No events match", text: "Adjust your filters to see these histories." })
                : `<div class="tl-wrap" style="border:0;background:none">
                    <div class="tl-scroll">
                        <div class="tl-grid" style="--track-width:${width}px">
                            <div class="tl-row tl-axis-row">
                                <div class="tl-lane-label tl-corner"><span class="eyebrow plain">Character</span><span class="tiny dim">${range.label}</span></div>
                                <div class="tl-track tl-axis" style="width:${width}px">${axisTicks(range, width)}${nowLine(range, width)}</div>
                            </div>
                            ${active
                                .map((id) => {
                                    const c = store.get("characters", id);
                                    const laneEvents = events.filter((e) => (e.characterIds || []).includes(id));
                                    return `<div class="tl-row">
                                        <div class="tl-lane-label char-lane" style="--lane-color:#7ea6ff">
                                            <span class="tl-lane-avatar">${esc((c.name || "?").split(" ").map((x) => x[0]).join("").slice(0, 2))}</span>
                                            <span><span class="tl-lane-name">${esc(c.name)}</span><span class="tl-lane-meta">${laneEvents.length} event${laneEvents.length === 1 ? "" : "s"} · ${esc(c.status)}</span></span>
                                        </div>
                                        <div class="tl-track" style="width:${width}px">
                                            ${nowLine(range, width)}
                                            ${laneEvents.map((ev) => marker(ev, range, width, { color: "#7ea6ff" })).join("")}
                                        </div>
                                    </div>`;
                                })
                                .join("")}
                        </div>
                    </div>
                </div>`
        }
    </div>`;
}

function computeRange(events) {
    let min = Infinity;
    let max = -Infinity;
    for (const e of events) {
        const d = parseDate(e.date);
        if (!d) continue;
        min = Math.min(min, d.getTime());
        max = Math.max(max, d.getTime());
    }
    if (!Number.isFinite(min)) {
        min = Date.now() - 365 * DAY;
        max = Date.now();
    }
    if (max - min < 12 * DAY) {
        min -= 15 * DAY;
        max += 15 * DAY;
    }
    min -= 12 * DAY;
    max += 12 * DAY;
    const days = Math.max(30, (max - min) / DAY);
    const label = `${fmtDateShort(new Date(min))} — ${fmtDateShort(new Date(max))}`;
    return { min, max, days, label };
}

function xFor(dateStr, range, width) {
    const d = parseDate(dateStr);
    if (!d) return 0;
    return clamp(((d.getTime() - range.min) / DAY) * (width / range.days), 0, width);
}

function axisTicks(range, width) {
    const ticks = [];
    const start = new Date(range.min);
    const end = new Date(range.max);
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    const step = viewState.pxPerDay > 5 ? 1 : viewState.pxPerDay > 2.2 ? 1 : months > 26 ? 6 : months > 12 ? 3 : months > 6 ? 2 : 1;
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    let lastYear = null;
    let guard = 0;
    while (cursor <= end && guard++ < 120) {
        const x = ((cursor.getTime() - range.min) / DAY) * (width / range.days);
        if (x >= 0 && x <= width) {
            const showYear = cursor.getFullYear() !== lastYear;
            ticks.push(
                `<div class="tl-tick ${showYear ? "year" : ""}" style="left:${x}px"><span class="month">${cursor.toLocaleDateString("en-AU", { month: "short" })}</span>${showYear ? `<span class="year">${cursor.getFullYear()}</span>` : ""}</div>`,
            );
            if (showYear) lastYear = cursor.getFullYear();
        }
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + step, 1);
    }
    return ticks.join("");
}

function nowLine(range, width) {
    const now = Date.now();
    if (now < range.min || now > range.max) return "";
    const x = ((now - range.min) / DAY) * (width / range.days);
    return `<div class="tl-now" style="left:${x}px"><span>NOW</span></div>`;
}

function eraBar(track, range, width) {
    if (!track.era || !track.era.start) return "";
    const start = xFor(track.era.start, range, width);
    const end = track.era.end ? xFor(track.era.end, range, width) : width;
    return `<div class="tl-era-bar" style="left:${start}px;width:${Math.max(16, end - start)}px;background:${track.color}22;border-color:${track.color}55"></div>`;
}

function marker(ev, range, width, track) {
    const x = xFor(ev.date, range, width);
    const color = CATEGORY_COLORS[ev.category] || "#999";
    const meta = categoryMeta(ev.category);
    const laneEvents = track?.events || [];
    // vertical stagger to reduce overlap
    let row = 0;
    for (const other of laneEvents) {
        const ox = xFor(other.date, range, width);
        if (other !== ev && Math.abs(ox - x) < 26) {
            row = (row + 1) % 3;
        }
    }
    const top = 16 + row * 22;
    const big = Number(ev.importance || 0) >= 4;
    return `<button class="tl-marker ${big ? "big" : ""} ${ev.canon === "planned" ? "planned" : ""}" data-view-event="${esc(ev.key)}" style="left:${x}px;top:${top}px;--cat:${color}" title="${esc(ev.title)} · ${esc(fmtDate(ev.date))}">
        <span class="tl-marker-dot">${icon(categoryIcon(ev.category))}</span>
        ${big ? `<span class="tl-marker-label">${esc(ev.title)}</span>` : ""}
        <span class="tl-tooltip">
            <b>${esc(ev.title)}</b>
            <span class="tiny mono">${esc(fmtDate(ev.date))} · ${esc(meta.label)}</span>
            <span class="tiny clamp-2">${esc(ev.summary || "")}</span>
            <span class="tl-tooltip-foot">${canonBadge(ev.canon)}${importanceBars(ev.importance)}</span>
        </span>
    </button>`;
}

/* -------------------------------------------------------------------------
   Chronological list
   ------------------------------------------------------------------------- */
function listHtml(events) {
    if (!events.length) return emptyState({ icon: "timeline", title: "No events match these filters", text: "Try clearing the character or category filter." });
    const groups = new Map();
    for (const ev of events) {
        const d = parseDate(ev.date);
        const key = d ? `${d.getFullYear()}` : "Undated";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(ev);
    }
    return `<div class="tl-list">
        ${[...groups.entries()]
            .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
            .map(
                ([year, rows]) => `
            <div class="tl-year">
                <div class="tl-year-label"><span class="display">${esc(year)}</span><span class="tiny dim">${rows.length} event${rows.length === 1 ? "" : "s"}</span></div>
                <div class="tl-year-events">
                    ${rows
                        .map(
                            (ev) => `
                        <button class="tl-event-row" data-view-event="${esc(ev.key)}">
                            <div class="tl-event-date">
                                <span class="mono">${esc(ev.date ? fmtDateShort(ev.date) : "—")}</span>
                                <span class="tl-event-dot" style="--cat:${CATEGORY_COLORS[ev.category] || "#999"}">${icon(categoryIcon(ev.category))}</span>
                            </div>
                            <div class="tl-event-body">
                                <div class="row wrap gap-6">
                                    <span class="cat-label" style="color:${CATEGORY_COLORS[ev.category] || "var(--muted)"}">${esc(categoryMeta(ev.category).label)}</span>
                                    ${ev.phase ? `<span class="chip">${esc((PHASES.find((p) => p.value === ev.phase) || {}).label)}</span>` : ""}
                                    ${canonBadge(ev.canon)}
                                    ${importanceBars(ev.importance)}
                                </div>
                                <h4>${esc(ev.title)}</h4>
                                <p class="clamp-2">${esc(ev.summary || ev.description || "")}</p>
                                <div class="row wrap gap-6" style="margin-top:8px">
                                    ${castChips(ev.characterIds, { limit: 4 })}
                                    ${(ev.storylineIds || []).slice(0, 1).map((id) => `<span class="chip orange">${icon("storylines")} ${esc(store.nameOf("storylines", id) || "")}</span>`).join("")}
                                    ${ev.locationId ? `<span class="chip">${icon("pin")} ${esc(store.nameOf("locations", ev.locationId) || "")}</span>` : ""}
                                </div>
                            </div>
                            <span class="tl-event-arrow">${icon("chevronRight")}</span>
                        </button>`,
                        )
                        .join("")}
                </div>
            </div>`,
            )
            .join("")}
    </div>`;
}

function zoomLabel(px) {
    if (px < 0.6) return "Years";
    if (px < 1.6) return "Months";
    if (px < 4) return "Weeks";
    return "Days";
}
