/* Items: artefacts, their keepers and every hand they have passed through */

import { store } from "../core/store.js";
import { icon } from "../core/icons.js";
import { esc, fmtDate, fmtDateShort, avatarHtml, truncate } from "../core/util.js";
import { ITEM_TYPES, ITEM_STATUS, CANON } from "../core/schema.js";
import { itemCard, statusPill, canonBadge, importanceBars, emptyState } from "../components/cards.js";
import { openEntityForm, openModal, confirmDialog, toast } from "../components/ui.js";
import { openQuickView } from "../components/details.js";

export const flush = false;
let dirState = { query: "", type: "", status: "", sort: "importance" };

export function heading(ctx) {
    return ctx.params.id ? store.nameOf("items", ctx.params.id) || "Item" : "Items";
}

export function render(ctx) {
    return ctx.params.id ? renderDetail(ctx, ctx.params.id) : renderDirectory();
}

function renderDirectory() {
    return `<div class="page items-page">
        <div class="page-head">
            <div>
                <div class="eyebrow">Objects of power</div>
                <h2>Items & artefacts</h2>
                <p>${store.all("items").length} tracked items. Every transfer of ownership is preserved, so an artefact's history can always be traced hand to hand.</p>
            </div>
            <div class="actions"><button class="btn primary" data-new-item>${icon("plus")} New item</button></div>
        </div>
        <div class="toolbar">
            <div class="filter-input">${icon("search")}<input data-item-search placeholder="Search items, origins, significance…" value="${esc(dirState.query)}" /></div>
            <select class="filter-sel" data-item-type><option value="">Any type</option>${ITEM_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}</select>
            <select class="filter-sel" data-item-status><option value="">Any status</option>${ITEM_STATUS.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}</select>
            <select class="filter-sel" data-item-sort>
                <option value="importance">Most important</option>
                <option value="name">A → Z</option>
                <option value="recent">Recently discovered</option>
            </select>
            <span class="spacer"></span>
            <span class="result-count" data-item-count></span>
        </div>
        <div class="item-grid" data-item-grid></div>
    </div>`;
}

function renderDetail(ctx, key) {
    const it = store.get("items", key);
    if (!it) return `<div class="page">${emptyState({ icon: "items", title: "Item not found", text: "It may have been deleted.", action: `<a class="btn sm" href="#/items">${icon("arrowLeft")} All items</a>` })}</div>`;
    const owner = it.ownerId ? store.get("characters", it.ownerId) : null;
    const location = it.locationId ? store.get("locations", it.locationId) : null;
    const previous = (it.previousOwners || []).slice().sort((a, b) => (a.from || "9999").localeCompare(b.from || "9999"));
    const events = (it.eventIds || []).map((id) => store.get("events", id)).filter(Boolean).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const typeMeta = ITEM_TYPES.find((t) => t.value === it.type) || { label: it.type || "Item" };
    const chain = [];
    previous.forEach((p) => chain.push({ characterId: p.characterId, name: store.nameOf("characters", p.characterId) || p.owner || "Unknown", from: p.from, to: p.to, note: p.note }));
    if (owner) chain.push({ characterId: owner.key, name: owner.name, from: (previous[previous.length - 1] || {}).to || it.discovered, to: "", note: "Current keeper", current: true });
    chain.sort((a, b) => (a.from || "9999").localeCompare(b.from || "9999"));

    return `<div class="page item-detail">
        <a class="back-link" href="#/items">${icon("arrowLeft")} All items</a>
        <header class="item-hero">
            <div class="item-portrait">${it.imageUrl ? `<img src="${esc(it.imageUrl)}" alt="" data-item-image />` : `<div class="item-glyph">${icon("items")}</div>`}</div>
            <div class="item-hero-copy">
                <div class="row wrap gap-6">${statusPill(it.status)}${canonBadge(it.canon)}<span class="chip">${icon("items")} ${esc(typeMeta.label)}</span></div>
                <h2>${esc(it.name)}</h2>
                <p>${esc(it.significance || it.description || "")}</p>
                <div class="row wrap gap-8">
                    ${owner ? `<a class="chip gold" href="#/characters/${esc(owner.key)}">${avatarHtml(owner.name, { username: owner.username, size: "xs" })} ${esc(owner.name)}</a>` : `<span class="chip">${icon("help")} Owner unknown</span>`}
                    ${location ? `<a class="chip" href="#/locations/${esc(location.key)}">${icon("pin")} ${esc(location.name)}</a>` : ""}
                    ${it.discovered ? `<span class="chip">${icon("clock")} Discovered ${esc(fmtDate(it.discovered))}</span>` : ""}
                    ${importanceBars(it.importance, "lg")}
                </div>
            </div>
            <div class="item-hero-actions">
                <button class="btn sm" data-edit-item>${icon("edit")} Edit</button>
                <button class="btn sm ghost" data-transfer-item>${icon("arrowRight")} Transfer</button>
            </div>
        </header>

        <div class="detail-2col">
            <div class="main-col">
                <section class="panel"><div class="panel-head"><h3>${icon("book")} Description</h3></div><div class="panel-body prose"><p>${esc(it.description || "No description yet.")}</p>${it.origin ? `<h4>Origin</h4><p>${esc(it.origin)}</p>` : ""}${it.significance ? `<h4>Historical significance</h4><p>${esc(it.significance)}</p>` : ""}</div></section>

                <section class="panel">
                    <div class="panel-head"><h3>${icon("arrowRight")} Ownership chain</h3><span class="sub">${chain.length} hands</span>
                        <div class="right"><button class="btn sm ghost" data-add-owner>${icon("plus")} Add past owner</button></div>
                    </div>
                    <div class="panel-body">
                        ${chain.length ? `<ol class="ownership-chain">${chain.map((c, i) => `<li class="oc-item ${c.current ? "current" : ""}">
                            <span class="oc-node">${c.characterId ? avatarHtml(c.name, { username: (store.get("characters", c.characterId) || {}).username, size: "md" }) : `<span class="oc-unknown">${icon("help")}</span>`}</span>
                            <div class="oc-body">
                                <div class="oc-name">${c.characterId ? `<a href="#/characters/${esc(c.characterId)}">${esc(c.name)}</a>` : esc(c.name)} ${c.current ? `<span class="chip green tiny">Current keeper</span>` : ""}</div>
                                <div class="tiny mono dim">${esc(c.from ? fmtDateShort(c.from) : "Unknown")} → ${esc(c.current ? "present" : c.to ? fmtDateShort(c.to) : "unknown")}</div>
                                ${c.note ? `<div class="tiny dim">${esc(c.note)}</div>` : ""}
                            </div>
                            ${i < chain.length - 1 ? `<span class="oc-arrow">${icon("arrowRight")}</span>` : ""}
                        </li>`).join("")}</ol>` : `<div class="quiet">No ownership history recorded.</div>`}
                    </div>
                </section>

                <section class="panel"><div class="panel-head"><h3>${icon("events")} Associated events</h3><span class="sub">${events.length}</span></div>
                    <div class="panel-body stack gap-4">${events.length ? events.map((ev) => `<button class="list-line" data-view-event="${esc(ev.key)}">${icon("events")}<span class="grow">${esc(ev.title)}</span><span class="tiny dim mono">${esc(ev.date ? fmtDateShort(ev.date) : "")}</span></button>`).join("") : `<div class="quiet">No events linked to this item.</div>`}</div>
                </section>
            </div>

            <aside class="side-col">
                <section class="panel"><div class="panel-head"><h3>${icon("info")} Facts</h3></div><div class="panel-body meta-list">
                    <div><span>Type</span><b>${esc(typeMeta.label)}</b></div>
                    <div><span>Status</span><b>${esc((ITEM_STATUS.find((s) => s.value === it.status) || {}).label || "—")}</b></div>
                    <div><span>Discovered</span><b>${esc(it.discovered ? fmtDate(it.discovered) : "—")}</b></div>
                    <div><span>Current keeper</span><b>${owner ? `<a href="#/characters/${esc(owner.key)}">${esc(owner.name)}</a>` : "Unknown"}</b></div>
                    <div><span>Location</span><b>${location ? `<a href="#/locations/${esc(location.key)}">${esc(location.name)}</a>` : "—"}</b></div>
                    <div><span>Hands passed</span><b>${chain.length}</b></div>
                </div></section>
                ${it.imageUrl ? `<section class="panel"><div class="panel-head"><h3>${icon("image")} Image</h3></div><div class="panel-body"><img class="item-side-image" src="${esc(it.imageUrl)}" alt="" data-item-image /></div></section>` : ""}
            </aside>
        </div>
    </div>`;
}

export function mount(root, ctx) {
    if (!ctx.params.id) return mountDirectory(root, ctx);
    return mountDetail(root, ctx);
}

function mountDirectory(root, ctx) {
    const grid = root.querySelector("[data-item-grid]");
    root.querySelector("[data-item-type]").value = dirState.type;
    root.querySelector("[data-item-status]").value = dirState.status;
    root.querySelector("[data-item-sort]").value = dirState.sort;
    const draw = () => {
        const q = dirState.query.trim().toLowerCase();
        let list = store.all("items").filter((i) => !i.archived);
        if (dirState.type) list = list.filter((i) => i.type === dirState.type);
        if (dirState.status) list = list.filter((i) => i.status === dirState.status);
        if (q) list = list.filter((i) => `${i.name} ${i.description || ""} ${i.origin || ""} ${i.significance || ""}`.toLowerCase().includes(q));
        if (dirState.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
        else if (dirState.sort === "recent") list.sort((a, b) => (b.discovered || "").localeCompare(a.discovered || ""));
        else list.sort((a, b) => (b.importance || 0) - (a.importance || 0));
        root.querySelector("[data-item-count]").textContent = `${list.length} of ${store.all("items").length}`;
        grid.innerHTML = list.length ? list.map((i) => itemCard(i)).join("") : emptyState({ icon: "items", title: "No items found", text: "Create an artefact or clear the filters.", action: `<button class="btn sm primary" data-new-item>${icon("plus")} New item</button>` });
    };
    root.querySelector("[data-item-search]").addEventListener("input", (e) => { dirState.query = e.target.value; draw(); });
    root.querySelector("[data-item-type]").addEventListener("change", (e) => { dirState.type = e.target.value; draw(); });
    root.querySelector("[data-item-status]").addEventListener("change", (e) => { dirState.status = e.target.value; draw(); });
    root.querySelector("[data-item-sort]").addEventListener("change", (e) => { dirState.sort = e.target.value; draw(); });
    root.addEventListener("click", (e) => {
        if (e.target.closest("[data-new-item]")) openEntityForm({ type: "items", onSaved: () => { draw(); ctx.refresh(); } });
    });
    draw();
}

function mountDetail(root, ctx) {
    const it = store.get("items", ctx.params.id);
    if (!it) return;
    root.addEventListener("click", (e) => {
        if (e.target.closest("[data-edit-item]")) openEntityForm({ type: "items", record: store.get("items", it.key), onSaved: () => ctx.refresh(), onDeleted: () => (location.hash = "#/items") });
        if (e.target.closest("[data-add-owner]")) addPreviousOwner(it, ctx);
        if (e.target.closest("[data-transfer-item]")) transferItem(it, ctx);
        if (e.target.closest("[data-item-image]")) {
            openModal({ title: it.name || "Item", size: "wide", body: `<img src="${esc(it.imageUrl)}" alt="" style="width:100%;border-radius:10px" />`, foot: `<button class="btn ghost" data-close-modal>Close</button>`, onMount: (m, close) => (m.querySelector("[data-close-modal]").onclick = close) });
        }
    });
}

function addPreviousOwner(it, ctx) {
    openModal({
        title: "Add a past owner",
        subtitle: "Preserved in the ownership chain alongside the current keeper.",
        body: `<div class="field"><label>Character</label><select class="input" data-po-char><option value="">Select…</option>${store.all("characters").sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${esc(c.key)}">${esc(c.name)}</option>`).join("")}</select></div>
               <div class="row gap-8"><div class="field grow"><label>From</label><input class="input" type="date" data-po-from /></div><div class="field grow"><label>To</label><input class="input" type="date" data-po-to /></div></div>
               <div class="field"><label>How it changed hands</label><input class="input" data-po-note placeholder="Gift, theft, duel, inheritance…" /></div>`,
        foot: `<button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-save>Add owner</button>`,
        onMount: (modal, close) => {
            modal.querySelector("[data-cancel]").onclick = close;
            modal.querySelector("[data-save]").onclick = () => {
                const characterId = modal.querySelector("[data-po-char]").value;
                if (!characterId) return toast("Choose a character.", "error");
                const entry = { characterId, from: modal.querySelector("[data-po-from]").value, to: modal.querySelector("[data-po-to]").value, note: modal.querySelector("[data-po-note]").value.trim() };
                store.save("items", { ...it, previousOwners: [...(it.previousOwners || []), entry] });
                close();
                toast("Past owner added.", "success");
                ctx.refresh();
            };
        },
    });
}

function transferItem(it, ctx) {
    const repo = store.get("items", it.key);
    if (!repo) return;
    openModal({
        title: "Transfer ownership",
        subtitle: "The current keeper moves into the preserved chain and the new keeper takes over.",
        body: `<div class="field"><label>New owner</label><select class="input" data-t-owner><option value="">Leave owner unknown / lost</option>${store.all("characters").sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${esc(c.key)}" ${repo.ownerId === c.key ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
               <div class="field"><label>Date of transfer</label><input class="input" type="date" data-t-date /></div>
               <div class="field"><label>How it changed hands</label><input class="input" data-t-note placeholder="Stolen in the Redwater vault raid…" /></div>`,
        foot: `<button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-save>Transfer</button>`,
        onMount: (modal, close) => {
            modal.querySelector("[data-cancel]").onclick = close;
            modal.querySelector("[data-save]").onclick = () => {
                const newOwner = modal.querySelector("[data-t-owner]").value;
                const date = modal.querySelector("[data-t-date]").value || new Date().toISOString().slice(0, 10);
                const note = modal.querySelector("[data-t-note]").value.trim();
                const previous = [...(repo.previousOwners || [])];
                if (repo.ownerId) {
                    previous.push({ characterId: repo.ownerId, from: "", to: date, note: note || "Ownership transferred" });
                }
                store.save("items", { ...repo, previousOwners: previous, ownerId: newOwner });
                close();
                toast(newOwner ? "Ownership transferred." : "Item marked as lost.", "success");
                ctx.refresh();
            };
        },
    });
}
