/* Relationship visualiser and record history */

import { store } from "../core/store.js";
import { GraphView } from "../core/graph.js";
import { icon } from "../core/icons.js";
import { esc, fmtDate, fmtDateShort, debounce, avatarHtml, truncate, initials } from "../core/util.js";
import { RELATION_TYPES, RELATION_STATUS, CHARACTER_STATUS } from "../core/schema.js";
import { relationshipsOf, relationshipBetween } from "../core/selectors.js";
import { relationMeta, statusPill, canonBadge, emptyState, characterCard } from "../components/cards.js";
import { openEntityForm, openModal, confirmDialog, toast, openPopover, closePopover } from "../components/ui.js";
import { openQuickView } from "../components/details.js";

export const flush = false;
let filter = { query: "", type: "", status: "", character: "" };
let relPositions = loadPositions();
let graphRef = null;

function loadPositions() {
    try {
        return JSON.parse(localStorage.getItem("afo_sp_rel_positions") || "{}");
    } catch (err) {
        return {};
    }
}

export function heading() {
    return "Relationships";
}

export function render() {
    const relationships = store.all("relationships");
    const counts = RELATION_TYPES.map((t) => ({ ...t, count: relationships.filter((r) => r.type === t.value).length })).filter((t) => t.count);
    return `<div class="page rel-page">
        <div class="page-head">
            <div>
                <div class="eyebrow">The social web</div>
                <h2>Who is connected to whom</h2>
                <p>${relationships.length} relationships between ${store.all("characters").length} characters. Every relationship keeps its full history — a friendship can become a betrayal and an alliance again without losing either chapter.</p>
            </div>
            <div class="actions">
                <a class="btn" href="#/map">${icon("map")} Full story map</a>
                <button class="btn primary" data-new-rel>${icon("plus")} New relationship</button>
            </div>
        </div>

        <div class="toolbar">
            <div class="filter-input">${icon("search")}<input data-rel-search placeholder="Search description or history…" value="${esc(filter.query)}" /></div>
            <select class="filter-sel" data-rel-type>
                <option value="">All relationship types</option>
                ${RELATION_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}
            </select>
            <select class="filter-sel" data-rel-status>
                <option value="">Any status</option>
                ${RELATION_STATUS.map((s) => `<option value="${s.value}">${s.label}</option>`).join("")}
            </select>
            <select class="filter-sel" data-rel-character>
                <option value="">Any character</option>
                ${store.all("characters").sort((a, b) => String(a.name || a.username || "").localeCompare(String(b.name || b.username || ""))).map((c) => `<option value="${c.key}">${esc(c.name || c.username || "Unnamed character")}</option>`).join("")}
            </select>
            <span class="spacer"></span>
            <span class="result-count" data-rel-count></span>
        </div>

        <div class="rel-layout">
            <section class="panel rel-graph-panel">
                <div class="panel-head">
                    <h3>${icon("network")} Relationship graph</h3>
                    <span class="sub">click a character to isolate their connections</span>
                    <div class="right">
                        <button class="btn sm ghost" data-rel-fit>${icon("maximize")} Fit</button>
                        <button class="btn sm ghost" data-rel-arrange>${icon("sparkles")} Arrange</button>
                    </div>
                </div>
                <div class="rel-canvas" data-rel-canvas></div>
                <div class="rel-legend">
                    ${RELATION_TYPES.slice(0, 8).map((t) => `<span class="rel-legend-item"><i style="background:${t.color}"></i>${esc(t.label)}</span>`).join("")}
                </div>
            </section>
            <aside class="panel rel-side" data-rel-side>
                <div class="panel-head"><h3>${icon("info")} Selection</h3></div>
                <div class="panel-body" data-rel-side-body></div>
            </aside>
        </div>

        <section class="panel">
            <div class="panel-head"><h3>${icon("relationships")} Relationship records</h3><span class="sub">${relationships.length} total</span>
                <div class="right"><button class="btn sm ghost" data-rel-create>${icon("plus")} Add</button></div>
            </div>
            <div class="panel-body">
                <div class="rel-type-stats">
                    ${counts.map((t) => `<button class="rel-type-stat" data-rel-filter-type="${t.value}" style="--rc:${t.color}"><span class="rts-count">${t.count}</span><span class="rts-label">${esc(t.label)}</span></button>`).join("") || '<span class="dim small">No relationships recorded yet.</span>'}
                </div>
                <div data-rel-records></div>
            </div>
        </section>
    </div>`;
}

export function mount(root, ctx) {
    const canvas = root.querySelector("[data-rel-canvas]");
    const sideBody = root.querySelector("[data-rel-side-body]");
    const recordsEl = root.querySelector("[data-rel-records]");

    root.querySelector("[data-rel-type]").value = filter.type;
    root.querySelector("[data-rel-status]").value = filter.status;
    root.querySelector("[data-rel-character]").value = filter.character;

    const matches = (r) => {
        if (filter.type && r.type !== filter.type) return false;
        if (filter.status && r.status !== filter.status) return false;
        if (filter.character && r.aId !== filter.character && r.bId !== filter.character) return false;
        if (filter.query) {
            const q = filter.query.toLowerCase();
            if (!`${r.description || ""} ${r.history || ""} ${r.met || ""}`.toLowerCase().includes(q)) return false;
        }
        return true;
    };

    const currentRelationships = () => store.all("relationships").filter(matches);

    const buildData = () => {
        const rels = currentRelationships();
        const charIds = new Set();
        rels.forEach((r) => {
            charIds.add(r.aId);
            charIds.add(r.bId);
        });
        // keep isolated characters visible when a specific character filter is applied
        if (filter.character) charIds.add(filter.character);
        const nodes = [...charIds]
            .map((id) => store.get("characters", id))
            .filter(Boolean)
            .map((c) => ({ id: `characters:${c.key}`, type: "characters", key: c.key, record: c }));
        const edges = rels.map((r) => {
            const meta = relationMeta(r.type);
            return {
                id: `rel:${r.key}`,
                from: `characters:${r.aId}`,
                to: `characters:${r.bId}`,
                fromType: "characters",
                fromKey: r.aId,
                toType: "characters",
                toKey: r.bId,
                kind: meta.kind,
                label: meta.label,
                date: r.startDate,
                source: "relationship",
                recordKey: r.key,
                dashed: ["ended", "broken"].includes(r.status) || r.canon === "planned",
            };
        });
        return { nodes, edges };
    };

    const renderSide = (characterId = null) => {
        if (characterId) {
            const c = store.get("characters", characterId);
            if (!c) return;
            const rels = store.all("relationships").filter((r) => r.aId === characterId || r.bId === characterId);
            sideBody.innerHTML = `
                <div class="rel-focus-head">
                    ${avatarHtml(c.name, { username: c.username, image: c.portraitUrl, size: "lg" })}
                    <div><b>${esc(c.name)}</b><span class="tiny dim">${esc(c.occupation || "role unknown")}</span></div>
                    <button class="icon-btn" data-rel-clear aria-label="Clear">${icon("x")}</button>
                </div>
                <div class="row wrap gap-4" style="margin-bottom:10px">${statusPill(c.status)}${store.nameOf("factions", c.factionId) ? `<span class="chip">${esc(store.nameOf("factions", c.factionId))}</span>` : ""}</div>
                <div class="rel-side-list">
                    ${rels
                        .map((r) => {
                            const other = store.get("characters", r.aId === characterId ? r.bId : r.aId);
                            const meta = relationMeta(r.type);
                            return `<button class="rel-side-item" data-open-rel="${esc(r.key)}">
                                ${avatarHtml(other?.name || "?", { username: other?.username, size: "sm" })}
                                <span style="min-width:0"><b class="truncate">${esc(other?.name || "Unknown")}</b><span class="tiny" style="color:${meta.color}">${esc(meta.label)}</span></span>
                                <span class="tiny dim">${esc(r.startDate ? fmtDateShort(r.startDate) : "")}</span>
                            </button>`;
                        })
                        .join("") || `<div class="quiet">No relationships recorded.</div>`}
                </div>
                <a class="btn sm full" href="#/characters/${esc(c.key)}" style="margin-top:10px">${icon("external")} Open profile</a>`;
            return;
        }
        const rels = currentRelationships();
        sideBody.innerHTML = rels.length
            ? `<div class="rel-side-summary">${icon("network")} <div><b>${rels.length} relationships</b><span class="tiny dim">in the current filter</span></div></div>
               <div class="rel-side-list">
               ${rels
                   .slice(0, 24)
                   .map((r) => {
                       const a = store.get("characters", r.aId);
                       const b = store.get("characters", r.bId);
                       const meta = relationMeta(r.type);
                       return `<button class="rel-side-item" data-open-rel="${esc(r.key)}">
                           <span class="rel-pair">${avatarHtml(a?.name || "?", { username: a?.username, size: "xs" })}${avatarHtml(b?.name || "?", { username: b?.username, size: "xs" })}</span>
                           <span style="min-width:0"><b class="truncate">${esc(a?.name || "?")} & ${esc(b?.name || "?")}</b><span class="tiny" style="color:${meta.color}">${esc(meta.label)} · ${esc(r.status || "")}</span></span>
                       </button>`;
                   })
                   .join("")}
               </div>
               <div class="tiny dim" style="margin-top:10px">${icon("info")} Click a node to isolate one character's relationships.</div>`
            : `<div class="quiet">No relationships match the current filters.</div>`;
    };

    const renderRecords = () => {
        const rels = currentRelationships();
        const countEl = root.querySelector("[data-rel-count]");
        if (countEl) countEl.textContent = `${rels.length} of ${store.all("relationships").length}`;
        recordsEl.innerHTML = rels.length
            ? `<div class="rel-records">${rels
                  .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))
                  .map(
                      (r) => {
                          const a = store.get("characters", r.aId);
                          const b = store.get("characters", r.bId);
                          const meta = relationMeta(r.type);
                          return `<div class="rel-record" style="--rc:${meta.color}">
                              <div class="rel-record-main">
                                  <div class="rel-record-pair">
                                      <a href="#/characters/${esc(a?.key || "")}" class="rel-avatar-link">${avatarHtml(a?.name || "?", { username: a?.username, size: "md" })}</a>
                                      <span class="rel-link-badge">${icon("link")}</span>
                                      <a href="#/characters/${esc(b?.key || "")}" class="rel-avatar-link">${avatarHtml(b?.name || "?", { username: b?.username, size: "md" })}</a>
                                  </div>
                                  <div class="rel-record-copy">
                                      <div class="row wrap gap-4"><b>${esc(a?.name || "?")} & ${esc(b?.name || "?")}</b><span class="chip" style="color:${meta.color}">${esc(meta.label)}</span>${statusPill(r.status)}${canonBadge(r.canon)}${r.secret ? `<span class="chip violet">${icon("lock")} Secret</span>` : ""}</div>
                                      <p class="clamp-2">${esc(r.description || "")}</p>
                                      <div class="tiny dim mono">${esc(r.startDate ? fmtDate(r.startDate) : "Undated")} → ${esc(r.endDate ? fmtDate(r.endDate) : "ongoing")}</div>
                                  </div>
                                  <button class="icon-btn" data-edit-rel="${esc(r.key)}" title="Edit relationship">${icon("edit")}</button>
                              </div>
                              ${(r.evolution || []).length ? `<div class="rel-evolution">${r.evolution.map((e, i) => `<span class="evo-step" style="--ec:${relationMeta(e.type).color}"><i></i><b>${esc(e.label || relationMeta(e.type).label)}</b><span class="tiny dim">${esc(e.date ? fmtDateShort(e.date) : "")}</span></span>${i < r.evolution.length - 1 ? `<span class="evo-arrow">${icon("arrowRight")}</span>` : ""}`).join("")}</div>` : ""}
                          </div>`;
                      },
                  )
                  .join("")}</div>`
            : emptyState({ icon: "relationships", title: "No relationship records", text: "Connect two characters to see their history here and on the graph.", action: `<button class="btn sm primary" data-rel-create>${icon("plus")} New relationship</button>` });
    };

    const graph = new GraphView(canvas, {
        edgeColors: store.prefs().edgeColors,
        onPositionsChange: debounce((positions) => {
            relPositions = { ...relPositions, ...positions };
            try {
                localStorage.setItem("afo_sp_rel_positions", JSON.stringify(relPositions));
            } catch (err) {}
        }, 400),
        onNodeClick: (node) => {
            renderSide(node.key);
            graph.setFilteredHighlight(null);
        },
        onSelectionChange: (ids) => {
            if (!ids.length) renderSide(null);
            else if (ids.length === 1) {
                const node = graph.nodes.find((n) => n.id === ids[0]);
                if (node) renderSide(node.key);
            }
        },
        onEdgeClick: (id) => {
            const edge = graph.edges.find((e) => e.id === id);
            if (edge) openQuickView("relationships", edge.recordKey);
        },
        onNodeOpen: (node) => (location.hash = `#/characters/${node.key}`),
        onEdgeContext: (edge) => {
            const rel = store.get("relationships", edge.recordKey);
            if (!rel) return;
            const meta = relationMeta(rel.type);
            openPopover(
                { getBoundingClientRect: () => ({ left: window.innerWidth / 2, right: window.innerWidth / 2, top: 200, bottom: 200 }) },
                `<div class="pop-label">${esc(meta.label)}</div>
                 <button class="pop-item" data-rel-view>${icon("eye")} View history</button>
                 <button class="pop-item" data-rel-edit>${icon("edit")} Edit relationship</button>
                 <div class="pop-sep"></div>
                 <button class="pop-item danger" data-rel-del>${icon("trash")} Delete</button>`,
                {
                    width: 200,
                    onMount: (pop) => {
                        pop.addEventListener("click", (e) => {
                            closePopover();
                            if (e.target.closest("[data-rel-view]")) openQuickView("relationships", rel.key);
                            if (e.target.closest("[data-rel-edit]")) openEntityForm({ type: "relationships", record: rel, onSaved: () => ctx.refresh() });
                            if (e.target.closest("[data-rel-del]")) {
                                confirmDialog({
                                    title: "Delete relationship?",
                                    message: `Remove the relationship between <b>${esc(store.nameOf("characters", rel.aId))}</b> and <b>${esc(store.nameOf("characters", rel.bId))}</b>?`,
                                    onConfirm: () => {
                                        store.remove("relationships", { key: rel.key });
                                        toast("Relationship deleted.", "success");
                                        ctx.refresh();
                                    },
                                });
                            }
                        });
                    },
                },
            );
        },
    });

    const rebuild = () => {
        const data = buildData();
        graph.setData({ nodes: data.nodes, edges: data.edges, positions: relPositions }, { fit: false });
        renderRecords();
        renderSide(filter.character || null);
        if (filter.character) {
            const id = `characters:${filter.character}`;
            if (graph.nodes.some((n) => n.id === id)) graph.focusNode(id, 1.05);
        }
    };
    rebuild();
    requestAnimationFrame(() => graph.fit());
    graphRef = graph;

    /* filters */
    root.querySelector("[data-rel-search]").addEventListener("input", debounce((e) => { filter.query = e.target.value; rebuild(); }, 160));
    root.querySelector("[data-rel-type]").addEventListener("change", (e) => { filter.type = e.target.value; rebuild(); });
    root.querySelector("[data-rel-status]").addEventListener("change", (e) => { filter.status = e.target.value; rebuild(); });
    root.querySelector("[data-rel-character]").addEventListener("change", (e) => { filter.character = e.target.value; rebuild(); });

    root.addEventListener("click", (e) => {
        if (e.target.closest("[data-new-rel]") || e.target.closest("[data-rel-create]")) {
            openEntityForm({ type: "relationships", onSaved: () => ctx.refresh() });
            return;
        }
        if (e.target.closest("[data-rel-fit]")) graph.fit();
        if (e.target.closest("[data-rel-arrange]")) { graph.runLayout(); graph.fit(); }
        if (e.target.closest("[data-rel-clear]")) {
            graph.clearSelection();
            filter.character = "";
            root.querySelector("[data-rel-character]").value = "";
            rebuild();
            return;
        }
        const typeStat = e.target.closest("[data-rel-filter-type]");
        if (typeStat) {
            filter.type = filter.type === typeStat.dataset.relFilterType ? "" : typeStat.dataset.relFilterType;
            root.querySelector("[data-rel-type]").value = filter.type;
            rebuild();
            return;
        }
        const open = e.target.closest("[data-open-rel]");
        if (open) { openQuickView("relationships", open.dataset.openRel); return; }
        const edit = e.target.closest("[data-edit-rel]");
        if (edit) {
            openEntityForm({ type: "relationships", record: store.get("relationships", edit.dataset.editRel), onSaved: () => ctx.refresh(), onDeleted: () => ctx.refresh() });
        }
    });

    return () => {
        graph.destroy();
        graphRef = null;
        closePopover();
    };
}
