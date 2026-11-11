/* Story Planner — Lore database (encyclopedia) and the lore web diagram. */

import { el, icon, toArray } from "../util.js";
import {activeDocs, byId} from "../store.js";
import { OPTIONS } from "../schema.js";
import { listView } from "../components/datatable.js";
import {pageHead, badge, knowledgeBadge} from "../components/ui.js";
import {createAndEdit} from "../components/editor.js";
import { navigate, detailPath } from "../router.js";
import { createGraph } from "../graph.js";

export function lorePage(params = new URLSearchParams()) {
    const root = listView({
        collection: "lore",
        params,
        title: "Lore database",
        lead: "The encyclopedia of the SMP. Knowledge classification keeps creator secrets separate from what characters actually know.",
        createLabel: "New lore entry",
        actions: [el("a", { class: "btn btn-ghost", href: "#/lore?web=1" }, [icon("share"), "Lore web"])],
        filters: [
            { key: "category", label: "Category", options: OPTIONS.loreCategory },
            { key: "knowledge", label: "Knowledge", options: OPTIONS.knowledge },
        ],
        sorts: [
            { key: "title", label: "Alphabetical" },
            { key: "updatedAt", label: "Last modified" },
            { key: "discoveryDate", label: "Discovery date" },
        ],
        defaultSort: "title",
        columns: [
            {
                key: "title",
                label: "Lore",
                get: (d) =>
                    el("div", { style: { display: "flex", flexDirection: "column", gap: "1px", minWidth: "220px" } }, [
                        el("span", { class: "cell-strong", text: d.title || "Untitled" }),
                        el("span", { class: "field-hint", text: [d.code, d.category].filter(Boolean).join(" · ") }),
                    ]),
            },
            { key: "knowledge", label: "Knowledge", get: (d) => knowledgeBadge(d.knowledge) || "—" },
            {
                key: "shortDescription",
                label: "Summary",
                sortable: false,
                nowrap: false,
                get: (d) => truncateText(d.shortDescription || d.fullExplanation, 110),
            },
            {
                key: "links",
                label: "Links",
                sortable: false,
                get: (d) => {
                    const n =
                        toArray(d.characterIds).length + toArray(d.eventIds).length + toArray(d.locationIds).length + toArray(d.factionIds).length + toArray(d.relatedLoreIds).length;
                    return String(n);
                },
            },
            { key: "discoveryDate", label: "Discovered", get: (d) => d.discoveryDate || "—" },
        ],
        emptyTitle: "No lore yet",
        emptyMessage: "Capture world rules, ancient history, artefacts and secrets. Link them to characters and events as the story develops.",
    });
    return root;
}

function truncateText(text, n) {
    const s = String(text || "").replace(/[#*`>_~]/g, "").replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/* ------------------------------------------------------------- lore web */

export function loreWebPage() {
    const root = el("div", { class: "page" });
    root.appendChild(
        pageHead("Lore web", "How the knowledge connects: which entries explain, contradict or depend on others.", [
            el("a", { class: "btn btn-ghost", href: "#/lore" }, [icon("chevronLeft"), "Back to lore"]),
            el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("lore") }, [icon("plus"), "New lore entry"]),
        ])
    );

    const lore = activeDocs("lore");
    if (!lore.length) {
        return el("div", {});
    }

    const shell = el("div", { class: "diagram-shell" }, [
        el("div", { class: "dg-toolbar" }, [
            el("input", { type: "search", placeholder: "Search lore…", style: { maxWidth: "200px" }, oninput: (e) => graph && graph.search(e.target.value) }),
            el("div", { class: "dg-legend" }, [
                el("span", {}, [el("i", { style: { background: "var(--c-lore)" } }), "Lore"]),
                el("span", { class: "field-hint", text: `${lore.length} entries` }),
            ]),
            el("span", { style: { marginLeft: "auto", display: "flex", gap: "0.35rem" } }, [
                el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => graph && graph.relayout() }, [icon("refresh"), "Re-layout"]),
            ]),
        ]),
        el("div", { class: "diagram-canvas" }),
    ]);
    const canvas = shell.querySelector(".diagram-canvas");
    const inspector = el("div", { class: "dg-inspector", hidden: true });
    shell.appendChild(inspector);
    root.appendChild(shell);

    let graph = null;
    requestAnimationFrame(() => {
        const outer = shell;
        outer.appendChild(
            el("div", { class: "dg-controls" }, [
                el("button", { type: "button", title: "Zoom in", onclick: () => graph && graph.zoomIn() }, icon("zoomIn")),
                el("button", { type: "button", title: "Zoom out", onclick: () => graph && graph.zoomOut() }, icon("zoomOut")),
                el("button", { type: "button", title: "Fit", onclick: () => graph && graph.fit() }, icon("maximize")),
                el("button", { type: "button", title: "Re-layout", onclick: () => graph && graph.relayout() }, icon("reset")),
            ])
        );
        const nodes = lore.map((l) => ({
            id: `lore:${l.id}`,
            label: l.title,
            sub: l.category || "",
            type: "lore",
            color: l.knowledge === "Secret" ? "#c0392b" : l.knowledge === "Restricted Knowledge" ? "#b7791f" : "var(--c-lore)",
            entity: { collection: "lore", id: l.id },
        }));
        const edges = [];
        for (const l of lore) {
            for (const otherId of toArray(l.relatedLoreIds)) {
                if (!byId("lore", otherId)) continue;
                edges.push({ source: `lore:${l.id}`, target: `lore:${otherId}`, label: "related" });
            }
            for (const evId of toArray(l.eventIds)) {
                if (!byId("events", evId)) continue;
                edges.push({ source: `lore:${l.id}`, target: `lore:${l.id}`, label: "" }); // filtered below
            }
        }
        // add event / character hubs as secondary nodes so the web is explorable
        const relatedEvents = new Set(lore.flatMap((l) => toArray(l.eventIds).map(String)));
        relatedEvents.forEach((id) => {
            const e = byId("events", id);
            if (!e) return;
            nodes.push({ id: `events:${id}`, label: e.title, sub: "event", type: "events", color: "var(--c-event)", shape: "circle", entity: { collection: "events", id } });
        });
        const cleanEdges = edges.filter((e) => e.source !== e.target);
        for (const l of lore) {
            for (const evId of toArray(l.eventIds)) {
                if (!byId("events", evId)) continue;
                cleanEdges.push({ source: `lore:${l.id}`, target: `events:${evId}`, label: "revealed in" });
            }
        }

        graph = createGraph(canvas, {
            showEdgeLabels: false,
            linkDistance: 130,
            onSelect: (node) => {
                if (!node) {
                    inspector.hidden = true;
                    return;
                }
                const doc = byId(node.entity.collection, node.entity.id);
                if (!doc) return;
                inspector.hidden = false;
                inspector.innerHTML = "";
                inspector.append(
                    el("header", {}, [
                        el("span", { text: doc.title || doc.name }),
                        el("button", { class: "icon-btn x", type: "button", "aria-label": "Close", onclick: () => { inspector.hidden = true; graph.clearSelection(); } }, icon("x")),
                    ]),
                    el("div", { class: "body" }, [
                        node.entity.collection === "lore" ? knowledgeBadge(doc.knowledge) : badge(doc.status || "Event", "ghost"),
                        el("p", { text: truncateText(doc.shortDescription || doc.description, 220) || "No description." }),
                        el("a", { class: "btn btn-primary btn-sm", href: detailPath(node.entity.collection, doc.id) }, "Open entry"),
                    ])
                );
            },
            onOpen: (node) => navigate(detailPath(node.entity.collection, node.entity.id)),
        });
        graph.setData({ nodes, edges: cleanEdges });
    });

    root.addEventListener("planner:dispose", () => {
        if (graph) graph.destroy();
    });
    return root;
}
