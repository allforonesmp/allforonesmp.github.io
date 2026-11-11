/* Story Planner — Story diagrams: interactive canvas over real records,
   with saved layouts and user-created diagrams. */

import {el, icon, toArray} from "../util.js";
import {activeDocs, byId, createRecord, updateRecord, deleteRecord, subscribe} from "../store.js";
import { ENTITIES } from "../schema.js";
import { pageHead, badge, toast, toastError, confirmDialog, promptDialog, statusBadge } from "../components/ui.js";
;
import { navigate, detailPath } from "../router.js";
import { createGraph } from "../graph.js";

const MAIN_DIAGRAM_ID = "diagram_main";

const TYPE_META = {
    events: { label: "Events", color: "var(--c-event)" },
    characters: { label: "Characters", color: "var(--c-character)" },
    lore: { label: "Lore", color: "var(--c-lore)" },
    factions: { label: "Factions", color: "var(--c-faction)" },
    locations: { label: "Locations", color: "var(--c-location)" },
    story_arcs: { label: "Arcs", color: "var(--c-arc)" },
    story_threads: { label: "Threads", color: "var(--c-thread)" },
};

export function diagramsPage(params) {
    const root = el("div", { class: "page" });
    const focus = params.get("focus") || "";
    let graph = null;
    let activeDiagramId = params.get("diagram") || MAIN_DIAGRAM_ID;
    let scopeSeason = "";
    let scopeArc = "";
    let searchTerm = "";
    const visible = new Set(Object.keys(TYPE_META));

    root.appendChild(
        pageHead("Story diagrams", "The whole storyline as a graph: events, characters, lore, factions and places wired together by their real links.", [
            el("button", { class: "btn btn-ghost", type: "button", onclick: () => saveLayout() }, [icon("save"), "Save layout"]),
            el("button", { class: "btn btn-primary", type: "button", onclick: () => newDiagram() }, [icon("plus"), "New diagram"]),
        ])
    );

    /* ---------------- diagram switcher ---------------- */
    const savedDiagrams = () => activeDocs("diagrams");
    const switcher = el("div", { class: "row", style: { gap: "0.35rem", flexWrap: "wrap" } });

    function renderSwitcher() {
        switcher.innerHTML = "";
        switcher.appendChild(
            el("button", {
                class: `chip-button${activeDiagramId === MAIN_DIAGRAM_ID ? " on" : ""}`,
                type: "button",
                onclick: () => {
                    activeDiagramId = MAIN_DIAGRAM_ID;
                    renderAll();
                },
            }, [icon("share"), "Main storyline"])
        );
        savedDiagrams().forEach((d) => {
            switcher.appendChild(
                el("span", { class: `chip-button${activeDiagramId === d.id ? " on" : ""}`, style: { gap: "0.4rem" } }, [
                    el("button", { type: "button", style: { fontWeight: "inherit", color: "inherit" }, onclick: () => { activeDiagramId = d.id; renderAll(); } }, d.name || "Untitled diagram"),
                    el("button", {
                        type: "button",
                        style: { color: "inherit", opacity: 0.6, display: "flex" },
                        title: "Delete diagram",
                        onclick: async (ev) => {
                            ev.stopPropagation();
                            const ok = await confirmDialog({ title: "Delete diagram?", message: `"${d.name}" and its saved node positions will be removed. Story data is not affected.`, confirmLabel: "Delete", danger: true });
                            if (!ok) return;
                            try {
                                await deleteRecord("diagrams", d.id);
                                if (activeDiagramId === d.id) activeDiagramId = MAIN_DIAGRAM_ID;
                                renderAll();
                            } catch (err) {
                                toastError(err, "Deleting diagram");
                            }
                        },
                    }, icon("x")),
                ])
            );
        });
    }

    /* ---------------- toolbar ---------------- */
    const typeLegend = el("div", { class: "dg-legend" });
    function renderLegend() {
        typeLegend.innerHTML = "";
        Object.entries(TYPE_META).forEach(([type, meta]) => {
            const count = activeDocs(type).length;
            const label = el("label", { class: visible.has(type) ? "on" : "", title: `Toggle ${meta.label.toLowerCase()}` }, [
                el("i", { style: { background: meta.color } }),
                `${meta.label} ${count}`,
            ]);
            label.addEventListener("click", () => {
                if (visible.has(type)) visible.delete(type);
                else visible.add(type);
                renderLegend();
                if (graph) graph.setVisibleTypes(visible);
            });
            typeLegend.appendChild(label);
        });
    }

    const seasonSelect = el("select", { class: "select-sm" }, [
        el("option", { value: "", text: "All seasons" }),
        ...activeDocs("seasons").map((s) => el("option", { value: s.id, text: s.name })),
    ]);
    seasonSelect.addEventListener("change", () => {
        scopeSeason = seasonSelect.value;
        build();
    });
    const arcSelect = el("select", { class: "select-sm" }, [
        el("option", { value: "", text: "All arcs" }),
        ...activeDocs("story_arcs").map((a) => el("option", { value: a.id, text: a.name })),
    ]);
    arcSelect.addEventListener("change", () => {
        scopeArc = arcSelect.value;
        build();
    });
    const searchInput = el("input", { type: "search", placeholder: "Search nodes…", style: { maxWidth: "190px" } });
    searchInput.addEventListener("input", () => {
        searchTerm = searchInput.value;
        if (graph) graph.search(searchTerm);
    });

    const toolbar = el("div", { class: "dg-toolbar", style: { borderRadius: "var(--radius)", border: "1px solid var(--border-color)" } }, [
        el("div", { class: "row", style: { gap: "0.35rem" } }, [el("div", { class: "search-mini" }, [icon("search"), searchInput]), seasonSelect, arcSelect]),
        el("span", { style: { marginLeft: "auto", display: "flex", gap: "0.35rem" } }, [
            el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => graph && graph.relayout() }, [icon("refresh"), "Re-layout"]),
            el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => saveLayout() }, [icon("save"), "Save layout"]),
        ]),
    ]);

    root.appendChild(el("div", { class: "card" }, [el("div", { class: "card-body tight" }, [el("div", { class: "row", style: { gap: "0.4rem" } }, [el("span", { class: "field-hint", text: "Diagram:" }), switcher])])]));
    root.appendChild(toolbar);

    const shell = el("div", { class: "diagram-shell" }, [
        el("div", { class: "dg-toolbar" }, [typeLegend]),
        el("div", { class: "diagram-canvas" }),
    ]);
    const canvas = shell.querySelector(".diagram-canvas");
    const inspector = el("div", { class: "dg-inspector", hidden: true });
    shell.appendChild(inspector);
    shell.appendChild(
        el("div", { class: "dg-controls" }, [
            el("button", { type: "button", title: "Zoom in", onclick: () => graph && graph.zoomIn() }, icon("zoomIn")),
            el("button", { type: "button", title: "Zoom out", onclick: () => graph && graph.zoomOut() }, icon("zoomOut")),
            el("button", { type: "button", title: "Fit to screen", onclick: () => graph && graph.fit() }, icon("maximize")),
            el("button", { type: "button", title: "Reset layout", onclick: () => graph && graph.relayout() }, icon("reset")),
        ])
    );
    root.appendChild(shell);
    root.appendChild(
        el("div", { class: "notice" }, [
            icon("info"),
            el("span", { text: "Connections are derived from the links stored on each record — they are never duplicated. Drag nodes to arrange the story, then Save layout to keep it. Double-click a node to open the record." }),
        ])
    );

    /* ---------------- data ----------------
       Nodes = records (filtered by scope). */
    function buildGraphData() {
        const events = activeDocs("events").filter(
            (e) => (scopeSeason ? String(e.seasonId) === String(scopeSeason) : true) && (scopeArc ? String(e.arcId) === String(scopeArc) : true)
        );
        const characters = activeDocs("characters");
        const lore = activeDocs("lore");
        const factions = activeDocs("factions");
        const locations = activeDocs("locations");
        const arcs = activeDocs("story_arcs").filter((a) => (scopeSeason ? String(a.seasonId) === String(scopeSeason) : true));
        const threads = activeDocs("story_threads");

        // when a scope is chosen, only include connected entities of other types
        const keepCharacter = new Set();
        const keepLore = new Set();
        const keepFaction = new Set();
        const keepLocation = new Set();
        const keepThread = new Set();
        const scoped = Boolean(scopeSeason || scopeArc);
        if (scoped) {
            events.forEach((e) => {
                ["mainCharacterIds", "supportingCharacterIds", "antagonistIds", "affectedCharacterIds"].forEach((f) => toArray(e[f]).forEach((id) => keepCharacter.add(String(id))));
                toArray(e.loreIds).forEach((id) => keepLore.add(String(id)));
                toArray(e.factionIds).forEach((id) => keepFaction.add(String(id)));
                toArray(e.locationIds).forEach((id) => keepLocation.add(String(id)));
                toArray(e.threadIds).forEach((id) => keepThread.add(String(id)));
            });
        }

        const nodeList = [];
        const push = (collection, doc, extra = {}) => {
            const ent = ENTITIES[collection];
            nodeList.push({
                id: `${collection}:${doc.id}`,
                label: ent.title(doc),
                sub: doc.status || doc.category || "",
                type: collection,
                color: collection === "events" && doc.kind === "Main Event" ? "var(--c-event-main)" : TYPE_META[collection]?.color,
                shape: collection === "lore" ? "circle" : "rect",
                entity: { collection, id: doc.id },
                ...extra,
            });
        };
        events.forEach((e) => push("events", e));
        characters.filter((c) => !scoped || keepCharacter.has(String(c.id))).forEach((c) => push("characters", c));
        lore.filter((l) => !scoped || keepLore.has(String(l.id))).forEach((l) => push("lore", l));
        factions.filter((f) => !scoped || keepFaction.has(String(f.id))).forEach((f) => push("factions", f));
        locations.filter((l) => !scoped || keepLocation.has(String(l.id))).forEach((l) => push("locations", l));
        arcs.forEach((a) => push("story_arcs", a));
        threads.filter((t) => !scoped || keepThread.has(String(t.id))).forEach((t) => push("story_threads", t));

        const ids = new Set(nodeList.map((n) => n.id));
        const edgeList = [];
        const addEdge = (from, to, label) => {
            const s = `${from[0]}:${from[1]}`;
            const t = `${to[0]}:${to[1]}`;
            if (!ids.has(s) || !ids.has(t) || s === t) return;
            if (edgeList.some((e) => e.source === s && e.target === t && e.label === label)) return;
            edgeList.push({ source: s, target: t, label });
        };

        events.forEach((e) => {
            toArray(e.mainCharacterIds).forEach((id) => addEdge(["characters", id], ["events", e.id], "participates in"));
            toArray(e.antagonistIds).forEach((id) => addEdge(["characters", id], ["events", e.id], "opposes"));
            toArray(e.loreIds).forEach((id) => addEdge(["events", e.id], ["lore", id], "reveals"));
            toArray(e.factionIds).forEach((id) => addEdge(["factions", id], ["events", e.id], "involved in"));
            toArray(e.locationIds).forEach((id) => addEdge(["events", e.id], ["locations", id], "takes place at"));
            toArray(e.threadIds).forEach((id) => addEdge(["story_threads", id], ["events", e.id], "develops in"));
            toArray(e.prerequisiteEventIds).forEach((id) => addEdge(["events", e.id], ["events", id], "depends on"));
            if (e.arcId) addEdge(["story_arcs", e.arcId], ["events", e.id], "contains");
        });
        lore.forEach((l) => {
            toArray(l.relatedLoreIds).forEach((id) => addEdge(["lore", l.id], ["lore", id], "related"));
            toArray(l.factionIds).forEach((id) => addEdge(["lore", l.id], ["factions", id], "belongs to"));
            toArray(l.locationIds).forEach((id) => addEdge(["lore", l.id], ["locations", id], "connected to"));
        });
        threads.forEach((t) => {
            toArray(t.connectedThreadIds).forEach((id) => addEdge(["story_threads", t.id], ["story_threads", id], "connected"));
            toArray(t.arcIds).forEach((id) => addEdge(["story_threads", t.id], ["story_arcs", id], "runs through"));
        });
        arcs.forEach((a) => {
            toArray(a.mainCharacterIds).forEach((id) => addEdge(["characters", id], ["story_arcs", a.id], "leads"));
        });

        return { nodes: nodeList, edges: edgeList };
    }

    /* ---------------- layout persistence ---------------- */
    function layoutDoc() {
        if (activeDiagramId === MAIN_DIAGRAM_ID) return byId("diagrams", MAIN_DIAGRAM_ID);
        return byId("diagrams", activeDiagramId);
    }

    function applySavedLayout(data) {
        const doc = layoutDoc();
        const positions = toArray(doc?.nodes);
        if (!positions.length) return data;
        const map = new Map(positions.map((p) => [p.id, p]));
        data.nodes = data.nodes.map((n) => (map.has(n.id) ? { ...n, x: map.get(n.id).x, y: map.get(n.id).y, fixed: true } : n));
        return data;
    }

    async function saveLayout() {
        if (!graph) return;
        const positions = graph.positions();
        const payload = {
            name: activeDiagramId === MAIN_DIAGRAM_ID ? "Main storyline" : layoutDoc()?.name || "Custom diagram",
            nodes: positions,
            visibleTypes: Array.from(visible),
            scope: { seasonId: scopeSeason, arcId: scopeArc },
            savedAt: new Date().toISOString(),
        };
        try {
            const doc = layoutDoc();
            if (doc) await updateRecord("diagrams", doc.id, payload, { immediate: true });
            else await createRecord("diagrams", { ...payload, kind: "main" }, { silent: true });
            toast("Diagram layout saved.", "success");
        } catch (err) {
            toastError(err, "Saving layout");
        }
    }

    async function newDiagram() {
        const name = await promptDialog({ title: "New diagram", label: "Diagram name", placeholder: "e.g. Season 1 lore web" });
        if (!name) return;
        try {
            const record = await createRecord("diagrams", { name, kind: "custom", nodes: [], visibleTypes: Array.from(visible), scope: { seasonId: scopeSeason, arcId: scopeArc } });
            activeDiagramId = record.id;
            renderAll();
            toast("Diagram created — arrange it, then save the layout.", "success");
        } catch (err) {
            toastError(err, "Creating diagram");
        }
    }

    /* ---------------- rendering ---------------- */
    function build() {
        if (!graph) return;
        const data = applySavedLayout(buildGraphData());
        graph.setData(data);
        if (focus) {
            const [collection, id] = focus.split(":");
            graph.select(`${collection}:${id}`);
        }
        if (searchTerm) graph.search(searchTerm);
    }

    function renderAll() {
        renderSwitcher();
        renderLegend();
        const doc = layoutDoc();
        if (doc?.scope) {
            if (doc.scope.seasonId) {
                scopeSeason = doc.scope.seasonId;
                seasonSelect.value = scopeSeason;
            }
            if (doc.scope.arcId) {
                scopeArc = doc.scope.arcId;
                arcSelect.value = scopeArc;
            }
            if (doc.scope.seasonId || doc.scope.arcId || activeDiagramId === MAIN_DIAGRAM_ID) {
                // only adopt scope when loading a saved custom diagram
                if (activeDiagramId !== MAIN_DIAGRAM_ID) {
                    scopeSeason = doc.scope.seasonId || "";
                    scopeArc = doc.scope.arcId || "";
                    seasonSelect.value = scopeSeason;
                    arcSelect.value = scopeArc;
                }
            }
        }
        build();
    }

    requestAnimationFrame(() => {
        graph = createGraph(canvas, {
            showEdgeLabels: false,
            linkDistance: 118,
            charge: 0.9,
            onSelect: (node) => {
                if (!node) {
                    inspector.hidden = true;
                    return;
                }
                const { collection, id } = node.entity;
                const doc = byId(collection, id);
                if (!doc) return;
                inspector.hidden = false;
                inspector.innerHTML = "";
                const ent = ENTITIES[collection];
                inspector.append(
                    el("header", {}, [
                        el("span", { text: ent.title(doc) }),
                        el("button", { class: "icon-btn x", type: "button", "aria-label": "Close", onclick: () => { inspector.hidden = true; graph.clearSelection(); } }, icon("x")),
                    ]),
                    el("div", { class: "body" }, [
                        el("div", { class: "row", style: { gap: "0.3rem" } }, [badge(ent.label, "ghost"), doc.status ? statusBadge(doc.status) : null]),
                        el("p", { text: summaryOf(collection, doc) }),
                        el("div", { class: "row", style: { gap: "0.4rem" } }, [
                            el("a", { class: "btn btn-primary btn-sm", href: detailPath(collection, doc.id) }, "Open"),
                            el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { navigate(detailPath(collection, doc.id)); } }, "Record"),
                        ]),
                    ])
                );
            },
            onOpen: (node) => navigate(detailPath(node.entity.collection, node.entity.id)),
        });
        renderAll();
    });

    const unsub = subscribe((ev) => {
        if ((ev.type === "loaded" || ev.type === "changed") && root.isConnected && graph) {
            clearTimeout(t);
            t = setTimeout(() => {
                renderSwitcher();
                renderLegend();
            }, 400);
        }
    });
    let t = null;

    root.addEventListener("planner:dispose", () => {
        unsub();
        clearTimeout(t);
        if (graph) graph.destroy();
    });
    return root;
}

function summaryOf(collection, doc) {
    const raw =
        doc.shortDescription ||
        doc.description ||
        doc.mainConflict ||
        doc.personalitySummary ||
        doc.objective ||
        doc.type ||
        "";
    const text = String(raw).replace(/[#*`>_~]/g, "").replace(/\s+/g, " ").trim();
    return text ? (text.length > 220 ? text.slice(0, 219) + "…" : text) : "No description yet.";
}
