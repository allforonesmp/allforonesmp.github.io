/* Factions: directory, membership history, diplomacy and timeline */

import { store } from "../core/store.js";
import { GraphView } from "../core/graph.js";
import { icon } from "../core/icons.js";
import { esc, fmtDate, fmtDateShort, avatarHtml, truncate, unique } from "../core/util.js";
import { FACTION_STATUS, CANON } from "../core/schema.js";
import { eventsForFaction, storylinesForFaction, charactersInFaction, locationOf } from "../core/selectors.js";
import { factionCard, statusPill, canonBadge, importanceBars, refChips, castChips, emptyState, categoryMeta, CATEGORY_COLORS, categoryIcon } from "../components/cards.js";
import { openEntityForm, confirmDialog, toast, openModal, openLightbox } from "../components/ui.js";
import { openQuickView } from "../components/details.js";

export const flush = false;
let dirState = { query: "", status: "", sort: "name" };

export function heading(ctx) {
    const key = ctx.params.id;
    if (key) return store.nameOf("factions", key) || "Faction";
    return "Factions";
}

export function render(ctx) {
    const key = ctx.params.id;
    return key ? renderDetail(ctx, key) : renderDirectory(ctx);
}

function renderDirectory(ctx) {
    const factions = store.all("factions").filter((f) => !f.archived);
    return `<div class="page faction-page">
        <div class="page-head">
            <div>
                <div class="eyebrow">Powers of the world</div>
                <h2>Factions</h2>
                <p>${factions.length} factions, ${store.all("characters").length} characters and the alliances, betrayals and successions between them.</p>
            </div>
            <div class="actions">
                <button class="btn primary" data-new-faction>${icon("plus")} New faction</button>
            </div>
        </div>

        <div class="toolbar">
            <div class="filter-input">${icon("search")}<input data-fac-search placeholder="Search factions, ideology, territory…" value="${esc(dirState.query)}" /></div>
            <select class="filter-sel" data-fac-status><option value="">Any status</option>${FACTION_STATUS.map((s) => `<option value="${s.value}">${s.label}</option>`).join("")}</select>
            <select class="filter-sel" data-fac-sort>
                <option value="name">A → Z</option>
                <option value="members">Most members</option>
                <option value="importance">Most important</option>
                <option value="founded">Oldest first</option>
            </select>
            <span class="spacer"></span>
            <span class="tiny dim">${icon("info")} Faction pages keep every former member and leader.</span>
        </div>

        <div class="faction-grid" data-fac-grid></div>
    </div>`;
}

function renderDetail(ctx, key) {
    const f = store.get("factions", key);
    if (!f) return `<div class="page">${emptyState({ icon: "factions", title: "Faction not found", text: "It may have been deleted.", action: `<a class="btn sm" href="#/factions">${icon("arrowLeft")} All factions</a>` })}</div>`;
    const members = charactersInFaction(f.key);
    const leader = f.leaderId ? store.get("characters", f.leaderId) : null;
    const events = eventsForFaction(f.key).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const storylines = storylinesForFaction(f.key);
    const history = Array.isArray(f.membershipHistory) ? f.membershipHistory : [];
    const notes = Array.isArray(f.history) ? f.history : [];
    const allies = (f.allyIds || []).map((id) => store.get("factions", id)).filter(Boolean);
    const enemies = (f.enemyIds || []).map((id) => store.get("factions", id)).filter(Boolean);
    const splitsFrom = (f.splitFromIds || []).map((id) => store.get("factions", id)).filter(Boolean);
    const successors = (f.mergedIntoIds || []).map((id) => store.get("factions", id)).filter(Boolean);
    const controlled = (f.locationIds || []).map((id) => store.get("locations", id)).filter(Boolean);
    const color = f.color || "#77d29a";

    return `<div class="page faction-detail" style="--fac:${esc(color)}">
        <a class="back-link" href="#/factions">${icon("arrowLeft")} All factions</a>
        <header class="faction-hero">
            <div class="faction-hero-glow"></div>
            <div class="faction-emblem">${f.logoUrl ? `<img src="${esc(f.logoUrl)}" alt="" />` : `<span>${esc((f.name || "?").slice(0, 2).toUpperCase())}</span>`}</div>
            <div class="faction-hero-copy">
                <div class="row wrap gap-6">${statusPill(f.status)}${canonBadge(f.canon)}<span class="chip">${icon("flag")} Founded ${esc(f.founded ? fmtDate(f.founded) : "unknown")}</span></div>
                <h2>${esc(f.name)}</h2>
                ${f.tagline ? `<p class="faction-motto">“${esc(f.tagline)}”</p>` : ""}
                <div class="row wrap gap-8" style="margin-top:12px">
                    ${leader ? `<a class="chip gold" href="#/characters/${esc(leader.key)}">${avatarHtml(leader.name, { username: leader.username, size: "xs" })} Leader · ${esc(leader.name)}</a>` : ""}
                    ${controlled.length ? `<span class="chip">${icon("pin")} ${controlled.length} location${controlled.length === 1 ? "" : "s"}</span>` : ""}
                    ${importanceBars(f.importance, "lg")}
                </div>
            </div>
            <div class="faction-hero-actions">
                <button class="btn sm" data-edit-faction>${icon("edit")} Edit</button>
                <button class="btn sm ghost" data-fac-menu>${icon("more")}</button>
            </div>
            <div class="faction-stat-strip">
                <div><b>${members.length}</b><span>Members now</span></div>
                <div><b>${history.length}</b><span>Past affiliations</span></div>
                <div><b>${allies.length}</b><span>Allies</span></div>
                <div><b>${enemies.length}</b><span>Enemies</span></div>
                <div><b>${events.length}</b><span>Events</span></div>
                <div><b>${storylines.length}</b><span>Storylines</span></div>
            </div>
        </header>

        <div class="faction-layout">
            <div class="faction-main">
                ${f.description || f.ideology ? `<section class="panel"><div class="panel-head"><h3>${icon("book")} Identity</h3></div><div class="panel-body prose"><p>${esc(f.description || "")}</p>${f.ideology ? `<h4>Ideology</h4><p>${esc(f.ideology)}</p>` : ""}${(f.objectives || []).length ? `<h4>Objectives</h4><ul>${f.objectives.map((o) => `<li>${esc(typeof o === "string" ? o : o.text || "")}</li>`).join("")}</ul>` : ""}</div></section>` : ""}

                <section class="panel">
                    <div class="panel-head"><h3>${icon("characters")} Leadership & membership</h3><span class="sub">${members.length} active · ${history.length} preserved</span>
                        <div class="right"><button class="btn sm ghost" data-add-member>${icon("plus")} Add member</button></div>
                    </div>
                    <div class="panel-body">
                        <div class="member-grid">
                            ${members.map((c) => `<a class="member-tile ${c.key === f.leaderId ? "is-leader" : ""}" href="#/characters/${esc(c.key)}">
                                ${avatarHtml(c.name, { username: c.username, image: c.portraitUrl, size: "md" })}
                                <span><b>${esc(c.name)}</b><span class="tiny dim">${esc(c.occupation || "Member")}</span></span>
                                ${c.key === f.leaderId ? `<span class="leader-tag">${icon("crown")} Leader</span>` : ""}
                            </a>`).join("") || `<div class="quiet">No active members recorded.</div>`}
                        </div>
                        ${(f.memberIds || []).length ? `<div class="tiny dim" style="margin-top:8px">${(f.memberIds || []).length} linked in the roster.</div>` : ""}
                    </div>
                    ${history.length ? `<div class="panel-sub-head"><h4>${icon("clock")} Past affiliations <span class="tiny dim">never overwritten</span></h4></div>
                    <div class="table-wrap"><table class="data-table"><thead><tr><th>Character</th><th>Role</th><th>Joined</th><th>Left</th><th>Why they left</th></tr></thead><tbody>
                        ${history.map((h) => `<tr>
                            <td>${h.characterId ? `<a class="row gap-6" href="#/characters/${esc(h.characterId)}">${avatarHtml(store.nameOf("characters", h.characterId) || "Unknown", { username: (store.get("characters", h.characterId) || {}).username, size: "xs" })} ${esc(store.nameOf("characters", h.characterId) || "Unknown")}</a>` : "—"}</td>
                            <td>${esc(h.role || "—")}</td>
                            <td class="mono">${esc(h.from ? fmtDateShort(h.from) : "—")}</td>
                            <td class="mono">${esc(h.to ? fmtDateShort(h.to) : "present")}</td>
                            <td class="dim">${esc(h.note || h.reason || "—")}</td>
                        </tr>`).join("")}
                    </tbody></table></div>` : ""}
                </section>

                <section class="panel">
                    <div class="panel-head"><h3>${icon("timeline")} Faction timeline</h3><span class="sub">${events.length} events</span>
                        <div class="right"><button class="btn sm ghost" data-fac-log>${icon("plus")} Add historical note</button></div>
                    </div>
                    <div class="panel-body">
                        ${buildTimeline(f, history, events, notes)}
                    </div>
                </section>

                <section class="panel">
                    <div class="panel-head"><h3>${icon("network")} Diplomatic web</h3><span class="sub">alliances, rivalries and members</span>
                        <div class="right"><button class="btn sm ghost" data-fac-fit>${icon("maximize")} Fit</button></div>
                    </div>
                    <div class="fac-graph" data-fac-graph></div>
                </section>

                ${f.images && f.images.length ? `<section class="panel"><div class="panel-head"><h3>${icon("image")} Media</h3></div><div class="panel-body"><div class="media-strip">${f.images.map((src, i) => `<button class="media-thumb" data-fac-img="${i}"><img src="${esc(typeof src === "string" ? src : src.url || "")}" alt="" loading="lazy" /></button>`).join("")}</div></div></section>` : ""}
            </div>

            <aside class="faction-side">
                <section class="panel">
                    <div class="panel-head"><h3>${icon("links")} Diplomacy</h3></div>
                    <div class="panel-body">
                        <div class="side-block"><h5>Allies</h5><div class="row wrap gap-4">${allies.map((a) => `<a class="chip green" href="#/factions/${esc(a.key)}">${esc(a.name)}</a>`).join("") || `<span class="tiny dim">None recorded</span>`}</div></div>
                        <div class="side-block"><h5>Enemies</h5><div class="row wrap gap-4">${enemies.map((a) => `<a class="chip red" href="#/factions/${esc(a.key)}">${esc(a.name)}</a>`).join("") || `<span class="tiny dim">None recorded</span>`}</div></div>
                        ${splitsFrom.length ? `<div class="side-block"><h5>Split from</h5><div class="row wrap gap-4">${splitsFrom.map((a) => `<a class="chip" href="#/factions/${esc(a.key)}">${esc(a.name)}</a>`).join("")}</div></div>` : ""}
                        ${successors.length ? `<div class="side-block"><h5>Successors</h5><div class="row wrap gap-4">${successors.map((a) => `<a class="chip" href="#/factions/${esc(a.key)}">${esc(a.name)}</a>`).join("")}</div></div>` : ""}
                    </div>
                </section>
                <section class="panel">
                    <div class="panel-head"><h3>${icon("pin")} Territory</h3></div>
                    <div class="panel-body">
                        ${f.territory ? `<p class="small">${esc(f.territory)}</p>` : ""}
                        <div class="stack gap-4">${controlled.map((l) => `<a class="list-line" href="#/locations/${esc(l.key)}">${icon("pin")}<span>${esc(l.name)}</span><span class="tiny dim">${esc(l.type || "")}</span></a>`).join("") || `<span class="tiny dim">No controlled locations recorded.</span>`}</div>
                    </div>
                </section>
                <section class="panel">
                    <div class="panel-head"><h3>${icon("storylines")} Storylines</h3></div>
                    <div class="panel-body stack gap-4">
                        ${storylines.map((s) => `<a class="list-line" href="#/storylines/${esc(s.key)}">${icon("storylines")}<span>${esc(s.name)}</span>${statusPill(s.status)}</a>`).join("") || `<span class="tiny dim">No storylines attached.</span>`}
                    </div>
                </section>
                <section class="panel">
                    <div class="panel-head"><h3>${icon("info")} At a glance</h3></div>
                    <div class="panel-body meta-list">
                        <div><span>Status</span><b>${esc((FACTION_STATUS.find((s) => s.value === f.status) || {}).label || "—")}</b></div>
                        <div><span>Canon</span><b>${esc((CANON.find((s) => s.value === f.canon) || {}).label || "Confirmed canon")}</b></div>
                        <div><span>Founded</span><b>${esc(f.founded ? fmtDate(f.founded) : "—")}</b></div>
                        <div><span>Dissolved</span><b>${esc(f.dissolved ? fmtDate(f.dissolved) : "—")}</b></div>
                        <div><span>Banner</span><b><i class="swatch" style="background:${esc(color)}"></i> ${esc(color)}</b></div>
                    </div>
                </section>
            </aside>
        </div>
    </div>`;
}

function buildTimeline(f, history, events, notes) {
    const items = [];
    if (f.founded) items.push({ date: f.founded, kind: "founding", title: `${f.name} is founded`, body: f.tagline || "", icon: "flag" });
    history.forEach((h) => {
        if (h.from) items.push({ date: h.from, kind: "join", title: `${store.nameOf("characters", h.characterId) || "A character"} joins`, body: `${h.role || "Member"}${h.note ? ` — ${h.note}` : ""}`, icon: "plus", href: h.characterId ? `#/characters/${h.characterId}` : "" });
        if (h.to) items.push({ date: h.to, kind: "leave", title: `${store.nameOf("characters", h.characterId) || "A character"} leaves`, body: h.note || "", icon: "logout", href: h.characterId ? `#/characters/${h.characterId}` : "" });
    });
    events.forEach((ev) => items.push({ date: ev.date, kind: "event", title: ev.title, body: ev.summary || "", icon: categoryIcon(ev.category), color: CATEGORY_COLORS[ev.category], eventKey: ev.key }));
    notes.forEach((n) => {
        const text = typeof n === "string" ? n : n.text || n.note || "";
        const date = typeof n === "string" ? "" : n.date || "";
        items.push({ date, kind: "note", title: text, body: "", icon: "book" });
    });
    if (f.dissolved) items.push({ date: f.dissolved, kind: "dissolved", title: `${f.name} dissolves`, body: "The banner is lowered.", icon: "archive" });
    items.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
    if (!items.length) return `<div class="quiet">No history recorded. Add a founding date or a historical note to begin the timeline.</div>`;
    return `<ol class="fac-timeline">${items.map((it) => `<li class="ft-item ft-${it.kind}">
        <span class="ft-marker" style="--ftc:${it.color || "var(--fac)"}">${icon(it.icon)}</span>
        <div class="ft-body">
            <div class="ft-date mono">${esc(it.date ? fmtDate(it.date) : "Undated")}</div>
            ${it.eventKey ? `<button class="ft-title linklike" data-view-event="${esc(it.eventKey)}">${esc(it.title)}</button>` : it.href ? `<a class="ft-title" href="${it.href}">${esc(it.title)}</a>` : `<div class="ft-title">${esc(it.title)}</div>`}
            ${it.body ? `<div class="tiny dim">${esc(it.body)}</div>` : ""}
        </div>
    </li>`).join("")}</ol>`;
}

export function mount(root, ctx) {
    if (!ctx.params.id) return mountDirectory(root, ctx);
    return mountDetail(root, ctx);
}

function mountDirectory(root, ctx) {
    const grid = root.querySelector("[data-fac-grid]");
    root.querySelector("[data-fac-status]").value = dirState.status;
    root.querySelector("[data-fac-sort]").value = dirState.sort;
    const draw = () => {
        const q = dirState.query.trim().toLowerCase();
        let list = store.all("factions").filter((f) => !f.archived);
        if (dirState.status) list = list.filter((f) => f.status === dirState.status);
        if (q) list = list.filter((f) => `${f.name} ${f.tagline || ""} ${f.description || ""} ${f.ideology || ""} ${f.territory || ""}`.toLowerCase().includes(q));
        if (dirState.sort === "members") list.sort((a, b) => charactersInFaction(b.key).length - charactersInFaction(a.key).length);
        else if (dirState.sort === "importance") list.sort((a, b) => (b.importance || 0) - (a.importance || 0));
        else if (dirState.sort === "founded") list.sort((a, b) => (a.founded || "9999").localeCompare(b.founded || "9999"));
        else list.sort((a, b) => a.name.localeCompare(b.name));
        grid.innerHTML = list.length
            ? list.map((f) => factionCard(f)).join("")
            : emptyState({ icon: "factions", title: "No factions found", text: "Create a faction or clear the filters.", action: `<button class="btn sm primary" data-new-faction>${icon("plus")} New faction</button>` });
    };
    root.querySelector("[data-fac-search]").addEventListener("input", (e) => { dirState.query = e.target.value; draw(); });
    root.querySelector("[data-fac-status]").addEventListener("change", (e) => { dirState.status = e.target.value; draw(); });
    root.querySelector("[data-fac-sort]").addEventListener("change", (e) => { dirState.sort = e.target.value; draw(); });
    root.addEventListener("click", (e) => {
        if (e.target.closest("[data-new-faction]")) openEntityForm({ type: "factions", onSaved: () => { draw(); ctx.refresh(); } });
    });
    draw();
}

function mountDetail(root, ctx) {
    const f = store.get("factions", ctx.params.id);
    if (!f) return;
    const canvas = root.querySelector("[data-fac-graph]");
    let graph = null;
    if (canvas) {
        const nodes = [];
        const edges = [];
        const addNode = (rec, type) => {
            const id = `${type}:${rec.key}`;
            if (!nodes.some((n) => n.id === id)) nodes.push({ id, type, key: rec.key, record: rec });
            return id;
        };
        const selfId = addNode(f, "factions");
        (f.allyIds || []).forEach((id) => {
            const other = store.get("factions", id);
            if (!other) return;
            edges.push({ id: `ally:${id}`, from: selfId, to: addNode(other, "factions"), kind: "ally", label: "Alliance" });
        });
        (f.enemyIds || []).forEach((id) => {
            const other = store.get("factions", id);
            if (!other) return;
            edges.push({ id: `enemy:${id}`, from: selfId, to: addNode(other, "factions"), kind: "enemy", label: "Enmity" });
        });
        const members = charactersInFaction(f.key);
        members.forEach((c) => {
            const cid = addNode(c, "characters");
            edges.push({ id: `member:${c.key}`, from: selfId, to: cid, kind: "historic", label: c.key === f.leaderId ? "Leads" : "Member", dashed: c.key !== f.leaderId });
        });
        (f.splitFromIds || []).forEach((id) => {
            const other = store.get("factions", id);
            if (!other) return;
            edges.push({ id: `split:${id}`, from: addNode(other, "factions"), to: selfId, kind: "conflict", label: "Split from", dashed: true });
        });
        (f.mergedIntoIds || []).forEach((id) => {
            const other = store.get("factions", id);
            if (!other) return;
            edges.push({ id: `merge:${id}`, from: selfId, to: addNode(other, "factions"), kind: "family", label: "Merged into", dashed: true });
        });
        graph = new GraphView(canvas, {
            edgeColors: store.prefs().edgeColors,
            onNodeClick: (node) => {
                if (node.type === "characters") {
                    openQuickView("characters", node.key);
                } else if (node.key !== f.key) {
                    location.hash = `#/factions/${node.key}`;
                }
            },
            onNodeOpen: (node) => (location.hash = node.type === "characters" ? `#/characters/${node.key}` : `#/factions/${node.key}`),
        });
        graph.setData({ nodes, edges }, { fit: true });
        requestAnimationFrame(() => graph.fit());
    }

    const edit = () => openEntityForm({ type: "factions", record: store.get("factions", f.key), onSaved: () => ctx.refresh(), onDeleted: () => { location.hash = "#/factions"; } });

    root.addEventListener("click", (e) => {
        if (e.target.closest("[data-edit-faction]")) edit();
        if (e.target.closest("[data-fac-fit]") && graph) graph.fit();
        if (e.target.closest("[data-add-member]")) addMember(f, ctx);
        if (e.target.closest("[data-fac-log]")) addNote(f, ctx);
        const img = e.target.closest("[data-fac-img]");
        if (img) openLightbox((f.images || []).map((x) => (typeof x === "string" ? x : x.url || "")), Number(img.dataset.facImg));
        if (e.target.closest("[data-fac-menu]")) {
            openModal({
                title: "Faction actions",
                size: "narrow",
                body: `<div class="stack gap-6">
                    <button class="menu-line" data-act="edit">${icon("edit")} Edit details</button>
                    <button class="menu-line" data-act="dup">${icon("copy")} Duplicate faction</button>
                    <button class="menu-line" data-act="archive">${icon("archive")} ${f.archived ? "Unarchive" : "Archive"}</button>
                    <button class="menu-line danger" data-act="delete">${icon("trash")} Delete faction</button>
                </div>`,
                onMount: (modal, close) => {
                    modal.querySelector('[data-act="edit"]').onclick = () => { close(); edit(); };
                    modal.querySelector('[data-act="dup"]').onclick = () => {
                        const { key, ...rest } = f;
                        store.save("factions", { ...rest, name: `${f.name} (copy)`, demo: false }, { activity: { text: `Duplicated faction ${f.name}` } });
                        close();
                        toast("Faction duplicated.", "success");
                        ctx.refresh();
                    };
                    modal.querySelector('[data-act="archive"]').onclick = () => {
                        store.save("factions", { ...f, archived: !f.archived });
                        close();
                        toast(f.archived ? "Faction unarchived." : "Faction archived.", "success");
                        ctx.refresh();
                    };
                    modal.querySelector('[data-act="delete"]').onclick = () => {
                        close();
                        confirmDialog({
                            title: "Delete this faction?",
                            message: `Delete <b>${esc(f.name)}</b>? Members stay, but the faction, its history and diplomacy are removed. Consider archiving instead.`,
                            confirmLabel: "Delete faction",
                            onConfirm: () => {
                                store.remove("factions", { key: f.key, cleanup: true });
                                toast("Faction deleted.", "success");
                                location.hash = "#/factions";
                            },
                        });
                    };
                },
            });
        }
    });

    return () => {
        if (graph) graph.destroy();
    };
}

function addMember(f, ctx) {
    const current = new Set(f.memberIds || []);
    const available = store.all("characters").filter((c) => !current.has(c.key));
    openModal({
        title: "Add to the roster",
        subtitle: `New members join ${f.name} now; previous affiliations stay in the timeline.`,
        body: `<div class="field"><label>Character</label><select class="input" data-member-id><option value="">Select a character…</option>${available.map((c) => `<option value="${esc(c.key)}">${esc(c.name)}</option>`).join("")}</select></div>
               <div class="field"><label>Role</label><input class="input" data-member-role placeholder="e.g. Scout, Treasurer, Leader" /></div>
               <div class="field"><label>Joined on</label><input class="input" type="date" data-member-from /></div>
               <div class="field"><label>Note</label><input class="input" data-member-note placeholder="Why they joined" /></div>`,
        foot: `<button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-save>Add member</button>`,
        onMount: (modal, close) => {
            modal.querySelector("[data-cancel]").onclick = close;
            modal.querySelector("[data-save]").onclick = () => {
                const id = modal.querySelector("[data-member-id]").value;
                if (!id) return toast("Choose a character first.", "error");
                const role = modal.querySelector("[data-member-role]").value.trim();
                const from = modal.querySelector("[data-member-from]").value;
                const note = modal.querySelector("[data-member-note]").value.trim();
                const memberIds = unique([...(f.memberIds || []), id]);
                const membershipHistory = [...(f.membershipHistory || [])];
                if (from) membershipHistory.push({ characterId: id, role, from, to: "", note });
                store.save("factions", { ...f, memberIds, membershipHistory, leaderId: f.leaderId || (role.toLowerCase().includes("leader") ? id : f.leaderId) });
                close();
                toast("Member added.", "success");
                ctx.refresh();
            };
        },
    });
}

function addNote(f, ctx) {
    openModal({
        title: "Add a historical note",
        subtitle: "Notes appear on the faction timeline in date order.",
        body: `<div class="field"><label>What happened</label><textarea class="input" rows="4" data-note-text placeholder="e.g. The Split of the Northern Hall…"></textarea></div>
               <div class="field"><label>Date</label><input class="input" type="date" data-note-date /></div>`,
        foot: `<button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-save>Add note</button>`,
        onMount: (modal, close) => {
            modal.querySelector("[data-cancel]").onclick = close;
            modal.querySelector("[data-save]").onclick = () => {
                const text = modal.querySelector("[data-note-text]").value.trim();
                if (!text) return toast("Write the note first.", "error");
                const date = modal.querySelector("[data-note-date]").value;
                store.save("factions", { ...f, history: [...(f.history || []), { text, date }] });
                close();
                toast("History note added.", "success");
                ctx.refresh();
            };
        },
    });
}
