/* Locations: places, control eras and the events that happened there */

import { store } from "../core/store.js";
import { icon } from "../core/icons.js";
import { esc, fmtDate, fmtDateShort, avatarHtml, truncate, unique } from "../core/util.js";
import { LOCATION_TYPES, LOCATION_CONDITION, CANON } from "../core/schema.js";
import { eventsAtLocation } from "../core/selectors.js";
import { locationCard, statusPill, canonBadge, importanceBars, emptyState, categoryIcon, CATEGORY_COLORS, categoryMeta } from "../components/cards.js";
import { openEntityForm, openModal, confirmDialog, toast } from "../components/ui.js";
import { openQuickView } from "../components/details.js";

export const flush = false;
let dirState = { query: "", type: "", condition: "", sort: "importance" };

export function heading(ctx) {
    return ctx.params.id ? store.nameOf("locations", ctx.params.id) || "Location" : "Locations";
}

export function render(ctx) {
    return ctx.params.id ? renderDetail(ctx, ctx.params.id) : renderDirectory();
}

function renderDirectory() {
    return `<div class="page locations-page">
        <div class="page-head">
            <div>
                <div class="eyebrow">The known world</div>
                <h2>Locations</h2>
                <p>${store.all("locations").length} places across the server, each with its own owners, battles and buried history.</p>
            </div>
            <div class="actions">
                <a class="btn" href="#/map">${icon("map")} See on the map</a>
                <button class="btn primary" data-new-location>${icon("plus")} New location</button>
            </div>
        </div>
        <div class="toolbar">
            <div class="filter-input">${icon("search")}<input data-loc-search placeholder="Search places, regions, history…" value="${esc(dirState.query)}" /></div>
            <select class="filter-sel" data-loc-type><option value="">Any type</option>${LOCATION_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}</select>
            <select class="filter-sel" data-loc-cond><option value="">Any condition</option>${LOCATION_CONDITION.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}</select>
            <select class="filter-sel" data-loc-sort>
                <option value="importance">Most important</option>
                <option value="name">A → Z</option>
                <option value="events">Most events</option>
            </select>
            <span class="spacer"></span>
            <span class="result-count" data-loc-count></span>
        </div>
        <div class="location-grid" data-loc-grid></div>
    </div>`;
}

function renderDetail(ctx, key) {
    const l = store.get("locations", key);
    if (!l) return `<div class="page">${emptyState({ icon: "locations", title: "Location not found", text: "It may have been deleted.", action: `<a class="btn sm" href="#/locations">${icon("arrowLeft")} All locations</a>` })}</div>`;
    const controller = l.controllerFactionId ? store.get("factions", l.controllerFactionId) : null;
    const owner = l.ownerId ? store.get("characters", l.ownerId) : null;
    const associatedChars = (l.characterIds || []).map((id) => store.get("characters", id)).filter(Boolean);
    const associatedFactions = (l.factionIds || []).map((id) => store.get("factions", id)).filter(Boolean);
    const events = eventsAtLocation(l.key).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const eras = (l.ownershipHistory || []).slice().sort((a, b) => (a.from || "9999").localeCompare(b.from || "9999"));
    const typeMeta = LOCATION_TYPES.find((t) => t.value === l.type) || { label: l.type || "Place" };

    const timeline = [];
    if (l.ownerId || eras.length) {
        eras.forEach((e) => {
            timeline.push({
                date: e.from,
                end: e.to,
                kind: "era",
                title: e.factionId ? `${store.nameOf("factions", e.factionId) || e.owner || "Unknown"} takes control` : `${e.owner || "Unknown"} holds this place`,
                body: e.note || "",
            });
        });
    }
    events.forEach((ev) => timeline.push({ date: ev.date, kind: "event", title: ev.title, body: ev.summary || "", eventKey: ev.key, category: ev.category }));
    timeline.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));

    return `<div class="page location-detail">
        <a class="back-link" href="#/locations">${icon("arrowLeft")} All locations</a>
        <header class="loc-hero ${l.imageUrl ? "has-image" : ""}">
            ${l.imageUrl ? `<div class="loc-hero-img" style="background-image:url('${esc(l.imageUrl)}')"></div>` : `<div class="loc-hero-pattern"></div>`}
            <div class="loc-hero-inner">
                <div class="row wrap gap-6">${statusPill(l.condition)}${canonBadge(l.canon)}<span class="chip">${icon("compass")} ${esc(typeMeta.label)}</span>${l.region ? `<span class="chip">${icon("pin")} ${esc(l.region)}</span>` : ""}</div>
                <h2>${esc(l.name)}</h2>
                <div class="row wrap gap-8">
                    ${controller ? `<a class="chip green" href="#/factions/${esc(controller.key)}">${icon("flag")} ${esc(controller.name)}</a>` : `<span class="chip">${icon("flag")} Unclaimed</span>`}
                    ${owner ? `<a class="chip gold" href="#/characters/${esc(owner.key)}">${avatarHtml(owner.name, { username: owner.username, size: "xs" })} ${esc(owner.name)}</a>` : ""}
                    ${l.coords ? `<span class="chip mono">${icon("target")} ${esc(l.coords)}</span>` : ""}
                    ${l.imageUrl ? `<button class="chip linklike" data-loc-image>${icon("image")} Screenshot</button>` : ""}
                </div>
                <div class="loc-hero-stats">
                    <div><b>${events.length}</b><span>Events</span></div>
                    <div><b>${eras.length}</b><span>Ownership eras</span></div>
                    <div><b>${associatedChars.length}</b><span>Characters</span></div>
                    <div><b>${associatedFactions.length}</b><span>Factions</span></div>
                </div>
            </div>
            <div class="loc-hero-actions"><button class="btn sm" data-edit-location>${icon("edit")} Edit</button></div>
        </header>

        <div class="detail-2col">
            <div class="main-col">
                <section class="panel"><div class="panel-head"><h3>${icon("book")} About this place</h3></div><div class="panel-body prose">
                    <p>${esc(l.description || "No description yet.")}</p>
                    ${l.historicalImportance ? `<h4>Historical importance</h4><p>${esc(l.historicalImportance)}</p>` : ""}
                </div></section>

                <section class="panel">
                    <div class="panel-head"><h3>${icon("timeline")} Ownership & event timeline</h3><span class="sub">every era preserved</span>
                        <div class="right"><button class="btn sm ghost" data-add-era>${icon("plus")} Add era</button></div>
                    </div>
                    <div class="panel-body">
                        ${timeline.length ? `<ol class="era-timeline">${timeline.map((t) => `<li class="era-item ${t.kind}">
                            <span class="era-marker">${t.kind === "event" ? icon(categoryIcon(t.category)) : icon("flag")}</span>
                            <div class="era-body">
                                <div class="tiny mono dim">${esc(t.date ? fmtDate(t.date) : "Undated")}${t.end ? ` → ${esc(fmtDate(t.end))}` : ""}</div>
                                ${t.eventKey ? `<button class="era-title linklike" data-view-event="${esc(t.eventKey)}">${esc(t.title)}</button>` : `<div class="era-title">${esc(t.title)}</div>`}
                                ${t.body ? `<div class="tiny dim">${esc(t.body)}</div>` : ""}
                            </div>
                        </li>`).join("")}</ol>` : `<div class="quiet">No ownership eras or events recorded yet.</div>`}
                    </div>
                </section>

                <section class="panel"><div class="panel-head"><h3>${icon("events")} Events here</h3><span class="sub">${events.length}</span></div>
                    <div class="panel-body stack gap-4">${events.length ? events.map((ev) => `<button class="list-line" data-view-event="${esc(ev.key)}"><span class="cat-dot" style="background:${CATEGORY_COLORS[ev.category]}"></span><span class="grow">${esc(ev.title)}</span><span class="tiny dim mono">${esc(ev.date ? fmtDateShort(ev.date) : "")}</span>${canonBadge(ev.canon)}</button>`).join("") : `<div class="quiet">No events recorded here.</div>`}</div>
                </section>
            </div>

            <aside class="side-col">
                <section class="panel"><div class="panel-head"><h3>${icon("info")} Facts</h3></div><div class="panel-body meta-list">
                    <div><span>Type</span><b>${esc(typeMeta.label)}</b></div>
                    <div><span>Region</span><b>${esc(l.region || "—")}</b></div>
                    <div><span>Coordinates</span><b class="mono">${esc(l.coords || "—")}</b></div>
                    <div><span>Condition</span><b>${esc((LOCATION_CONDITION.find((c) => c.value === l.condition) || {}).label || "—")}</b></div>
                    <div><span>Controlled by</span><b>${controller ? `<a href="#/factions/${esc(controller.key)}">${esc(controller.name)}</a>` : "Unclaimed"}</b></div>
                    <div><span>Importance</span><b>${importanceBars(l.importance, "lg")}</b></div>
                </div></section>
                <section class="panel"><div class="panel-head"><h3>${icon("characters")} Characters</h3></div><div class="panel-body stack gap-4">
                    ${associatedChars.map((c) => `<a class="list-line" href="#/characters/${esc(c.key)}">${avatarHtml(c.name, { username: c.username, size: "sm" })}<span>${esc(c.name)}</span></a>`).join("") || `<span class="tiny dim">No characters associated.</span>`}
                </div></section>
                <section class="panel"><div class="panel-head"><h3>${icon("factions")} Factions</h3></div><div class="panel-body row wrap gap-4">
                    ${associatedFactions.map((f) => `<a class="chip" href="#/factions/${esc(f.key)}">${esc(f.name)}</a>`).join("") || `<span class="tiny dim">No factions associated.</span>`}
                </div></section>
            </aside>
        </div>
    </div>`;
}

export function mount(root, ctx) {
    if (!ctx.params.id) return mountDirectory(root, ctx);
    return mountDetail(root, ctx);
}

function mountDirectory(root, ctx) {
    const grid = root.querySelector("[data-loc-grid]");
    root.querySelector("[data-loc-type]").value = dirState.type;
    root.querySelector("[data-loc-cond]").value = dirState.condition;
    root.querySelector("[data-loc-sort]").value = dirState.sort;
    const draw = () => {
        const q = dirState.query.trim().toLowerCase();
        let list = store.all("locations").filter((l) => !l.archived);
        if (dirState.type) list = list.filter((l) => l.type === dirState.type);
        if (dirState.condition) list = list.filter((l) => l.condition === dirState.condition);
        if (q) list = list.filter((l) => `${l.name} ${l.region || ""} ${l.description || ""} ${l.historicalImportance || ""}`.toLowerCase().includes(q));
        if (dirState.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
        else if (dirState.sort === "events") list.sort((a, b) => eventsAtLocation(b.key).length - eventsAtLocation(a.key).length);
        else list.sort((a, b) => (b.importance || 0) - (a.importance || 0));
        root.querySelector("[data-loc-count]").textContent = `${list.length} of ${store.all("locations").length}`;
        grid.innerHTML = list.length ? list.map((l) => locationCard(l)).join("") : emptyState({ icon: "locations", title: "No locations found", text: "Create a place or clear the filters.", action: `<button class="btn sm primary" data-new-location>${icon("plus")} New location</button>` });
    };
    root.querySelector("[data-loc-search]").addEventListener("input", (e) => { dirState.query = e.target.value; draw(); });
    root.querySelector("[data-loc-type]").addEventListener("change", (e) => { dirState.type = e.target.value; draw(); });
    root.querySelector("[data-loc-cond]").addEventListener("change", (e) => { dirState.condition = e.target.value; draw(); });
    root.querySelector("[data-loc-sort]").addEventListener("change", (e) => { dirState.sort = e.target.value; draw(); });
    root.addEventListener("click", (e) => {
        if (e.target.closest("[data-new-location]")) openEntityForm({ type: "locations", onSaved: () => { draw(); ctx.refresh(); } });
    });
    draw();
}

function mountDetail(root, ctx) {
    const l = store.get("locations", ctx.params.id);
    if (!l) return;
    const edit = () => openEntityForm({ type: "locations", record: store.get("locations", l.key), onSaved: () => ctx.refresh(), onDeleted: () => (location.hash = "#/locations") });
    root.addEventListener("click", (e) => {
        if (e.target.closest("[data-edit-location]")) edit();
        if (e.target.closest("[data-loc-image]")) {
            openModal({ title: l.name || "Location", size: "wide", body: `<img src="${esc(l.imageUrl)}" alt="" style="width:100%;border-radius:10px" />`, foot: `<button class="btn ghost" data-close-modal>Close</button>`, onMount: (m, close) => (m.querySelector("[data-close-modal]").onclick = close) });
        }
        if (e.target.closest("[data-add-era]")) addEra(l, ctx);
    });
}

function addEra(l, ctx) {
    openModal({
        title: "Add an ownership era",
        subtitle: "Previous eras stay exactly as they are — new control is layered on top.",
        body: `<div class="field"><label>Owner / controller</label><input class="input" data-era-owner placeholder="Name, title or description" /></div>
               <div class="field"><label>Faction</label><select class="input" data-era-faction><option value="">None</option>${store.all("factions").map((f) => `<option value="${esc(f.key)}">${esc(f.name)}</option>`).join("")}</select></div>
               <div class="row gap-8"><div class="field grow"><label>From</label><input class="input" type="date" data-era-from /></div>
               <div class="field grow"><label>To</label><input class="input" type="date" data-era-to /></div></div>
               <div class="field"><label>How control changed</label><input class="input" data-era-note placeholder="Siege, treaty, abandonment…" /></div>
               <label class="check-line"><input type="checkbox" data-era-current /> Make this the current controlling faction</label>`,
        foot: `<button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-save>Add era</button>`,
        onMount: (modal, close) => {
            modal.querySelector("[data-cancel]").onclick = close;
            modal.querySelector("[data-save]").onclick = () => {
                const owner = modal.querySelector("[data-era-owner]").value.trim();
                const factionId = modal.querySelector("[data-era-faction]").value;
                const from = modal.querySelector("[data-era-from]").value;
                const to = modal.querySelector("[data-era-to]").value;
                const note = modal.querySelector("[data-era-note]").value.trim();
                const current = modal.querySelector("[data-era-current]").checked;
                if (!owner && !factionId) return toast("Name an owner or faction.", "error");
                const patch = { ...l, ownershipHistory: [...(l.ownershipHistory || []), { owner, factionId, from, to, note }] };
                if (factionId) {
                    patch.factionIds = unique([...(l.factionIds || []), factionId]);
                    if (current) patch.controllerFactionId = factionId;
                }
                store.save("locations", patch);
                close();
                toast("Ownership era added.", "success");
                ctx.refresh();
            };
        },
    });
}
