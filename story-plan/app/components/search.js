/* Global search palette + quick create menu */

import { store, state } from "../core/store.js";
import { searchAll } from "../core/selectors.js";
import { icon } from "../core/icons.js";
import { esc, navigate, fmtDate, debounce, truncate } from "../core/util.js";
import { TYPES, CANON, IMPORTANCE } from "../core/schema.js";
import { openModal, openPopover, closePopover, openEntityForm } from "./ui.js";
import { routeFor } from "./cards.js";

const QUICK_LINKS = [
    { label: "Overview", path: "/overview", icon: "overview" },
    { label: "Story map", path: "/map", icon: "map" },
    { label: "Timeline", path: "/timeline", icon: "timeline" },
    { label: "Characters", path: "/characters", icon: "characters" },
    { label: "Storylines", path: "/storylines", icon: "storylines" },
    { label: "Relationships", path: "/relationships", icon: "relationships" },
    { label: "Secrets & mysteries", path: "/secrets", icon: "secrets" },
    { label: "Analytics", path: "/analytics", icon: "analytics" },
];

export function openSearch(initial = "") {
    let results = [];
    let selectedIndex = 0;
    let activeTypes = [];
    let activeCanon = "";

    const body = `
        <div class="cmdk-input">
            ${icon("search")}
            <input data-cmdk-input placeholder="Search characters, events, storylines, factions, locations, items, secrets…" value="${esc(initial)}" autocomplete="off" spellcheck="false" />
            <kbd>ESC</kbd>
        </div>
        <div class="cmdk-filters">
            <span class="cmdk-filter-label">Filter</span>
            ${Object.entries(TYPES)
                .filter(([t]) => t !== "relationships")
                .map(([t, meta]) => `<button class="chip link" data-type-filter="${t}">${icon(meta.icon)} ${esc(meta.label)}</button>`)
                .join("")}
            <select data-canon-filter class="filter-sel sm" style="height:24px;margin-left:auto">
                <option value="">Any canon</option>
                ${CANON.map((c) => `<option value="${c.value}">${c.label}</option>`).join("")}
            </select>
        </div>
        <div class="cmdk-results" data-results></div>
        <div class="cmdk-foot">
            <span><b>↑↓</b> navigate</span><span><b>↵</b> open</span><span><b>⇧↵</b> open in panel</span><span class="spacer"></span><span>Searching ${store.all("characters").length + store.all("events").length + store.all("storylines").length + store.all("factions").length + store.all("locations").length + store.all("items").length + store.all("mysteries").length + store.all("secrets").length} records</span>
        </div>`;

    const { el, close } = openModal({ title: "", body, className: "cmdk", size: "", onMount: (modal) => {
        modal.querySelector(".modal-head").style.display = "none";
        modal.style.maxWidth = "680px";
        modal.style.marginTop = "3vh";
    } });

    const input = el.querySelector("[data-cmdk-input]");
    const resultsEl = el.querySelector("[data-results]");

    const render = () => {
        const q = input.value.trim();
        const filters = { types: activeTypes.length ? activeTypes : null, canon: activeCanon || null };
        results = q || activeTypes.length || activeCanon ? searchAll(q, filters) : [];
        if (!results.length) {
            resultsEl.innerHTML = `${
                q && !activeTypes.length && !activeCanon
                    ? `<div class="cmdk-empty">No records match “${esc(q)}”.<br/><span class="tiny">Try a different term, or create it below.</span></div>
                       <div class="cmdk-actions">
                         ${["characters", "events", "factions", "storylines", "locations", "items", "mysteries", "secrets"]
                             .map((t) => `<button class="pop-item" data-create-type="${t}">${icon(TYPES[t].icon)} Create ${esc(TYPES[t].singular.toLowerCase())} “${esc(truncate(q, 24))}”</button>`)
                             .join("")}
                       </div>`
                    : q
                      ? `<div class="cmdk-empty">No records match those filters.</div>`
                      : ""
            }
            <div class="cmdk-group">Jump to</div>
            ${QUICK_LINKS.map((l) => `<button class="cmdk-row" data-goto="${l.path}"><span class="ic">${icon(l.icon)}</span>${esc(l.label)}<span class="meta">${icon("arrowRight")}</span></button>`).join("")}`;
            return;
        }
        const groups = new Map();
        for (const r of results) {
            if (!groups.has(r.type)) groups.set(r.type, []);
            groups.get(r.type).push(r);
        }
        let idx = 0;
        resultsEl.innerHTML = [...groups.entries()]
            .map(
                ([type, rows]) => `
            <div class="cmdk-group">${esc(TYPES[type].label)} <span class="dim">${rows.length}</span></div>
            ${rows
                .slice(0, 6)
                .map((r) => {
                    const i = idx++;
                    return `<button class="cmdk-row ${i === selectedIndex ? "sel" : ""}" data-result="${i}">
                        <span class="ic">${icon(TYPES[type].icon)}</span>
                        <span style="min-width:0"><span class="nm">${highlightMatch(r.title, q)}</span><span class="tiny dim" style="display:block">${esc(truncate(stripTags(r.subtitle || ""), 60))}</span></span>
                        <span class="meta">${r.row.canon && r.row.canon !== "confirmed" ? esc(CANON.find((c) => c.value === r.row.canon)?.label || "") : ""}</span>
                    </button>`;
                })
                .join("")}`,
            )
            .join("");
        resultsEl._flat = results;
        selectedIndex = Math.min(selectedIndex, results.length - 1);
    };

    const choose = (index) => {
        const r = resultsEl._flat?.[index];
        if (!r) return;
        close();
        const route = routeFor(r.type);
        if (r.type === "events") navigate(`/events?open=${r.row.key}`);
        else if (r.type === "mysteries" || r.type === "secrets") navigate(`/secrets?open=${r.row.key}`);
        else navigate(`/${route}/${r.row.key}`);
    };

    input.addEventListener("input", debounce(render, 120));
    input.addEventListener("keydown", (e) => {
        const list = resultsEl._flat || [];
        if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, Math.max(0, list.length - 1));
            render();
            el.querySelector(".cmdk-row.sel")?.scrollIntoView({ block: "nearest" });
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedIndex = Math.max(0, selectedIndex - 1);
            render();
            el.querySelector(".cmdk-row.sel")?.scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (list.length) choose(selectedIndex);
        }
    });

    el.addEventListener("click", (e) => {
        const typeBtn = e.target.closest("[data-type-filter]");
        if (typeBtn) {
            const t = typeBtn.dataset.typeFilter;
            activeTypes = activeTypes.includes(t) ? activeTypes.filter((x) => x !== t) : [...activeTypes, t];
            typeBtn.classList.toggle("on");
            selectedIndex = 0;
            render();
            return;
        }
        const resultBtn = e.target.closest("[data-result]");
        if (resultBtn) {
            choose(Number(resultBtn.dataset.result));
            return;
        }
        const goto = e.target.closest("[data-goto]");
        if (goto) {
            close();
            navigate(goto.dataset.goto);
            return;
        }
        const createBtn = e.target.closest("[data-create-type]");
        if (createBtn) {
            const type = createBtn.dataset.createType;
            close();
            const nameField = type === "characters" || type === "factions" || type === "locations" || type === "items" ? "name" : type === "storylines" ? "name" : type === "secrets" || type === "mysteries" ? "title" : "title";
            openEntityForm({ type, defaults: { [nameField]: input.value.trim() } });
        }
    });

    el.querySelector("[data-canon-filter]").addEventListener("change", (e) => {
        activeCanon = e.target.value;
        selectedIndex = 0;
        render();
    });

    render();
    setTimeout(() => input.focus(), 60);
}

function highlightMatch(text, q) {
    const safe = esc(text || "");
    if (!q) return safe;
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    return safe.replace(re, '<mark class="match">$1</mark>');
}

function stripTags(s) {
    return String(s || "").replace(/<[^>]*>/g, "");
}

export function openQuickCreate(anchor) {
    const items = ["characters", "events", "factions", "storylines", "relationships", "mysteries", "secrets", "locations", "items"];
    const html = `<div class="pop-label">Create</div>${items
        .map((t) => `<button class="pop-item" data-quick-create="${t}">${icon(TYPES[t].icon)} ${esc(TYPES[t].singular)}<span class="kbd">${icon("plus")}</span></button>`)
        .join("")}`;
    const pop = openPopover(anchor, html, { width: 210, align: "right", onMount: (node) => {
        node.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-quick-create]");
            if (!btn) return;
            closePopover();
            openEntityForm({ type: btn.dataset.quickCreate });
        });
    } });
    return pop;
}

export function openActivityPanel() {
    const rows = [...(state.data.activity || [])].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const body = `<div class="activity-feed">${rows
        .slice(0, 60)
        .map(
            (a) => `<div class="activity-row">
                <span class="activity-dot ${esc(a.action || "")}"></span>
                <div class="activity-body">
                    <div class="activity-text">${esc(a.message || `${a.action} ${a.entityType}`)}</div>
                    <div class="tiny dim">${esc(a.email || "")} · ${esc(fmtDate(a.createdAt, { hour: "numeric", minute: "2-digit" }))}</div>
                </div>
                ${
                    a.entityType && a.entityKey && TYPES[a.entityType]
                        ? `<a class="icon-btn" href="#/${routeFor(a.entityType)}${a.entityType === "events" ? `?open=${esc(a.entityKey)}` : `/${esc(a.entityKey)}`}" data-link aria-label="Open record">${icon("arrowRight")}</a>`
                        : ""
                }
            </div>`,
        )
        .join("") || '<div class="empty"><div class="eicon">' + icon("bell") + "</div><h4>No activity yet</h4><p>Changes you make across the archive will appear here.</p></div>"}</div>`;
    return { title: "Recent activity", subtitle: "Every edit, addition and deletion in the archive", body };
}
