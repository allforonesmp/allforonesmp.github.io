/* Story Planner — Factions and the faction relationship diagram. */

import { el, icon, toArray, fmtDate, compareText } from "../util.js";
import {activeDocs, byId} from "../store.js";
import { OPTIONS } from "../schema.js";
import { listView } from "../components/datatable.js";
import { pageHead, badge, statusBadge, emptyState } from "../components/ui.js";
;
;
import {createAndEdit} from "../components/editor.js";
import { navigate, detailPath } from "../router.js";
import { createGraph } from "../graph.js";

export function factionsPage(params) {
    const root = el("div", { class: "page" });
    let view = params.get("view") || "cards";

    root.appendChild(
        pageHead("Factions", "Organisations, their goals, their members and how they stand with one another over time.", [
            el("a", { class: "btn btn-ghost", href: "#/factions?view=relations" }, [icon("share"), "Faction relations"]),
            el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("factions") }, [icon("plus"), "New faction"]),
        ])
    );

    if (view === "relations") {
        root.appendChild(factionRelationsView());
        return root;
    }

    const factions = activeDocs("factions").sort((a, b) => compareText(a.name, b.name));
    if (!factions.length) {
        root.appendChild(
            el("div", { class: "card" }, [
                emptyState({
                    iconName: "flag",
                    title: "No factions yet",
                    message: "Factions give the world its politics — alliances, rivalries and betrayals.",
                    action: el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("factions") }, [icon("plus"), "Create a faction"]),
                }),
            ])
        );
        return root;
    }

    const grid = el("div", { class: "grid cols-3" });
    factions.forEach((f) => {
        const members = activeDocs("characters").filter((c) => String(c.factionId) === String(f.id));
        const rels = activeDocs("faction_relationships").filter((r) => String(r.aId) === String(f.id) || String(r.bId) === String(f.id));
        grid.appendChild(
            el("a", { class: "arc-card", href: detailPath("factions", f.id), style: { "--accent": "var(--c-faction)" } }, [
                el("div", { class: "row", style: { gap: "0.5rem" } }, [
                    f.logo ? el("img", { src: f.logo, alt: "", class: "avatar-img sm", loading: "lazy" }) : el("span", { class: "li-mark", style: { background: "var(--error-soft)", color: "var(--c-faction)" } }, icon("flag")),
                    el("h3", {}, [el("span", { text: f.name || "Unnamed faction" })]),
                ]),
                el("div", { class: "row", style: { gap: "0.3rem" } }, [statusBadge(f.status), f.foundedDate ? badge(fmtDate(f.foundedDate), "ghost") : null]),
                f.description ? el("p", { text: stripMd(f.description) }) : null,
                el("div", { class: "arc-foot" }, [
                    el("span", { text: `${members.length} members` }),
                    el("span", { text: "·" }),
                    el("span", { text: `${rels.length} relations` }),
                    f.leaderId && byId("characters", f.leaderId) ? el("span", { text: `· led by ${byId("characters", f.leaderId).name}` }) : null,
                ]),
            ])
        );
    });
    root.appendChild(grid);
    return root;
}

function stripMd(text) {
    return String(text || "").replace(/[#*`>_~]/g, "").replace(/\n+/g, " ").trim().slice(0, 170);
}

export function factionRelationsView() {
    const root = el("div", { class: "stack" });
    const factions = activeDocs("factions");
    const rels = activeDocs("faction_relationships");

    if (!factions.length) {
        return el("div", { class: "card" }, [emptyState({ iconName: "flag", title: "No factions to map", message: "Create factions first, then record how they stand with each other." })]);
    }

    const shell = el("div", { class: "diagram-shell" }, [
        el("div", { class: "dg-toolbar" }, [
            el("input", { type: "search", placeholder: "Search factions…", style: { maxWidth: "200px" }, oninput: (e) => graph && graph.search(e.target.value) }),
            el("div", { class: "dg-legend" }, [
                el("span", {}, [el("i", { style: { background: "var(--c-faction)" } }), "Faction"]),
                el("span", { class: "field-hint", text: `${rels.length} relations` }),
            ]),
            el("span", { style: { marginLeft: "auto", display: "flex", gap: "0.35rem" } }, [
                el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => graph && graph.relayout() }, [icon("refresh"), "Re-layout"]),
                el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => createAndEdit("faction_relationships") }, [icon("plus"), "New relation"]),
            ]),
        ]),
        el("div", { class: "diagram-canvas" }),
    ]);
    const canvas = shell.querySelector(".diagram-canvas");
    shell.appendChild(
        el("div", { class: "dg-controls" }, [
            el("button", { type: "button", title: "Zoom in", onclick: () => graph && graph.zoomIn() }, icon("zoomIn")),
            el("button", { type: "button", title: "Zoom out", onclick: () => graph && graph.zoomOut() }, icon("zoomOut")),
            el("button", { type: "button", title: "Fit", onclick: () => graph && graph.fit() }, icon("maximize")),
            el("button", { type: "button", title: "Re-layout", onclick: () => graph && graph.relayout() }, icon("reset")),
        ])
    );
    root.appendChild(shell);

    const inspector = el("div", { class: "dg-inspector", hidden: true });
    shell.appendChild(inspector);

    let graph = null;
    requestAnimationFrame(() => {
        graph = createGraph(canvas, {
            linkDistance: 150,
            onSelect: (node) => {
                if (!node) {
                    inspector.hidden = true;
                    return;
                }
                const id = node.entity.id;
                const f = byId("factions", id);
                inspector.hidden = false;
                inspector.innerHTML = "";
                inspector.append(
                    el("header", {}, [
                        el("span", { text: f.name }),
                        el("button", { class: "icon-btn x", type: "button", onclick: () => { inspector.hidden = true; graph.clearSelection(); } }, icon("x")),
                    ]),
                    el("div", { class: "body" }, [
                        statusBadge(f.status),
                        el("div", { class: "ref-list" }, rels
                            .filter((r) => String(r.aId) === String(id) || String(r.bId) === String(id))
                            .map((r) => {
                                const otherId = String(r.aId) === String(id) ? r.bId : r.aId;
                                const other = byId("factions", otherId);
                                return el("div", { class: "row", style: { gap: "0.3rem", fontSize: "0.8rem" } }, [badge(r.type || "—", "ghost"), el("span", { text: other?.name || "?" })]);
                            })),
                        el("a", { class: "btn btn-primary btn-sm", href: detailPath("factions", id) }, "Open faction"),
                    ])
                );
            },
            onOpen: (node) => navigate(detailPath("factions", node.entity.id)),
        });

        const nodes = factions.map((f) => ({
            id: `factions:${f.id}`,
            label: f.name,
            sub: f.status || "",
            type: "factions",
            color: "var(--c-faction)",
            entity: { collection: "factions", id: f.id },
        }));
        const edges = rels
            .filter((r) => byId("factions", r.aId) && byId("factions", r.bId))
            .map((r) => ({ source: `factions:${r.aId}`, target: `factions:${r.bId}`, label: r.type || "" }));
        // include declared ally/enemy/rival links that have no relationship record yet
        for (const f of factions) {
            for (const [field, label] of [["allyFactionIds", "allies"], ["enemyFactionIds", "enemies"], ["rivalFactionIds", "rivals"]]) {
                for (const otherId of toArray(f[field])) {
                    if (!byId("factions", otherId)) continue;
                    const exists = edges.some(
                        (e) =>
                            (e.source === `factions:${f.id}` && e.target === `factions:${otherId}`) ||
                            (e.source === `factions:${otherId}` && e.target === `factions:${f.id}`)
                    );
                    if (!exists) edges.push({ source: `factions:${f.id}`, target: `factions:${otherId}`, label });
                }
            }
        }
        graph.setData({ nodes, edges });
    });

    root.addEventListener("planner:dispose", () => {
        if (graph) graph.destroy();
    });
    return root;
}

/* ------------------------------------------------------------- locations */

export function locationsPage(params = new URLSearchParams()) {
    return listView({
        collection: "locations",
        params,
        title: "Locations",
        lead: "Places that matter — with coordinates, dimension, screenshots and the events and factions tied to them.",
        createLabel: "New location",
        filters: [
            { key: "dimension", label: "Dimension", options: OPTIONS.dimension },
            { key: "type", label: "Type", options: OPTIONS.locationType },
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
                label: "Location",
                get: (d) =>
                    el("div", { class: "row", style: { gap: "0.5rem", minWidth: "200px" } }, [
                        toArray(d.images).length
                            ? el("img", { src: toArray(d.images)[0], alt: "", class: "avatar-img sm", style: { width: "38px", height: "38px" }, loading: "lazy" })
                            : el("span", { class: "li-mark" }, icon("mapPin")),
                        el("div", { style: { display: "flex", flexDirection: "column", gap: "1px" } }, [
                            el("span", { class: "cell-strong", text: d.name || "Unnamed" }),
                            el("span", { class: "field-hint", text: [d.code, d.coords].filter(Boolean).join(" · ") }),
                        ]),
                    ]),
            },
            { key: "dimension", label: "Dimension", get: (d) => d.dimension || "—" },
            { key: "type", label: "Type", get: (d) => d.type || "—" },
            { key: "condition", label: "Condition", get: (d) => d.condition || "—" },
            {
                key: "links",
                label: "Links",
                sortable: false,
                get: (d) => String(toArray(d.characterIds).length + toArray(d.eventIds).length + toArray(d.factionIds).length),
            },
        ],
        emptyTitle: "No locations yet",
        emptyMessage: "Document key builds, ruins, portals and hidden places so the map and the story stay in sync.",
    });
}
