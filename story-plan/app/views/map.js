/* Story Map — infinite interactive canvas */

import { store, state } from "../core/store.js";
import { buildGraph } from "../core/selectors.js";
import { GraphView } from "../core/graph.js";
import { icon } from "../core/icons.js";
import { esc, debounce, truncate, uid, fmtDate, navigate, parseHash, bus } from "../core/util.js";
import { EDGE_KINDS, RELATION_TYPES, TYPES, NODE_TYPES, CANON } from "../core/schema.js";
import { openModal, confirmDialog, promptDialog, toast, openEntityForm, openPopover, closePopover } from "../components/ui.js";
import { openQuickView } from "../components/details.js";
import { avatarHtml, relationMeta, statusPill, canonBadge, importanceBars, routeFor, categoryMeta, CATEGORY_COLORS } from "../components/cards.js";

export const flush = true;

let graph = null;
let mapRecord = null;
let currentFilters = null;
let saveStatusEl = null;
let activeCtx = null;

export function heading() {
    return "Story Map";
}

export function render() {
    return `<div class="map-page">
        <div class="map-bar">
            <div class="map-bar-left">
                <button class="map-name-btn" data-map-menu>
                    <span class="map-mark">${icon("map")}</span>
                    <span style="min-width:0"><b data-map-title>Story map</b><span class="tiny dim" data-map-sub>Unsaved canvas</span></span>
                    ${icon("chevronDown")}
                </button>
                <span class="map-save-state tiny dim" data-save-state></span>
            </div>
            <div class="map-bar-center">
                <div class="map-search">
                    ${icon("search")}
                    <input placeholder="Find a node on the map…" data-map-search />
                </div>
                <button class="btn sm" data-toggle-filters>${icon("filter")} Filters <span class="filter-count" data-filter-count></span></button>
            </div>
            <div class="map-bar-right">
                <button class="btn sm" data-toggle-connect title="Drag from a node handle, or click this then two nodes">${icon("link")} Connect</button>
                <button class="btn sm" data-auto-layout title="Re-arrange all nodes">${icon("sparkles")} Arrange</button>
                <div class="map-zoom">
                    <button class="icon-btn" data-zoom-out title="Zoom out">${icon("zoomOut")}</button>
                    <span class="mono" data-zoom-label>100%</span>
                    <button class="icon-btn" data-zoom-in title="Zoom in">${icon("zoomIn")}</button>
                </div>
                <button class="icon-btn" data-fit title="Fit to screen">${icon("maximize")}</button>
                <button class="btn sm primary" data-save-map>${icon("save")} Save layout</button>
            </div>
        </div>
        <div class="map-body">
            <div class="map-canvas" data-canvas></div>

            <aside class="map-side-panel map-filters" data-filters hidden>
                <div class="map-panel-head"><h4>${icon("filter")} Map filters</h4><button class="icon-btn" data-close-filters>${icon("x")}</button></div>
                <div class="map-panel-body">
                    <div class="map-filter-group">
                        <div class="map-filter-label">Node types</div>
                        <div class="type-toggles" data-type-toggles>
                            ${NODE_TYPES.map(
                                (t) => `<button class="type-toggle on" data-type-toggle="${t}" style="--tc:var(--n-${t === "mysteries" ? "mystery" : t.replace(/s$/, "")})">
                                    <span class="tt-dot"></span>${esc(TYPES[t].singular)}<span class="tt-count mono"></span>
                                </button>`,
                            ).join("")}
                        </div>
                    </div>
                    <div class="map-filter-group">
                        <div class="map-filter-label">Connection types</div>
                        <div class="kind-toggles" data-kind-toggles>
                            ${EDGE_KINDS.map(
                                (k) => `<button class="kind-toggle on" data-kind-toggle="${k.value}"><span class="kt-line" style="background:${store.prefs().edgeColors[k.value] || k.color}"></span>${esc(k.label)}</button>`,
                            ).join("")}
                        </div>
                    </div>
                    <div class="map-filter-group">
                        <div class="map-filter-label">Isolate a storyline</div>
                        <select class="select sm" data-focus-storyline>
                            <option value="">All storylines</option>
                            ${store
                                .all("storylines")
                                .map((s) => `<option value="${esc(s.key)}">${esc(s.name)}</option>`)
                                .join("")}
                        </select>
                        <div class="map-filter-label" style="margin-top:10px">Focus a faction</div>
                        <select class="select sm" data-focus-faction>
                            <option value="">All factions</option>
                            ${store
                                .all("factions")
                                .map((f) => `<option value="${esc(f.key)}">${esc(f.name)}</option>`)
                                .join("")}
                        </select>
                        <div class="map-filter-label" style="margin-top:10px">Focus a character</div>
                        <select class="select sm" data-focus-character>
                            <option value="">All characters</option>
                            ${store
                                .all("characters")
                                .map((c) => `<option value="${esc(c.key)}">${esc(c.name)}</option>`)
                                .join("")}
                        </select>
                    </div>
                    <div class="map-filter-group">
                        <label class="checkline"><input type="checkbox" data-toggle-node-labels checked /> Show node labels</label>
                        <label class="checkline"><input type="checkbox" data-toggle-edge-labels checked /> Show connection labels</label>
                        <label class="checkline"><input type="checkbox" data-toggle-spoilers checked /> Show secret connections</label>
                    </div>
                    <div class="row gap-6" style="margin-top:6px">
                        <button class="btn sm full" data-reset-filters>${icon("refresh")} Reset filters</button>
                    </div>
                    <div class="map-filter-note tiny dim">
                        Filters are saved with the map layout. Click a node to inspect it, drag from its corner handle to connect it to another record.
                    </div>
                </div>
            </aside>

            <aside class="map-side-panel map-inspector" data-inspector hidden>
                <div class="map-panel-head"><h4 data-inspector-title>Selection</h4><button class="icon-btn" data-close-inspector>${icon("x")}</button></div>
                <div class="map-panel-body" data-inspector-body></div>
            </aside>

            <div class="map-hint" data-hint>${icon("move")} Drag canvas to pan · scroll to zoom · shift-drag to select</div>

            <div class="map-legend" data-legend>
                <button class="map-legend-toggle" data-legend-toggle>${icon("layers")} Legend</button>
                <div class="map-legend-body">
                    <div class="ml-group">
                        <span class="ml-title">Nodes</span>
                        ${NODE_TYPES.map((t) => `<span class="ml-item"><i class="ml-dot" style="background:var(--n-${t === "mysteries" ? "mystery" : t.replace(/s$/, "")})"></i>${esc(TYPES[t].singular)}</span>`).join("")}
                    </div>
                    <div class="ml-group">
                        <span class="ml-title">Connections</span>
                        ${EDGE_KINDS.slice(0, 6).map((k) => `<span class="ml-item"><i class="ml-line" style="background:${store.prefs().edgeColors[k.value] || k.color}"></i>${esc(k.label)}</span>`).join("")}
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

export function mount(root, ctx) {
    const canvas = root.querySelector("[data-canvas]");
    const inspector = root.querySelector("[data-inspector]");
    const inspectorBody = root.querySelector("[data-inspector-body]");
    const filtersPanel = root.querySelector("[data-filters]");
    const searchInput = root.querySelector("[data-map-search]");
    saveStatusEl = root.querySelector("[data-save-state]");

    const maps = store.all("maps");
    const requested = ctx.query.map || store.prefs().lastMapId;
    mapRecord = (requested && store.get("maps", requested)) || maps[0] || null;

    currentFilters = {
        types: mapRecord?.filters?.types?.length ? [...mapRecord.filters.types] : [...NODE_TYPES],
        edgeKinds: mapRecord?.filters?.edgeKinds?.length ? [...mapRecord.filters.edgeKinds] : EDGE_KINDS.map((k) => k.value),
        storyline: mapRecord?.filters?.focus?.type === "storylines" ? mapRecord.filters.focus.key : "",
        faction: mapRecord?.filters?.focus?.type === "factions" ? mapRecord.filters.focus.key : "",
        character: mapRecord?.filters?.focus?.type === "characters" ? mapRecord.filters.focus.key : "",
        nodeLabels: true,
        edgeLabels: true,
        spoilers: true,
        hidden: [...(mapRecord?.hidden || [])],
    };
    updateMapHeader(root);

    if (mapRecord?.filters) {
        currentFilters.types = mapRecord.filters.types?.length ? [...mapRecord.filters.types] : [...NODE_TYPES];
        currentFilters.edgeKinds = mapRecord.filters.edgeKinds?.length ? [...mapRecord.filters.edgeKinds] : EDGE_KINDS.map((k) => k.value);
    }
    // reflect loaded state into the filter UI
    root.querySelectorAll("[data-type-toggle]").forEach((b) => b.classList.toggle("on", currentFilters.types.includes(b.dataset.typeToggle)));
    root.querySelectorAll("[data-kind-toggle]").forEach((b) => b.classList.toggle("on", currentFilters.edgeKinds.includes(b.dataset.kindToggle)));
    root.querySelector("[data-focus-storyline]").value = currentFilters.storyline || "";
    root.querySelector("[data-focus-faction]").value = currentFilters.faction || "";
    root.querySelector("[data-focus-character]").value = currentFilters.character || "";
    updateFilterCount(root);

    graph = new GraphView(canvas, {
        edgeColors: store.prefs().edgeColors,
        edgeLabels: true,
        nodeLabels: true,
        onPositionsChange: debounce((positions) => persistPositions(positions), 500),
        onNodeClick: (node) => showInspector(node, null),
        onSelectionChange: (ids) => {
            if (ids.length === 1) {
                const node = graph.nodes.find((n) => n.id === ids[0]);
                if (node) showInspector(node, null);
            } else if (ids.length > 1) {
                inspector.hidden = false;
                root.querySelector("[data-inspector-title]").textContent = `${ids.length} nodes selected`;
                inspectorBody.innerHTML = `<div class="insp-empty">${icon("layers")}<b>${ids.length} nodes selected</b><p>Drag to move them together. Use the connect button to link them.</p><button class="btn sm" data-clear-selection>Clear selection</button></div>`;
            } else {
                inspector.hidden = true;
            }
        },
        onNodeOpen: (node) => openRecord(node),
        onConnect: (a, b) => openConnectionForm(a, b, ctx),
        onNodeContext: (node, e) => nodeMenu(node, e, root, ctx),
        onEdgeContext: (edge, e) => edgeMenu(edge, e, root, ctx),
        onEdgeClick: (id) => {
            const edge = buildCurrentGraph().edges.find((x) => x.id === id);
            if (edge) showInspector(null, edge);
        },
        onCanvasContext: (e) => canvasMenu(e, ctx),
    });

    const rebuild = () => {
        const { nodes, edges } = computeGraph();
        graph.setEdgeColors(store.prefs().edgeColors);
        graph.setData({ nodes, edges, positions: mapRecord?.positions || {} }, { fit: false });
        root.querySelector("[data-zoom-label]").textContent = Math.round(graph.viewport.k * 100) + "%";
        checkEmpty(nodes);
        updateFilterCount(root);
    };
    rebuild();
    requestAnimationFrame(() => graph.fit());

    /* ---------------------------------------------------------- toolbar */
    root.addEventListener("click", (e) => {
        if (e.target.closest("[data-zoom-in]")) graph.zoomBy(1.25);
        if (e.target.closest("[data-zoom-out]")) graph.zoomBy(0.8);
        if (e.target.closest("[data-fit]")) graph.fit();
        if (e.target.closest("[data-auto-layout]")) {
            graph.runLayout();
            graph.fit();
            persistPositions(graph.getPositions(), { announce: true });
        }
        if (e.target.closest("[data-save-map]")) saveLayout(graph.getPositions());
        if (e.target.closest("[data-toggle-filters]")) {
            filtersPanel.hidden = !filtersPanel.hidden;
            if (!filtersPanel.hidden) inspector.hidden = true;
        }
        if (e.target.closest("[data-close-filters]")) filtersPanel.hidden = true;
        if (e.target.closest("[data-close-inspector]")) {
            inspector.hidden = true;
            graph.clearSelection();
        }
        if (e.target.closest("[data-clear-selection]")) graph.clearSelection();
        if (e.target.closest("[data-legend-toggle]")) root.querySelector("[data-legend]")?.classList.toggle("open");
        if (e.target.closest("[data-map-menu]")) openMapMenu(e.target.closest("[data-map-menu]"), root, ctx);
        if (e.target.closest("[data-toggle-connect]")) {
            toast("Drag from a node's corner handle to connect it. Drop on another node to choose the relationship.", "info", { timeout: 6000 });
            root.querySelector("[data-toggle-connect]").classList.remove("primary");
        }
        if (e.target.closest("[data-empty-action]")) {
            openEntityForm({ type: "characters", onSaved: () => ctx.refresh() });
        }
        if (e.target.closest("[data-reset-filters]")) {
            currentFilters = {
                types: [...NODE_TYPES],
                edgeKinds: EDGE_KINDS.map((k) => k.value),
                storyline: "",
                faction: "",
                character: "",
                nodeLabels: true,
                edgeLabels: true,
                spoilers: true,
                hidden: [],
            };
            root.querySelectorAll("[data-type-toggle]").forEach((b) => b.classList.add("on"));
            root.querySelectorAll("[data-kind-toggle]").forEach((b) => b.classList.add("on"));
            root.querySelector("[data-focus-storyline]").value = "";
            root.querySelector("[data-focus-faction]").value = "";
            root.querySelector("[data-focus-character]").value = "";
            searchInput.value = "";
            graph.setFilteredHighlight(null);
            rebuild();
            graph.fit();
        }
    });

    /* ---------------------------------------------------------- filters */
    root.querySelectorAll("[data-type-toggle]").forEach((btn) =>
        btn.addEventListener("click", () => {
            const t = btn.dataset.typeToggle;
            btn.classList.toggle("on");
            currentFilters.types = btn.classList.contains("on") ? [...new Set([...currentFilters.types, t])] : currentFilters.types.filter((x) => x !== t);
            rebuild();
        }),
    );
    root.querySelectorAll("[data-kind-toggle]").forEach((btn) =>
        btn.addEventListener("click", () => {
            const k = btn.dataset.kindToggle;
            btn.classList.toggle("on");
            currentFilters.edgeKinds = btn.classList.contains("on") ? [...new Set([...currentFilters.edgeKinds, k])] : currentFilters.edgeKinds.filter((x) => x !== k);
            rebuild();
        }),
    );
    root.querySelector("[data-focus-storyline]").addEventListener("change", (e) => {
        currentFilters.storyline = e.target.value;
        currentFilters.faction = "";
        currentFilters.character = "";
        root.querySelector("[data-focus-faction]").value = "";
        root.querySelector("[data-focus-character]").value = "";
        rebuild();
        graph.fit();
    });
    root.querySelector("[data-focus-faction]").addEventListener("change", (e) => {
        currentFilters.faction = e.target.value;
        currentFilters.storyline = "";
        currentFilters.character = "";
        root.querySelector("[data-focus-storyline]").value = "";
        root.querySelector("[data-focus-character]").value = "";
        rebuild();
        graph.fit();
    });
    root.querySelector("[data-focus-character]").addEventListener("change", (e) => {
        currentFilters.character = e.target.value;
        currentFilters.storyline = "";
        currentFilters.faction = "";
        root.querySelector("[data-focus-storyline]").value = "";
        root.querySelector("[data-focus-faction]").value = "";
        rebuild();
        graph.fit();
    });
    root.querySelector("[data-toggle-node-labels]").addEventListener("change", (e) => graph.setLabels({ nodes: e.target.checked }));
    root.querySelector("[data-toggle-edge-labels]").addEventListener("change", (e) => graph.setLabels({ edges: e.target.checked }));
    root.querySelector("[data-toggle-spoilers]").addEventListener("change", (e) => {
        currentFilters.spoilers = e.target.checked;
        rebuild();
    });

    /* ---------------------------------------------------------- search */
    searchInput.addEventListener(
        "input",
        debounce(() => {
            const q = searchInput.value.trim().toLowerCase();
            if (!q) {
                graph.setFilteredHighlight(null);
                return;
            }
            const matches = graph.nodes
                .filter((n) => (n.record.name || n.record.title || "").toLowerCase().includes(q))
                .map((n) => n.id);
            graph.setFilteredHighlight(matches);
            if (matches.length === 1) graph.focusNode(matches[0]);
        }, 220),
    );

    /* ---------------------------------------------------------- live data */
    activeCtx = ctx;
    const offChange = bus.on(
        "change",
        debounce(() => {
            if (!graph) return;
            const pos = graph.getPositions();
            rebuild();
            graph.setPositions(pos);
            graph.render();
        }, 450),
    );

    return () => {
        offChange();
        graph?.destroy();
        graph = null;
        activeCtx = null;
        closePopover();
    };

    /* ---------------------------------------------------------- helpers */
    function computeGraph() {
        const types = currentFilters.types;
        let { nodes, edges } = buildGraph({ types, includeSecret: currentFilters.spoilers });
        nodes = nodes.filter((n) => !currentFilters.hidden.includes(n.id));
        // Remove edges whose kind was switched off (derived edges included).
        edges = edges.filter((e) => currentFilters.edgeKinds.includes(e.kind));
        if (currentFilters.storyline) {
            const keep = relatedToStoryline(currentFilters.storyline);
            nodes = nodes.filter((n) => keep.has(n.id));
        }
        if (currentFilters.faction) {
            const keep = relatedToFaction(currentFilters.faction);
            nodes = nodes.filter((n) => keep.has(n.id));
        }
        if (currentFilters.character) {
            const keep = relatedToCharacter(currentFilters.character);
            nodes = nodes.filter((n) => keep.has(n.id));
        }
        const ids = new Set(nodes.map((n) => n.id));
        edges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
        return { nodes, edges };
    }

    function buildCurrentGraph() {
        return computeGraph();
    }

    function relatedToStoryline(key) {
        const s = store.get("storylines", key);
        const keep = new Set();
        if (!s) return keep;
        keep.add(`storylines:${key}`);
        const events = store.all("events").filter((e) => (e.storylineIds || []).includes(key));
        events.forEach((e) => keep.add(`events:${e.key}`));
        const chars = new Set([...(s.characterIds || [])]);
        events.forEach((e) => (e.characterIds || []).forEach((c) => chars.add(c)));
        chars.forEach((c) => keep.add(`characters:${c}`));
        const factions = new Set([...(s.factionIds || [])]);
        events.forEach((e) => (e.factionIds || []).forEach((f) => factions.add(f)));
        factions.forEach((f) => keep.add(`factions:${f}`));
        [...(s.locationIds || [])].forEach((l) => keep.add(`locations:${l}`));
        [...(s.mysteryIds || [])].forEach((m) => keep.add(`mysteries:${m}`));
        store.all("storylines").forEach((sub) => {
            if (sub.parentId === key) keep.add(`storylines:${sub.key}`);
        });
        return keep;
    }

    function relatedToFaction(key) {
        const keep = new Set([`factions:${key}`]);
        const f = store.get("factions", key);
        if (!f) return keep;
        [...(f.memberIds || []), f.leaderId].filter(Boolean).forEach((c) => keep.add(`characters:${c}`));
        [...(f.locationIds || [])].forEach((l) => keep.add(`locations:${l}`));
        [...(f.allyIds || []), ...(f.enemyIds || [])].forEach((x) => keep.add(`factions:${x}`));
        store.all("characters").forEach((c) => {
            if (c.factionId === key) keep.add(`characters:${c.key}`);
        });
        store.all("events").forEach((e) => {
            if ((e.factionIds || []).includes(key)) {
                keep.add(`events:${e.key}`);
                (e.storylineIds || []).forEach((s) => keep.add(`storylines:${s}`));
            }
        });
        return keep;
    }

    function relatedToCharacter(key) {
        const keep = new Set([`characters:${key}`]);
        const c = store.get("characters", key);
        if (!c) return keep;
        if (c.factionId) {
            keep.add(`factions:${c.factionId}`);
            const f = store.get("factions", c.factionId);
            [...(f?.memberIds || [])].forEach((x) => keep.add(`characters:${x}`));
        }
        if (c.locationId) keep.add(`locations:${c.locationId}`);
        store.all("relationships").forEach((r) => {
            if (r.aId === key) keep.add(`characters:${r.bId}`);
            if (r.bId === key) keep.add(`characters:${r.aId}`);
        });
        store.all("events").forEach((e) => {
            if ((e.characterIds || []).includes(key)) {
                keep.add(`events:${e.key}`);
                (e.storylineIds || []).forEach((s) => keep.add(`storylines:${s}`));
                (e.factionIds || []).forEach((f) => keep.add(`factions:${f}`));
                if (e.locationId) keep.add(`locations:${e.locationId}`);
            }
        });
        store.all("storylines").forEach((s) => {
            if ((s.characterIds || []).includes(key)) keep.add(`storylines:${s.key}`);
        });
        store.all("items").forEach((it) => {
            if (it.ownerId === key) keep.add(`items:${it.key}`);
        });
        store.all("mysteries").forEach((m) => {
            if ((m.characterIds || []).includes(key)) keep.add(`mysteries:${m.key}`);
        });
        return keep;
    }

    function showInspector(node, edge) {
        inspector.hidden = false;
        filtersPanel.hidden = true;
        if (edge) {
            root.querySelector("[data-inspector-title]").textContent = "Connection";
            inspectorBody.innerHTML = edgeInspectorHtml(edge, root, ctx);
            return;
        }
        const record = node.record;
        root.querySelector("[data-inspector-title]").textContent = TYPES[node.type]?.singular || "Node";
        inspectorBody.innerHTML = nodeInspectorHtml(node, root);
    }

    function checkEmpty(nodes) {
        const existing = root.querySelector("[data-map-empty]");
        if (nodes.length && existing) existing.remove();
        if (!nodes.length && !existing) {
            canvas.insertAdjacentHTML(
                "beforeend",
                `<div class="map-empty" data-map-empty>
                    <div class="eicon">${icon("map")}</div>
                    <h4>Nothing on the canvas</h4>
                    <p>Add a character, faction or event — or switch node types back on in filters.</p>
                    <button class="btn primary sm" data-empty-action>${icon("plus")} Create a character</button>
                </div>`,
            );
        }
    }
}

/* -------------------------------------------------------------------------
   Persistence
   ------------------------------------------------------------------------- */
function persistPositions(positions, { announce = false } = {}) {
    if (!mapRecord) {
        if (saveStatusEl) saveStatusEl.textContent = "Not saved — use Save layout";
        return;
    }
    const updated = store.save(
        "maps",
        {
            ...mapRecord,
            positions: { ...(mapRecord.positions || {}), ...positions },
            filters: { types: currentFilters.types, edgeKinds: currentFilters.edgeKinds, focus: focusOf() },
            hidden: currentFilters.hidden,
        },
        { silent: true },
    );
    mapRecord = updated;
    if (saveStatusEl) saveStatusEl.textContent = "Layout saved " + new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
    if (announce) toast("Canvas arrangement saved.", "success", { timeout: 2000 });
}

function focusOf() {
    if (currentFilters.storyline) return { type: "storylines", key: currentFilters.storyline };
    if (currentFilters.faction) return { type: "factions", key: currentFilters.faction };
    if (currentFilters.character) return { type: "characters", key: currentFilters.character };
    return null;
}

function saveLayout(positions) {
    if (!mapRecord) {
        promptDialog({
            title: "Save this map",
            label: "Map name",
            value: "Master storyline map",
            hint: "Saved maps keep their own layout, filters and focus.",
            confirmLabel: "Save map",
            onSubmit: (name) => {
                mapRecord = store.save("maps", {
                    name,
                    description: "",
                    positions: { ...(positions || {}), ...(graph?.getPositions() || {}) },
                    filters: { types: currentFilters.types, edgeKinds: currentFilters.edgeKinds, focus: focusOf() },
                    hidden: currentFilters.hidden,
                });
                store.setPref("lastMapId", mapRecord.key);
                const root = document.querySelector(".map-page");
                if (root) updateMapHeader(root);
                toast("Map saved.", "success");
            },
        });
        return;
    }
    persistPositions(positions || graph?.getPositions() || {});
    toast("Map layout saved.", "success", { timeout: 2200 });
}

function updateMapHeader(root) {
    const title = root.querySelector("[data-map-title]");
    const sub = root.querySelector("[data-map-sub]");
    if (!title) return;
    if (mapRecord) {
        title.textContent = mapRecord.name;
        sub.textContent = mapRecord.filters?.types?.length ? `${mapRecord.filters.types.length} node types · saved ${mapRecord.updatedAt ? new Date(mapRecord.updatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—"}` : "Saved canvas";
    } else {
        title.textContent = "Unsaved canvas";
        sub.textContent = "Save to keep this layout";
    }
}

function updateFilterCount(root) {
    const el = root.querySelector("[data-filter-count]");
    if (!el) return;
    const active = currentFilters.types.length !== NODE_TYPES.length || currentFilters.edgeKinds.length !== EDGE_KINDS.length || currentFilters.storyline || currentFilters.faction || currentFilters.character;
    el.textContent = active ? "•" : "";
    el.style.color = "var(--gold)";
}

/* -------------------------------------------------------------------------
   Inspector HTML
   ------------------------------------------------------------------------- */
function nodeInspectorHtml(node, root) {
    const r = node.record;
    const type = node.type;
    const typeMeta = TYPES[type];
    const connections = graph.edges.filter((e) => e.from === node.id || e.to === node.id);
    const relatedRows = connections
        .map((e) => {
            const otherId = e.from === node.id ? e.to : e.from;
            const other = graph.nodes.find((n) => n.id === otherId);
            return other ? { edge: e, other } : null;
        })
        .filter(Boolean)
        .slice(0, 12);

    const head = `
        <div class="insp-head">
            <span class="insp-type" style="--tc:var(--n-${type === "mysteries" ? "mystery" : type.replace(/s$/, "")})">${icon(typeMeta.icon)} ${esc(typeMeta.singular)}</span>
            ${r.canon ? canonBadge(r.canon) : ""}
        </div>
        <h3 class="insp-title">${esc(r.name || r.title || "Untitled")}</h3>
        ${r.tagline || r.subtitle || r.summary ? `<p class="insp-sub">${esc(truncate(r.tagline || r.subtitle || r.summary, 160))}</p>` : ""}
        <div class="row wrap gap-4" style="margin:10px 0 14px">
            ${type === "characters" ? avatarHtml(r.name, { username: r.username, image: r.portraitUrl, size: "md" }) : ""}
            ${r.status ? statusPill(r.status) : ""}
            ${r.importance ? importanceBars(r.importance) : ""}
            ${r.date ? `<span class="chip mono">${esc(fmtDate(r.date))}</span>` : ""}
            ${r.category ? `<span class="chip">${icon("events")} ${esc(categoryMeta(r.category).label)}</span>` : ""}
        </div>`;
    const facts = [];
    if (type === "characters") {
        facts.push(["Occupation", r.occupation], ["Faction", store.nameOf("factions", r.factionId)], ["Location", store.nameOf("locations", r.locationId)], ["Events", String(store.all("events").filter((e) => (e.characterIds || []).includes(r.key)).length)]);
    } else if (type === "events") {
        facts.push(["Location", store.nameOf("locations", r.locationId)], ["Storylines", (r.storylineIds || []).map((id) => store.nameOf("storylines", id)).filter(Boolean).join(", ")], ["Characters", `${(r.characterIds || []).length}`], ["Consequences", `${(r.consequenceLinks || []).length}`]);
    } else if (type === "factions") {
        facts.push(["Leader", store.nameOf("characters", r.leaderId)], ["Members", String((r.memberIds || []).length)], ["Founded", r.founded ? fmtDate(r.founded) : ""], ["Territory", (r.locationIds || []).map((id) => store.nameOf("locations", id)).filter(Boolean).join(", ")]);
    } else if (type === "locations") {
        facts.push(["Coordinates", r.coords], ["Controlled by", store.nameOf("factions", r.controllerFactionId)], ["Owner", store.nameOf("characters", r.ownerId)], ["Events", String(store.all("events").filter((e) => e.locationId === r.key).length)]);
    } else if (type === "storylines") {
        facts.push(["Phase", r.phase], ["Status", r.status], ["Events", String(store.all("events").filter((e) => (e.storylineIds || []).includes(r.key)).length)], ["Cast", `${(r.characterIds || []).length}`]);
    } else if (type === "mysteries") {
        facts.push(["Clues", String((r.clues || []).length)], ["Theories", String((r.theories || []).length)], ["Confirmed", String((r.confirmed || []).length)], ["Status", r.status]);
    } else if (type === "items") {
        facts.push(["Owner", store.nameOf("characters", r.ownerId)], ["Location", store.nameOf("locations", r.locationId)], ["Type", r.type], ["Status", r.status]);
    }
    const factHtml = facts
        .filter(([, v]) => v)
        .map(([k, v]) => `<div class="insp-fact"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`)
        .join("");

    const relHtml = relatedRows.length
        ? `<div class="insp-connections">${relatedRows
              .map(({ edge, other }) => {
                  const arrow = edge.from === node.id ? "→" : "←";
                  return `<button class="insp-conn" data-jump-node="${esc(other.id)}">
                      <span class="ic" style="color:${TYPES[other.type]?.color || "#999"}">${icon(TYPES[other.type]?.icon || "info")}</span>
                      <span class="t">${esc(other.record.name || other.record.title)}</span>
                      <span class="lbl">${arrow} ${esc(edge.label || edge.kind)}</span>
                  </button>`;
              })
              .join("")}</div>`
        : `<div class="quiet">No visible connections. Turn on more node types or connection styles.</div>`;

    return `${head}
        ${factHtml ? `<div class="insp-facts">${factHtml}</div>` : ""}
        <div class="insp-section"><div class="insp-section-title">Connections <span>${connections.length}</span></div>${relHtml}</div>
        <div class="insp-actions">
            <button class="btn sm primary" data-insp-open="${esc(node.id)}">${icon("external")} Open record</button>
            <button class="btn sm" data-insp-edit="${esc(node.id)}">${icon("edit")} Edit</button>
            <button class="btn sm" data-insp-focus="${esc(node.id)}">${icon("target")} Focus</button>
            <button class="btn sm" data-insp-hide="${esc(node.id)}">${icon("eyeOff")} Hide</button>
            <button class="btn sm" data-insp-quick="${esc(node.id)}">${icon("eye")} Quick view</button>
        </div>`;
}

function edgeInspectorHtml(edge, root, ctx) {
    const fromLabel = storeLabelFromGraph(edge.from);
    const toLabel = storeLabelFromGraph(edge.to);
    const kindMeta = EDGE_KINDS.find((k) => k.value === edge.kind) || { label: edge.kind, color: "#999" };
    return `
        <div class="insp-head"><span class="insp-type" style="--tc:${kindMeta.color}">${icon("link")} ${esc(kindMeta.label)}</span>
        ${edge.dashed ? `<span class="chip">Historical</span>` : ""}</div>
        <h3 class="insp-title" style="font-size:16px">${esc(fromLabel)} <span class="dim">→</span> ${esc(toLabel)}</h3>
        <p class="insp-sub">${esc(edge.label || kindMeta.label)}${edge.date ? ` · ${esc(fmtDate(edge.date))}` : ""}</p>
        <div class="insp-facts">
            <div class="insp-fact"><span>Origin</span><b>${edge.source === "custom" ? "Custom connection" : edge.source === "relationship" ? "Relationship record" : "Cross-reference"}</b></div>
            <div class="insp-fact"><span>Style</span><b style="color:${kindMeta.color}">${esc(kindMeta.label)}</b></div>
        </div>
        <div class="insp-actions">
            ${edge.source === "relationship" ? `<button class="btn sm primary" data-edge-open-rel="${esc(edge.recordKey)}">${icon("external")} Open relationship</button>` : ""}
            ${edge.source === "custom" ? `<button class="btn sm primary" data-edge-open-link="${esc(edge.recordKey)}">${icon("edit")} Edit connection</button>` : ""}
            <button class="btn sm danger" data-edge-delete="${esc(edge.id)}">${icon("trash")} Delete connection</button>
        </div>`;
}

function storeLabelFromGraph(id) {
    const [type, ...rest] = id.split(":");
    const key = rest.join(":");
    return store.nameOf(type, key) || "Unknown";
}

/* -------------------------------------------------------------------------
   Menus
   ------------------------------------------------------------------------- */
function nodeMenu(node, e, root, ctx) {
    const html = `
        <div class="pop-label">${esc(TYPES[node.type].singular)}</div>
        <button class="pop-item" data-mn-open>${icon("external")} Open record</button>
        <button class="pop-item" data-mn-quick>${icon("eye")} Quick view</button>
        <button class="pop-item" data-mn-edit>${icon("edit")} Edit</button>
        <div class="pop-sep"></div>
        <button class="pop-item" data-mn-focus>${icon("target")} Focus connections</button>
        <button class="pop-item" data-mn-hide>${icon("eyeOff")} Hide from this map</button>
        <div class="pop-sep"></div>
        <button class="pop-item danger" data-mn-delete>${icon("trash")} Delete permanently</button>`;
    const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
    openPopover(anchor, html, {
        width: 220,
        onMount: (node2) => {
            node2.addEventListener("click", (ev) => {
                const editType = node.type === "mysteries" ? "mysteries" : node.type === "secrets" ? "secrets" : node.type;
                if (ev.target.closest("[data-mn-open]")) {
                    closePopover();
                    openRecord(node);
                } else if (ev.target.closest("[data-mn-quick]")) {
                    closePopover();
                    openQuickView(editType, node.key);
                } else if (ev.target.closest("[data-mn-edit]")) {
                    closePopover();
                    openEntityForm({
                        type: editType,
                        record: store.get(editType, node.key),
                        onSaved: () => ctx.refresh(),
                    });
                } else if (ev.target.closest("[data-mn-focus]")) {
                    closePopover();
                    graph.focusNode(node.id);
                    graph.setFilteredHighlight(
                        graph.edges
                            .filter((x) => x.from === node.id || x.to === node.id)
                            .flatMap((x) => [x.from, x.to])
                            .concat(node.id),
                    );
                } else if (ev.target.closest("[data-mn-hide]")) {
                    closePopover();
                    currentFilters.hidden.push(node.id);
                    persistPositions(graph.getPositions());
                    graph.nodes = graph.nodes.filter((n) => n.id !== node.id);
                    graph.render();
                    document.querySelector("[data-inspector]").hidden = true;
                    toast("Node hidden from this map. Reset filters to bring it back.", "info");
                } else if (ev.target.closest("[data-mn-delete]")) {
                    closePopover();
                    const label = store.nameOf(editType, node.key);
                    confirmDialog({
                        title: `Delete ${TYPES[node.type].singular.toLowerCase()}?`,
                        message: `Permanently delete <b>${esc(label || "this record")}</b> and clean up every reference?`,
                        detail: "This affects the whole archive, not just this map.",
                        confirmLabel: "Delete permanently",
                        onConfirm: () => {
                            store.remove(editType, { key: node.key });
                            toast("Record deleted.", "success");
                            ctx.refresh();
                        },
                    });
                }
            });
        },
    });
}

function edgeMenu(edge, e, root, ctx) {
    const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
    const kindMeta = EDGE_KINDS.find((k) => k.value === edge.kind) || { label: edge.kind };
    const html = `
        <div class="pop-label">${esc(kindMeta.label)}</div>
        <button class="pop-item" data-em-info>${icon("info")} Connection details</button>
        ${edge.source === "custom" ? `<button class="pop-item" data-em-edit>${icon("edit")} Edit connection</button>` : ""}
        ${edge.source === "relationship" ? `<button class="pop-item" data-em-rel>${icon("relationships")} Open relationship</button>` : ""}
        <div class="pop-sep"></div>
        <button class="pop-item danger" data-em-delete>${icon("trash")} Delete connection</button>`;
    openPopover(anchor, html, {
        width: 220,
        onMount: (pop) => {
            pop.addEventListener("click", (ev) => {
                closePopover();
                const inspector = document.querySelector("[data-inspector]");
                const body = document.querySelector("[data-inspector-body]");
                if (ev.target.closest("[data-em-info]")) {
                    inspector.hidden = false;
                    document.querySelector("[data-inspector-title]").textContent = "Connection";
                    body.innerHTML = edgeInspectorHtml(edge, root, ctx);
                    return;
                }
                if (ev.target.closest("[data-em-rel]")) {
                    openQuickView("relationships", edge.recordKey);
                    return;
                }
                if (ev.target.closest("[data-em-edit]")) {
                    openEntityForm({ type: "links", record: store.get("links", edge.recordKey), onSaved: () => ctx.refresh() });
                    return;
                }
                if (ev.target.closest("[data-em-delete]")) deleteEdge(edge, ctx);
            });
        },
    });
}

function canvasMenu(e, ctx) {
    const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
    openPopover(
        anchor,
        `<div class="pop-label">Canvas</div>
         <button class="pop-item" data-cm-new>${icon("plus")} New record…</button>
         <button class="pop-item" data-cm-arrange>${icon("sparkles")} Auto-arrange</button>
         <button class="pop-item" data-cm-fit>${icon("maximize")} Fit to screen</button>
         <button class="pop-item" data-cm-save>${icon("save")} Save layout</button>`,
        {
            width: 210,
            onMount: (pop) => {
                pop.addEventListener("click", (ev) => {
                    closePopover();
                    if (ev.target.closest("[data-cm-new]")) {
                        openEntityForm({ type: "characters" });
                    } else if (ev.target.closest("[data-cm-arrange]")) {
                        graph.runLayout();
                        graph.fit();
                        persistPositions(graph.getPositions(), { announce: true });
                    } else if (ev.target.closest("[data-cm-fit]")) graph.fit();
                    else if (ev.target.closest("[data-cm-save]")) saveLayout(graph.getPositions());
                });
            },
        },
    );
}

function openMapMenu(anchor, root, ctx) {
    const maps = store.all("maps");
    const html = `<div class="pop-label">Saved maps</div>
        ${maps
            .map(
                (m) => `<button class="pop-item" data-select-map="${esc(m.key)}">${icon("map")} <span style="min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(m.name)}</span>${m.key === mapRecord?.key ? `<span class="kbd">${icon("check")}</span>` : ""}</button>`,
            )
            .join("") || '<div class="pop-item" style="cursor:default">No saved maps yet</div>'}
        <div class="pop-sep"></div>
        <button class="pop-item" data-new-map>${icon("plus")} Save current view as map</button>
        <button class="pop-item" data-rename-map ${mapRecord ? "" : "disabled"}>${icon("edit")} Rename this map</button>
        <button class="pop-item danger" data-delete-map ${mapRecord ? "" : "disabled"}>${icon("trash")} Delete this map</button>`;
    openPopover(anchor, html, {
        width: 250,
        onMount: (pop) => {
            pop.addEventListener("click", (ev) => {
                const sel = ev.target.closest("[data-select-map]");
                if (sel) {
                    closePopover();
                    mapRecord = store.get("maps", sel.dataset.selectMap);
                    store.setPref("lastMapId", mapRecord.key);
                    navigate(`/map?map=${mapRecord.key}`);
                    return;
                }
                if (ev.target.closest("[data-new-map]")) {
                    closePopover();
                    saveLayout(graph.getPositions());
                    ctx.refresh();
                    return;
                }
                if (ev.target.closest("[data-rename-map]") && mapRecord) {
                    closePopover();
                    promptDialog({
                        title: "Rename map",
                        label: "Map name",
                        value: mapRecord.name,
                        onSubmit: (name) => {
                            mapRecord = store.save("maps", { ...mapRecord, name });
                            updateMapHeader(document.querySelector(".map-page"));
                        },
                    });
                    return;
                }
                if (ev.target.closest("[data-delete-map]") && mapRecord) {
                    closePopover();
                    confirmDialog({
                        title: "Delete this map?",
                        message: `Delete the saved canvas <b>${esc(mapRecord.name)}</b>? Records on it are not affected.`,
                        confirmLabel: "Delete map",
                        onConfirm: () => {
                            store.remove("maps", { key: mapRecord.key, cleanup: false });
                            mapRecord = null;
                            ctx.refresh();
                        },
                    });
                }
            });
        },
    });
}

function openRecord(node) {
    if (node.type === "events") navigate(`/events?open=${node.key}`);
    else if (node.type === "mysteries") navigate(`/secrets?open=${node.key}`);
    else navigate(`/${routeFor(node.type)}/${node.key}`);
}

/* Inspector actions (delegated on document because the panel is re-rendered) */
document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-insp-open]");
    if (open) {
        const [type, ...rest] = open.dataset.inspOpen.split(":");
        const key = rest.join(":");
        const node = { type, key };
        openRecord(node);
        return;
    }
    const edit = e.target.closest("[data-insp-edit]");
    if (edit) {
        const [type, ...rest] = edit.dataset.inspEdit.split(":");
        const key = rest.join(":");
        openEntityForm({
            type,
            record: store.get(type, key),
            onSaved: () => {
                if (activeCtx?.refresh) activeCtx.refresh();
                else location.reload();
            },
        });
        return;
    }
    const focus = e.target.closest("[data-insp-focus]");
    if (focus && graph) {
        const id = focus.dataset.inspFocus;
        graph.focusNode(id);
        graph.setFilteredHighlight(graph.edges.filter((x) => x.from === id || x.to === id).flatMap((x) => [x.from, x.to]).concat(id));
        return;
    }
    const hide = e.target.closest("[data-insp-hide]");
    if (hide && graph) {
        currentFilters.hidden.push(hide.dataset.inspHide);
        persistPositions(graph.getPositions());
        graph.nodes = graph.nodes.filter((n) => n.id !== hide.dataset.inspHide);
        graph.render();
        document.querySelector("[data-inspector]").hidden = true;
        toast("Node hidden from this map. Reset filters to bring it back.", "info");
        return;
    }
    const quick = e.target.closest("[data-insp-quick]");
    if (quick) {
        const [type, ...rest] = quick.dataset.inspQuick.split(":");
        openQuickView(type, rest.join(":"));
        return;
    }
    const jump = e.target.closest("[data-jump-node]");
    if (jump && graph) {
        const node = graph.nodes.find((n) => n.id === jump.dataset.jumpNode);
        if (node) {
            graph.focusNode(node.id);
            const inspector = document.querySelector("[data-inspector]");
            const body = document.querySelector("[data-inspector-body]");
            if (inspector && body) {
                inspector.hidden = false;
                document.querySelector("[data-inspector-title]").textContent = TYPES[node.type]?.singular || "Node";
                body.innerHTML = nodeInspectorHtml(node);
            }
        }
        return;
    }
    const rel = e.target.closest("[data-edge-open-rel]");
    if (rel) {
        openQuickView("relationships", rel.dataset.edgeOpenRel);
        return;
    }
    const link = e.target.closest("[data-edge-open-link]");
    if (link) {
        openEntityForm({ type: "links", record: store.get("links", link.dataset.edgeOpenLink) });
        return;
    }
    const del = e.target.closest("[data-edge-delete]");
    if (del) {
        const edge = graph?.edges.find((x) => x.id === del.dataset.edgeDelete);
        if (edge) deleteEdge(edge);
    }
});

function deleteEdge(edge, ctx) {
    if (edge.source === "custom") {
        confirmDialog({
            title: "Delete connection?",
            message: `Delete the custom connection <b>${esc(edge.label || "this link")}</b> between ${esc(storeLabelFromGraph(edge.from))} and ${esc(storeLabelFromGraph(edge.to))}?`,
            confirmLabel: "Delete connection",
            onConfirm: () => {
                store.remove("links", { key: edge.recordKey });
                toast("Connection deleted.", "success");
                ctx?.refresh?.();
            },
        });
        return;
    }
    if (edge.source === "relationship") {
        const rel = store.get("relationships", edge.recordKey);
        confirmDialog({
            title: "Delete this relationship?",
            message: `Delete the relationship record between <b>${esc(storeLabelFromGraph(edge.from))}</b> and <b>${esc(storeLabelFromGraph(edge.to))}</b>?`,
            detail: "The relationship history will be removed from both character profiles.",
            confirmLabel: "Delete relationship",
            onConfirm: () => {
                store.remove("relationships", { key: edge.recordKey });
                toast("Relationship deleted.", "success");
                ctx?.refresh?.();
            },
        });
        return;
    }
    if (edge.source === "field" && edge.ownerType && edge.ownerKey) {
        const owner = store.get(edge.ownerType, edge.ownerKey);
        if (!owner) return;
        const targetName = storeLabelFromGraph(edge.from === `${edge.ownerType}:${edge.ownerKey}` ? edge.to : edge.from);
        confirmDialog({
            title: "Remove connection?",
            message: `Remove <b>${esc(targetName)}</b> from the ${esc(TYPES[edge.ownerType]?.singular.toLowerCase() || "record")} <b>${esc(owner.name || owner.title)}</b>?`,
            detail: "This connection is generated from a cross-reference. Removing it edits that record.",
            confirmLabel: "Remove reference",
            onConfirm: () => {
                const field = edge.field;
                const value = owner[field];
                if (Array.isArray(value)) {
                    const [t, ...rest] = (edge.from.startsWith(edge.ownerType) ? edge.to : edge.from).split(":");
                    owner[field] = value.filter((v) => v !== rest.join(":"));
                } else {
                    owner[field] = "";
                }
                store.save(edge.ownerType, owner);
                toast("Reference removed.", "success");
                ctx?.refresh?.();
            },
        });
    }
}

/* -------------------------------------------------------------------------
   Connection creation
   ------------------------------------------------------------------------- */
function openConnectionForm(a, b, ctx) {
    const bothCharacters = a.type === "characters" && b.type === "characters";
    const body = `
        <div class="connection-form">
            <div class="connection-endpoints">
                <div class="endpoint"><span class="tiny dim">From</span><b>${esc(a.record.name || a.record.title)}</b><span class="chip">${esc(TYPES[a.type].singular)}</span></div>
                ${icon("arrowRight")}
                <div class="endpoint"><span class="tiny dim">To</span><b>${esc(b.record.name || b.record.title)}</b><span class="chip">${esc(TYPES[b.type].singular)}</span></div>
            </div>
            ${
                bothCharacters
                    ? `<div class="segmented" style="margin:14px 0">
                        <button class="seg active" data-conn-mode="relationship">${icon("relationships")} Relationship record</button>
                        <button class="seg" data-conn-mode="link">${icon("link")} Custom link</button>
                       </div>`
                    : `<div class="banner" style="margin:14px 0">${icon("info")}<div>Cross-type connections are stored as custom links on the map and do not alter either record.</div></div>`
            }
            <div data-conn-fields>
                <div class="grid-2">
                    <div class="field"><label>Relationship type</label><select class="select" data-conn-type>${RELATION_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}</select></div>
                    <div class="field"><label>Status</label><select class="select" data-conn-status><option value="active">Current</option><option value="strained">Strained</option><option value="broken">Broken</option><option value="hidden">Secret</option><option value="planned">Planned</option></select></div>
                </div>
                <div class="field"><label>Description <span class="req">*</span></label><textarea class="textarea" data-conn-desc rows="3" placeholder="What binds these two together?"></textarea></div>
                <label class="checkline"><input type="checkbox" data-conn-secret ${bothCharacters ? "" : "checked disabled"} /> Keep this connection secret</label>
            </div>
        </div>`;
    openModal({
        title: "Create a connection",
        subtitle: "The connection appears immediately on the map and on both records.",
        body,
        size: "narrow",
        foot: `<button class="btn" data-cancel>Cancel</button><span class="spacer"></span><button class="btn primary" data-create>${icon("link")} Create connection</button>`,
        onMount: (modal, close) => {
            let mode = bothCharacters ? "relationship" : "link";
            const fields = modal.querySelector("[data-conn-fields]");
            modal.querySelectorAll("[data-conn-mode]").forEach((btn) =>
                btn.addEventListener("click", () => {
                    modal.querySelectorAll("[data-conn-mode]").forEach((b) => b.classList.toggle("active", b === btn));
                    mode = btn.dataset.connMode;
                    fields.innerHTML =
                        mode === "relationship"
                            ? `<div class="grid-2">
                                <div class="field"><label>Relationship type</label><select class="select" data-conn-type>${RELATION_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}</select></div>
                                <div class="field"><label>Status</label><select class="select" data-conn-status><option value="active">Current</option><option value="strained">Strained</option><option value="broken">Broken</option><option value="secret">Secret</option><option value="planned">Planned</option></select></div>
                               </div>
                               <div class="field"><label>Description</label><textarea class="textarea" data-conn-desc rows="3" placeholder="What binds these two together?"></textarea></div>
                               <label class="checkline"><input type="checkbox" data-conn-secret /> Keep this relationship secret</label>`
                            : `<div class="field"><label>Connection label</label><input class="input" data-conn-label placeholder="e.g. secretly funds, hides the page for, betrayed" /></div>
                               <div class="field"><label>Line style</label><select class="select" data-conn-kind>${EDGE_KINDS.map((k) => `<option value="${k.value}">${k.label}</option>`).join("")}</select></div>
                               <div class="field"><label>Date</label><input class="input" type="date" data-conn-date /></div>
                               <div class="field"><label>Notes</label><textarea class="textarea" data-conn-note rows="3"></textarea></div>`;
                }),
            );
            modal.querySelector("[data-cancel]").addEventListener("click", close);
            modal.querySelector("[data-create]").addEventListener("click", () => {
                if (mode === "relationship") {
                    const type = modal.querySelector("[data-conn-type]").value;
                    const status = modal.querySelector("[data-conn-status]").value;
                    const desc = modal.querySelector("[data-conn-desc]").value.trim();
                    if (!desc) {
                        toast("Add a short description for the relationship.", "error");
                        return;
                    }
                    store.save("relationships", {
                        aId: a.key,
                        bId: b.key,
                        type,
                        status,
                        secret: modal.querySelector("[data-conn-secret]")?.checked || false,
                        canon: "confirmed",
                        description: desc,
                        startDate: new Date().toISOString().slice(0, 10),
                        evolution: [{ label: "First recorded", type, status, date: new Date().toISOString().slice(0, 10), note: desc }],
                    });
                    toast("Relationship created.", "success");
                } else {
                    const label = modal.querySelector("[data-conn-label]").value.trim();
                    if (!label) {
                        toast("Give the connection a label.", "error");
                        return;
                    }
                    store.save("links", {
                        label,
                        fromType: a.type,
                        fromId: a.key,
                        toType: b.type,
                        toId: b.key,
                        kind: modal.querySelector("[data-conn-kind]").value,
                        date: modal.querySelector("[data-conn-date]").value,
                        note: modal.querySelector("[data-conn-note]").value.trim(),
                    });
                    toast("Connection created.", "success");
                }
                close();
                ctx.refresh();
            });
        },
    });
}
