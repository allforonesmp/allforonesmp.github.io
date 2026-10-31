/* Storylines — arcs, phases and subplots */

import { store } from "../core/store.js";
import { icon } from "../core/icons.js";
import { esc, fmtDate, fmtDateShort, debounce, truncate } from "../core/util.js";
import { PHASES, STORYLINE_STATUS, CANON, MYSTERY_STATUS } from "../core/schema.js";
import { storylinePhaseData, storylineProgress, eventsForStoryline } from "../core/selectors.js";
import { storylineCard, canonBadge, statusPill, importanceBars, castChips, refChips, emptyState, categoryMeta, CATEGORY_COLORS, categoryIcon, panel } from "../components/cards.js";
import { openEntityForm, confirmDialog, toast } from "../components/ui.js";
import { openQuickView } from "../components/details.js";

export const flush = false;
let filter = { query: "", status: "", tab: "all" };

export function heading(ctx) {
    if (ctx.params.id) {
        const s = store.get("storylines", ctx.params.id);
        return s ? s.name : "Storyline";
    }
    return "Storylines";
}

export function eyebrow(ctx) {
    return ctx.params.id ? "Storyline" : "Arcs in motion";
}

export function render(ctx) {
    return ctx.params.id ? renderDetail(ctx) : renderList(ctx);
}

/* -------------------------------------------------------------------------
   List
   ------------------------------------------------------------------------- */
function renderList(ctx) {
    const all = store.all("storylines");
    const roots = all.filter((s) => !s.parentId || !store.get("storylines", s.parentId));
    const subplots = all.filter((s) => s.parentId);
    return `<div class="page">
        <div class="page-head">
            <div>
                <div class="eyebrow">Narrative threads</div>
                <h2>Storylines</h2>
                <p>${all.length} arcs across ${new Set(all.map((s) => s.status)).size} statuses. Each arc carries its own cast, conflict and phased progression.</p>
            </div>
            <div class="actions">
                <a class="btn" href="#/timeline">${icon("timeline")} Timeline</a>
                <button class="btn primary" data-new-storyline>${icon("plus")} New storyline</button>
            </div>
        </div>
        <div class="toolbar">
            <div class="filter-input">${icon("search")}<input data-story-search placeholder="Search storylines…" value="${esc(filter.query)}" /></div>
            <div class="segmented" data-story-tabs>
                <button class="seg ${filter.tab === "all" ? "active" : ""}" data-story-tab="all">All ${all.length}</button>
                <button class="seg ${filter.tab === "active" ? "active" : ""}" data-story-tab="active">Active ${all.filter((s) => s.status === "active").length}</button>
                <button class="seg ${filter.tab === "planned" ? "active" : ""}" data-story-tab="planned">Planned ${all.filter((s) => ["planned", "upcoming"].includes(s.status)).length}</button>
                <button class="seg ${filter.tab === "completed" ? "active" : ""}" data-story-tab="completed">Completed ${all.filter((s) => s.status === "completed").length}</button>
                <button class="seg ${filter.tab === "subplots" ? "active" : ""}" data-story-tab="subplots">Subplots ${subplots.length}</button>
            </div>
            <span class="result-count" data-story-count></span>
        </div>
        <div class="story-tree" data-story-results></div>
    </div>`;
}

function renderStoryResults() {
    const q = filter.query.trim().toLowerCase();
    let rows = store.all("storylines").filter((s) => {
        if (q && !`${s.name} ${s.subtitle || ""} ${s.premise || ""}`.toLowerCase().includes(q)) return false;
        if (filter.tab === "active") return s.status === "active";
        if (filter.tab === "planned") return ["planned", "upcoming"].includes(s.status);
        if (filter.tab === "completed") return s.status === "completed";
        if (filter.tab === "subplots") return Boolean(s.parentId);
        if (filter.status) return s.status === filter.status;
        return true;
    });
    const count = document.querySelector("[data-story-count]");
    if (count) count.textContent = `${rows.length} arc${rows.length === 1 ? "" : "s"}`;
    if (!rows.length) {
        return emptyState({
            icon: "storylines",
            title: store.all("storylines").length ? "No matching storylines" : "No storylines yet",
            text: "An arc ties events, characters and conflicts into a single direction.",
            action: `<button class="btn sm primary" data-new-storyline>${icon("plus")} Create storyline</button>`,
        });
    }
    if (filter.tab === "all" || filter.tab === "subplots") {
        const roots = rows.filter((s) => !s.parentId || !store.get("storylines", s.parentId));
        const children = (parentId) => rows.filter((s) => s.parentId === parentId);
        const renderTree = (parent, depth = 0) => {
            const kids = children(parent.key);
            return `<div class="story-branch" style="--depth:${depth}">
                ${storylineCard(parent)}
                ${kids.length ? `<div class="subplot-list">${kids.map((k) => `<div class="subplot-row"><span class="subplot-connector">${icon("branch")}</span><div style="flex:1;min-width:0">${renderTree(k, depth + 1)}</div></div>`).join("")}</div>` : ""}
            </div>`;
        };
        const orphanChildren = rows.filter((s) => s.parentId && !rows.some((p) => p.key === s.parentId) && !store.get("storylines", s.parentId));
        return `<div class="story-grid wide">${roots.map((r) => renderTree(r)).join("")}${orphanChildren.map((s) => storylineCard(s)).join("")}</div>`;
    }
    rows = rows.sort((a, b) => (b.importance || 0) - (a.importance || 0) || (b.startDate || "").localeCompare(a.startDate || ""));
    return `<div class="story-grid">${rows.map(storylineCard).join("")}</div>`;
}

/* -------------------------------------------------------------------------
   Detail
   ------------------------------------------------------------------------- */
function renderDetail(ctx) {
    const s = store.get("storylines", ctx.params.id);
    if (!s) {
        return `<div class="page">${emptyState({ icon: "storylines", title: "Storyline not found", text: "It may have been deleted.", action: `<a class="btn" href="#/storylines">Back to storylines</a>` })}</div>`;
    }
    const phaseData = storylinePhaseData(s.key);
    const events = eventsForStoryline(s.key);
    const children = store.all("storylines").filter((x) => x.parentId === s.key);
    const parent = s.parentId ? store.get("storylines", s.parentId) : null;
    const allPhases = PHASES.map((p) => ({ ...p, count: phaseData.find((x) => x.value === p.value)?.events.length || 0 }));
    const currentIndex = PHASES.findIndex((p) => p.value === s.phase);
    const assigned = phaseData.reduce((n, p) => n + p.events.length, 0);
    const statusLabel = (STORYLINE_STATUS.find((x) => x.value === s.status) || {}).label || s.status;
    const mysteries = (s.mysteryIds || []).map((id) => store.get("mysteries", id)).filter(Boolean);

    return `<div class="page story-detail">
        <div class="story-hero" data-theme="${esc(s.status)}">
            <div class="story-hero-glow"></div>
            ${parent ? `<a class="btn ghost sm" href="#/storylines/${esc(parent.key)}">${icon("arrowLeft")} ${esc(parent.name)}</a>` : `<a class="btn ghost sm" href="#/storylines">${icon("arrowLeft")} Storylines</a>`}
            <div class="row wrap gap-8" style="margin:8px 0 12px">
                ${statusPill(s.status, statusLabel)}
                ${canonBadge(s.canon)}
                ${importanceBars(s.importance, "lg")}
                <span class="chip gold">${icon("branch")} ${esc((PHASES.find((p) => p.value === s.phase) || {}).label)}</span>
                ${s.startDate ? `<span class="chip">${icon("clock")} ${esc(s.startDate ? fmtDate(s.startDate) : "")} → ${esc(s.endDate ? fmtDate(s.endDate) : "ongoing")}</span>` : ""}
            </div>
            <h2 class="story-hero-title">${esc(s.name)}</h2>
            <p class="story-hero-sub">${esc(s.subtitle || "")}</p>
            <div class="story-hero-actions">
                <button class="btn primary sm" data-edit-story>${icon("edit")} Edit storyline</button>
                <button class="btn sm" data-add-story-event>${icon("plus")} Add event</button>
                <button class="icon-btn" data-story-menu>${icon("more")}</button>
            </div>
        </div>

        <div class="story-progress panel">
            <div class="panel-head"><h3>${icon("branch")} Progression</h3><span class="sub">${assigned} of ${events.length} events placed · status set manually</span>
                <div class="right"><button class="btn sm ghost" data-jump-phases>Jump to phases ${icon("arrowRight")}</button></div>
            </div>
            <div class="panel-body">
                <div class="phase-track">
                    ${allPhases
                        .map(
                            (p, i) => `<div class="phase-track-step ${i <= currentIndex ? "done" : ""} ${s.phase === p.value ? "current" : ""}">
                                <div class="pts-node">${i < currentIndex ? icon("check") : `<span>${i + 1}</span>`}</div>
                                <div class="pts-label">${esc(p.label)}</div>
                                <div class="pts-count">${p.count} event${p.count === 1 ? "" : "s"}</div>
                            </div>${i < allPhases.length - 1 ? `<div class="pts-line ${i < currentIndex ? "done" : ""}"></div>` : ""}`,
                        )
                        .join("")}
                </div>
                <div class="story-progress-note">${icon("info")} Phase position is a writer judgement, not an automatic score. ${storylineProgress(s)}% of assigned beats currently sit in or before the ${esc((PHASES.find((p) => p.value === s.phase) || {}).label)} phase.</div>
            </div>
        </div>

        <div class="profile-layout">
            <div class="profile-main">
                <section class="panel">
                    <div class="panel-head"><h3>${icon("book")} Premise & conflict</h3></div>
                    <div class="panel-body">
                        <div class="prose-split">
                            <div><h5>Description</h5><p>${esc(s.premise || "Not written yet.")}</p></div>
                            <div><h5>Main conflict</h5><p>${esc(s.mainConflict || "Not written yet.")}</p></div>
                            <div><h5>Current situation</h5><p>${esc(s.currentSituation || "Not written yet.")}</p></div>
                            <div><h5>Theme</h5><p>${esc(s.theme || "Not written yet.")}</p></div>
                        </div>
                    </div>
                </section>

                <section class="panel" id="phases">
                    <div class="panel-head"><h3>${icon("layers")} Events by phase</h3><span class="sub">${events.length} linked events</span>
                        <div class="right"><button class="btn sm" data-add-story-event>${icon("plus")} Add event</button></div>
                    </div>
                    <div class="panel-body">
                        ${phaseData
                            .map(
                                (p, i) => `<div class="phase-block ${s.phase === p.value ? "current" : ""}">
                                    <div class="phase-block-head">
                                        <span class="phase-num mono">${String(i + 1).padStart(2, "0")}</span>
                                        <h4>${esc(p.label)}</h4>
                                        <span class="chip">${p.events.length}</span>
                                        ${s.phase === p.value ? `<span class="chip gold">Current phase</span>` : ""}
                                        <button class="btn sm ghost" data-add-phase-event="${esc(p.value)}" style="margin-left:auto">${icon("plus")} Add</button>
                                    </div>
                                    ${
                                        p.events.length
                                            ? `<div class="phase-events">${p.events
                                                  .map(
                                                      (ev) => `<button class="phase-event" data-view-event="${esc(ev.key)}">
                                                          <span class="pe-date mono">${esc(fmtDateShort(ev.date))}</span>
                                                          <span class="pe-marker" style="--cat:${CATEGORY_COLORS[ev.category] || "#999"}">${icon(categoryIcon(ev.category))}</span>
                                                          <span class="pe-body"><b>${esc(ev.title)}</b><span class="tiny dim clamp-1">${esc(truncate(ev.summary || "", 96))}</span></span>
                                                          ${importanceBars(ev.importance)}
                                                      </button>`,
                                                  )
                                                  .join("")}</div>`
                                            : `<div class="phase-empty tiny dim">No events assigned to this phase yet.</div>`
                                    }
                                </div>`,
                            )
                            .join("")}
                    </div>
                </section>

                ${
                    children.length
                        ? `<section class="panel">
                            <div class="panel-head"><h3>${icon("branch")} Subplots</h3><span class="sub">${children.length}</span></div>
                            <div class="panel-body"><div class="subplot-cards">${children
                                .map(
                                    (k) => `<a class="subplot-card" href="#/storylines/${esc(k.key)}">
                                        <span class="subplot-node">${icon("branch")}</span>
                                        <span class="subplot-copy"><b>${esc(k.name)}</b><span class="tiny dim clamp-2">${esc(k.subtitle || k.premise || "")}</span>
                                        <span class="row gap-4" style="margin-top:6px">${statusPill(k.status)}${importanceBars(k.importance)}</span></span>
                                        ${icon("chevronRight")}
                                    </a>`,
                                )
                                .join("")}</div></div>
                        </section>`
                        : ""
                }

                <section class="panel">
                    <div class="panel-head"><h3>${icon("flag")} Resolution & consequences</h3></div>
                    <div class="panel-body">
                        <div class="prose-split">
                            <div><h5>Potential resolution</h5><p>${esc(s.potentialResolution || "Not decided yet.")}</p></div>
                            <div><h5>Expected consequences</h5><p>${esc(s.expectedConsequences || "Not decided yet.")}</p></div>
                        </div>
                    </div>
                </section>
            </div>

            <aside class="profile-side">
                <section class="panel">
                    <div class="panel-head"><h3>${icon("characters")} Cast</h3><span class="sub">${(s.characterIds || []).length}</span></div>
                    <div class="panel-body tight">
                        ${
                            (s.characterIds || []).length
                                ? `<div class="cast-grid">${(s.characterIds || [])
                                      .map((id) => store.get("characters", id))
                                      .filter(Boolean)
                                      .map(
                                          (c) => `<a class="cast-tile" href="#/characters/${esc(c.key)}">${castAvatar(c)}<span>${esc(c.name)}</span><span class="tiny dim">${esc(c.status)}</span></a>`,
                                      )
                                      .join("")}</div>`
                                : `<div class="quiet">No cast attached.</div>`
                        }
                    </div>
                </section>
                <section class="panel">
                    <div class="panel-head"><h3>${icon("map")} World</h3></div>
                    <div class="panel-body">
                        <div class="side-block"><span class="eyebrow plain">Factions</span>${refChips("factions", s.factionIds, { limit: 6, empty: '<span class="dim small">None linked</span>' })}</div>
                        <div class="side-block"><span class="eyebrow plain">Locations</span>${refChips("locations", s.locationIds, { limit: 6, empty: '<span class="dim small">None linked</span>' })}</div>
                        <div class="side-block"><span class="eyebrow plain">Mysteries</span>${(mysteries || []).map((m) => `<button class="chip link" data-open-mystery="${esc(m.key)}">${icon("key")} ${esc(m.title)}</button>`).join(" ") || '<span class="dim small">None linked</span>'}</div>
                    </div>
                </section>
                <section class="panel">
                    <div class="panel-head"><h3>${icon("chart")} At a glance</h3></div>
                    <div class="panel-body">
                        <div class="fact-stack">
                            <div class="fact"><span class="fact-label">Status</span><span class="fact-value">${esc(statusLabel)}</span></div>
                            <div class="fact"><span class="fact-label">Current phase</span><span class="fact-value">${esc((PHASES.find((p) => p.value === s.phase) || {}).label || "—")}</span></div>
                            <div class="fact"><span class="fact-label">Events</span><span class="fact-value">${events.length}</span></div>
                            <div class="fact"><span class="fact-label">Subplots</span><span class="fact-value">${children.length}</span></div>
                            <div class="fact"><span class="fact-label">Begins</span><span class="fact-value">${esc(s.startDate ? fmtDate(s.startDate) : "—")}</span></div>
                            <div class="fact"><span class="fact-label">Ends</span><span class="fact-value">${esc(s.endDate ? fmtDate(s.endDate) : "Open")}</span></div>
                        </div>
                    </div>
                </section>
                <section class="panel">
                    <div class="panel-head"><h3>${icon("plus")} Subplot</h3></div>
                    <div class="panel-body">
                        <p class="small dim">Branch this arc into a smaller story that reports into it.</p>
                        <button class="btn sm full" data-new-subplot>${icon("branch")} Create subplot</button>
                    </div>
                </section>
            </aside>
        </div>
    </div>`;
}

function castAvatar(c) {
    return `<span class="cast-tile-avatar">${c.portraitUrl ? `<img src="${esc(c.portraitUrl)}" alt="" />` : esc((c.name || "?").split(" ").map((x) => x[0]).join("").slice(0, 2))}</span>`;
}

export function mount(root, ctx) {
    if (!ctx.params.id) {
        const search = root.querySelector("[data-story-search]");
        const renderResults = () => {
            const el = root.querySelector("[data-story-results]");
            if (el) el.innerHTML = renderStoryResults();
        };
        search?.addEventListener("input", debounce((e) => { filter.query = e.target.value; renderResults(); }, 150));
        root.querySelectorAll("[data-story-tab]").forEach((btn) =>
            btn.addEventListener("click", () => {
                filter.tab = btn.dataset.storyTab;
                root.querySelectorAll("[data-story-tab]").forEach((b) => b.classList.toggle("active", b === btn));
                renderResults();
            }),
        );
        renderResults();
        root.addEventListener("click", (e) => {
            if (e.target.closest("[data-new-storyline]")) {
                openEntityForm({ type: "storylines", onSaved: (rec) => { location.hash = `#/storylines/${rec.key}`; } });
            }
        });
        return;
    }

    const story = store.get("storylines", ctx.params.id);
    if (!story) return;

    const addEvent = (phase = null) => {
        openEntityForm({
            type: "events",
            title: `Event in ${story.name}`,
            defaults: {
                storylineIds: [story.key],
                phase: phase || story.phase || "introduction",
                date: new Date().toISOString().slice(0, 10),
                characterIds: [...(story.characterIds || [])].slice(0, 2),
            },
            onSaved: () => ctx.refresh(),
        });
    };

    root.addEventListener("click", (e) => {
        if (e.target.closest("[data-edit-story]")) {
            openEntityForm({ type: "storylines", record: store.get("storylines", story.key), onSaved: () => ctx.refresh(), onDeleted: () => { location.hash = "#/storylines"; } });
            return;
        }
        if (e.target.closest("[data-add-story-event]")) {
            addEvent();
            return;
        }
        const phaseAdd = e.target.closest("[data-add-phase-event]");
        if (phaseAdd) {
            addEvent(phaseAdd.dataset.addPhaseEvent);
            return;
        }
        if (e.target.closest("[data-jump-phases]")) {
            root.querySelector("#phases")?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        const mystery = e.target.closest("[data-open-mystery]");
        if (mystery) {
            openQuickView("mysteries", mystery.dataset.openMystery);
            return;
        }
        if (e.target.closest("[data-new-subplot]")) {
            openEntityForm({
                type: "storylines",
                title: `Subplot of ${story.name}`,
                defaults: {
                    parentId: story.key,
                    characterIds: [...(story.characterIds || [])].slice(0, 3),
                    factionIds: [...(story.factionIds || [])].slice(0, 2),
                    status: "planned",
                    phase: "introduction",
                },
                onSaved: (rec) => { location.hash = `#/storylines/${rec.key}`; },
            });
            return;
        }
        if (e.target.closest("[data-story-menu]")) {
            const btn = e.target.closest("[data-story-menu]");
            import("../components/ui.js").then(({ openPopover, closePopover }) => {
                openPopover(
                    btn,
                    `<button class="pop-item" data-sm-duplicate>${icon("copy")} Duplicate</button>
                     <button class="pop-item" data-sm-archive>${icon("archive")} ${story.archived ? "Restore" : "Archive"}</button>
                     <div class="pop-sep"></div>
                     <button class="pop-item danger" data-sm-delete>${icon("trash")} Delete storyline</button>`,
                    {
                        width: 200,
                        align: "right",
                        onMount: (pop) => {
                            pop.addEventListener("click", (ev) => {
                                if (ev.target.closest("[data-sm-duplicate]")) {
                                    closePopover();
                                    const copy = store.duplicate("storylines", story.key);
                                    if (copy) location.hash = `#/storylines/${copy.key}`;
                                } else if (ev.target.closest("[data-sm-archive]")) {
                                    closePopover();
                                    store.archive("storylines", story.key, !story.archived);
                                    toast(story.archived ? "Storyline restored." : "Storyline archived.", "success");
                                    ctx.refresh();
                                } else if (ev.target.closest("[data-sm-delete]")) {
                                    closePopover();
                                    confirmDialog({
                                        title: "Delete storyline?",
                                        message: `Delete <b>${esc(story.name)}</b>? Linked events and characters are kept, but the arc is removed. Subplots will become root storylines.`,
                                        requireText: story.name,
                                        confirmLabel: "Delete storyline",
                                        onConfirm: () => {
                                            store.remove("storylines", { key: story.key });
                                            toast("Storyline deleted.", "success");
                                            location.hash = "#/storylines";
                                        },
                                    });
                                }
                            });
                        },
                    },
                );
            });
        }
    });
}
