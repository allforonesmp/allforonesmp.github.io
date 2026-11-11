/* Story Planner — Characters list, compare view, and Relationships board. */

import {el, icon, toArray, compareText} from "../util.js";
import {docs, activeDocs, byId} from "../store.js";
import {OPTIONS} from "../schema.js";
import { listView } from "../components/datatable.js";
import {pageHead, card, emptyState, badge, statusBadge, avatarFor} from "../components/ui.js";
import { createAndEdit, openEditor } from "../components/editor.js";
import { navigate, detailPath } from "../router.js";
import { renderMarkdown } from "../md.js";
import { createGraph } from "../graph.js";

export function charactersPage(params = new URLSearchParams()) {
    return listView({
        collection: "characters",
        params,
        title: "Characters",
        lead: "Player characters and NPCs. Every event, faction, relationship and piece of lore can point back to these profiles.",
        createLabel: "New character",
        actions: [
            el("a", { class: "btn btn-ghost", href: "#/characters?compare=1" }, [icon("columns"), "Compare"]),
            el("a", { class: "btn btn-ghost", href: "#/relationships" }, [icon("link"), "Relationship map"]),
        ],
        filters: [
            { key: "status", label: "Status", options: OPTIONS.characterStatus },
            { key: "type", label: "Type", options: OPTIONS.characterType },
            { key: "factionId", label: "Faction", collection: "factions" },
            { key: "seasonId", label: "Season", collection: "seasons" },
        ],
        sorts: [
            { key: "title", label: "Alphabetical" },
            { key: "updatedAt", label: "Last modified" },
            { key: "firstAppearance", label: "First appearance" },
        ],
        defaultSort: "title",
        columns: [
            {
                key: "title",
                label: "Character",
                get: (d) =>
                    el("div", { class: "row", style: { gap: "0.5rem", minWidth: "200px" } }, [
                        avatarFor(d, "sm"),
                        el("div", { style: { display: "flex", flexDirection: "column", gap: "1px" } }, [
                            el("span", { class: "cell-strong", text: d.name || "Unnamed" }),
                            el("span", { class: "field-hint", text: [d.username && `@${d.username}`, d.code].filter(Boolean).join(" · ") }),
                        ]),
                    ]),
            },
            { key: "status", label: "Status", get: (d) => statusBadge(d.status) || "—" },
            { key: "type", label: "Type", get: (d) => d.type || "—" },
            { key: "factionId", label: "Faction", sortable: false, get: (d) => byId("factions", d.factionId)?.name || "—" },
            {
                key: "roles",
                label: "Roles",
                sortable: false,
                get: (d) => toArray(d.roles).slice(0, 2).map((r) => badge(r, "ghost")),
            },
            {
                key: "appearances",
                label: "Events",
                sortable: false,
                get: (d) => {
                    const n = activeDocs("events").filter((e) =>
                        ["mainCharacterIds", "supportingCharacterIds", "antagonistIds", "affectedCharacterIds"].some((f) => toArray(e[f]).map(String).includes(String(d.id)))
                    ).length;
                    return String(n);
                },
            },
        ],
        emptyTitle: "No characters yet",
        emptyMessage: "Create profiles for the people driving the story — players, NPCs, and anything in between.",
    });
}

/* -------------------------------------------------------------- compare */

export function comparePage() {
    const root = el("div", { class: "page" });
    const chosen = [];
    const all = activeDocs("characters").sort((a, b) => compareText(a.name, b.name));

    root.appendChild(
        pageHead("Compare characters", "Put up to four characters side by side: personality, motivations, factions, shared events and conflicting goals.", [
            el("a", { class: "btn btn-ghost", href: "#/characters" }, [icon("chevronLeft"), "Back to characters"]),
        ])
    );

    const picker = el("div", { class: "row", style: { flexWrap: "wrap", gap: "0.35rem" } });
    const tableHost = el("div", {});

    const render = () => {
        picker.innerHTML = "";
        all.slice(0, 60).forEach((c) => {
            const on = chosen.includes(c.id);
            picker.appendChild(
                el("button", {
                    class: `chip-button${on ? " on" : ""}`,
                    type: "button",
                    onclick: () => {
                        const idx = chosen.indexOf(c.id);
                        if (idx >= 0) chosen.splice(idx, 1);
                        else if (chosen.length < 4) chosen.push(c.id);
                        render();
                    },
                }, [c.name, el("span", { class: "n", text: c.status || "" })])
            );
        });
        tableHost.innerHTML = "";
        if (chosen.length < 2) {
            tableHost.appendChild(card({ title: "Pick at least two", iconName: "columns", body: [el("p", { class: "field-hint", text: "Select characters above to build a comparison." })] }));
            return;
        }
        tableHost.appendChild(compareTable(chosen.map((id) => byId("characters", id)).filter(Boolean)));
    };

    root.append(card({ title: "Characters", iconName: "users", body: [picker] }), tableHost);
    render();
    return root;
}

function compareTable(people) {
    const rows = [
        ["Status", (p) => statusBadge(p.status) || "—"],
        ["Type", (p) => p.type || "—"],
        ["Faction", (p) => (byId("factions", p.factionId) ? el("a", { href: detailPath("factions", p.factionId), text: byId("factions", p.factionId).name }) : "—")],
        ["Roles", (p) => el("div", { class: "chip-row" }, toArray(p.roles).map((r) => badge(r, "ghost")))],
        ["Positive traits", (p) => shareRow(p, "positiveTraits", people)],
        ["Negative traits", (p) => shareRow(p, "negativeTraits", people)],
        ["Fears", (p) => shareRow(p, "fears", people)],
        ["Primary motivation", (p) => p.primaryMotivation || "—"],
        ["Goals", (p) => (p.goals ? el("div", { class: "prose", style: { fontSize: "0.82rem" }, html: renderMarkdown(p.goals) }) : "—")],
        [
            "Shared events",
            (p) => {
                const pEvents = new Set(
                    activeDocs("events")
                        .filter((e) => ["mainCharacterIds", "supportingCharacterIds", "antagonistIds"].some((f) => toArray(e[f]).map(String).includes(String(p.id))))
                        .map((e) => e.id)
                );
                const shared = people.filter((o) => o.id !== p.id).flatMap((o) =>
                    activeDocs("events")
                        .filter((e) => pEvents.has(e.id) && ["mainCharacterIds", "supportingCharacterIds", "antagonistIds"].some((f) => toArray(e[f]).map(String).includes(String(o.id))))
                        .map((e) => e.title)
                );
                return shared.length ? el("span", { text: Array.from(new Set(shared)).slice(0, 4).join(", ") }) : "None";
            },
        ],
        [
            "Relationship",
            (p) => {
                const rels = docs("character_relationships").filter(
                    (r) => String(r.aId) === String(p.id) || String(r.bId) === String(p.id)
                );
                const text = rels
                    .map((r) => {
                        const otherId = String(r.aId) === String(p.id) ? r.bId : r.aId;
                        return people.some((o) => String(o.id) === String(otherId)) ? `${r.type || "link"} → ${byId("characters", otherId)?.name || "?"}` : null;
                    })
                    .filter(Boolean);
                return text.length ? el("div", { class: "chip-row" }, text.map((t) => badge(t, "ghost"))) : "—";
            },
        ],
        ["Conflicting goals", () => el("span", { class: "field-hint", text: "Compare motivations above to spot clashes." })],
    ];

    const table = el("table", { class: "data compare-table" });
    const thead = el("thead");
    const hr = el("tr", {}, [el("th", { text: "Attribute" }), ...people.map((p) => el("th", { text: p.name }))]);
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = el("tbody");
    rows.forEach(([label, fn]) => {
        const tr = el("tr", { style: { cursor: "default" } }, [el("td", { class: "cell-strong", text: label })]);
        people.forEach((p) => {
            const td = el("td", {});
            const value = fn(p);
            if (value instanceof Node) td.appendChild(value);
            else td.textContent = value ?? "—";
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return el("div", { class: "card" }, [el("div", { class: "table-wrap" }, [table])]);
}

function shareRow(person, field, people) {
    const values = toArray(person[field]);
    if (!values.length) return "—";
    const others = new Set(people.filter((p) => p.id !== person.id).flatMap((p) => toArray(p[field])));
    return el(
        "div",
        { class: "chip-row" },
        values.map((v) => badge(v, others.has(v) ? "success" : "ghost", { title: others.has(v) ? "Shared with another selected character" : "" }))
    );
}

/* --------------------------------------------------------- relationships */

export function relationshipsPage(params) {
    const root = el("div", { class: "page" });
    const rels = activeDocs("character_relationships");
    let filterType = params.get("type") || "";
    let filterChar = params.get("character") || "";
    let view = params.get("view") || "map";

    root.appendChild(
        pageHead("Relationships", "Every relationship is a record with its own history, so a friendship can become a rivalry without losing what came before.", [
            el("button", { class: "btn btn-ghost", type: "button", onclick: () => navigate("#/characters?compare=1") }, [icon("columns"), "Compare characters"]),
            el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("character_relationships") }, [icon("plus"), "New relationship"]),
        ])
    );

    const seg = el("div", { class: "segmented" }, [
        ["map", "Relationship map"],
        ["list", "List"],
    ].map(([id, label]) =>
        el("button", {
            type: "button",
            class: view === id ? "active" : "",
            onclick: () => {
                view = id;
                Array.from(seg.children).forEach((c) => c.classList.remove("active"));
                seg.querySelectorAll("button")[["map", "list"].indexOf(id)].classList.add("active");
                render();
            },
        }, label)
    ));

    const typeSelect = el("select", { class: "select-sm" }, [
        el("option", { value: "", text: "All relationship types" }),
        ...OPTIONS.relType.map((t) => el("option", { value: t, selected: filterType === t, text: t })),
    ]);
    typeSelect.addEventListener("change", () => { filterType = typeSelect.value; render(); });

    const charSelect = el("select", { class: "select-sm" }, [
        el("option", { value: "", text: "All characters" }),
        ...activeDocs("characters").map((c) => el("option", { value: c.id, selected: filterChar === c.id, text: c.name })),
    ]);
    charSelect.addEventListener("change", () => { filterChar = charSelect.value; render(); });

    const toolbar = el("div", { class: "toolbar" }, [seg, typeSelect, charSelect]);
    const stage = el("div", {});
    root.append(toolbar, stage);

    let graph = null;

    function filtered() {
        return rels
            .filter((r) => (filterType ? r.type === filterType : true))
            .filter((r) => (filterChar ? String(r.aId) === String(filterChar) || String(r.bId) === String(filterChar) : true));
    }

    function render() {
        if (graph) {
            graph.destroy();
            graph = null;
        }
        stage.innerHTML = "";
        if (view === "map") stage.appendChild(mapView());
        else stage.appendChild(listRelView());
    }

    function mapView() {
        const list = filtered();
        if (!rels.length) {
            return el("div", { class: "card" }, [
                emptyState({
                    iconName: "link",
                    title: "No relationships recorded",
                    message: "Create a relationship between two characters to start building the relationship map.",
                    action: el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("character_relationships") }, [icon("plus"), "New relationship"]),
                }),
            ]);
        }
        const involved = new Set();
        list.forEach((r) => {
            involved.add(String(r.aId));
            involved.add(String(r.bId));
        });
        if (filterChar) involved.add(String(filterChar));
        const nodes = Array.from(involved)
            .map((id) => byId("characters", id))
            .filter(Boolean)
            .map((c) => ({
                id: `characters:${c.id}`,
                label: c.name,
                sub: c.status || "",
                type: "characters",
                color: relationColourFor(c.id),
                entity: { collection: "characters", id: c.id },
            }));

        const edges = list
            .filter((r) => byId("characters", r.aId) && byId("characters", r.bId))
            .map((r) => ({
                source: `characters:${r.aId}`,
                target: `characters:${r.bId}`,
                label: r.type || "",
                dashed: ["Enemies", "Rivals", "Betrayal", "Manipulation"].includes(r.type),
            }));

        const shell = el("div", { class: "diagram-shell" }, [
            el("div", { class: "dg-toolbar" }, [
                el("input", { type: "search", placeholder: "Search characters…", style: { maxWidth: "200px" }, oninput: (e) => graph && graph.search(e.target.value) }),
                el("div", { class: "dg-legend" }, [
                    el("span", {}, [el("i", { style: { background: "var(--c-character)" } }), "Character"]),
                    el("span", { class: "field-hint", text: `${nodes.length} characters · ${edges.length} relationships` }),
                ]),
                el("span", { style: { marginLeft: "auto", display: "flex", gap: "0.35rem" } }, [
                    el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => graph && graph.relayout() }, [icon("refresh"), "Re-layout"]),
                    el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => createAndEdit("character_relationships") }, [icon("plus"), "New"]),
                ]),
            ]),
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
                el("button", { type: "button", title: "Re-layout", onclick: () => graph && graph.relayout() }, icon("reset")),
            ])
        );

        requestAnimationFrame(() => {
            graph = createGraph(canvas, {
                showEdgeLabels: true,
                onSelect: (node) => {
                    if (!node) {
                        inspector.hidden = true;
                        return;
                    }
                    const c = byId("characters", node.entity.id);
                    inspector.hidden = false;
                    inspector.innerHTML = "";
                    const header = el("header", {}, [el("span", { text: c.name }), el("button", { class: "icon-btn x", type: "button", "aria-label": "Close", onclick: () => { inspector.hidden = true; graph.clearSelection(); } }, icon("x"))]);
                    const body = el("div", { class: "body" }, [
                        el("div", { class: "row", style: { gap: "0.3rem" } }, [statusBadge(c.status), badge(c.type || "Character", "ghost")]),
                        el("div", { class: "ref-list" }, docs("character_relationships")
                            .filter((r) => String(r.aId) === String(c.id) || String(r.bId) === String(c.id))
                            .map((r) => {
                                const otherId = String(r.aId) === String(c.id) ? r.bId : r.aId;
                                const other = byId("characters", otherId);
                                return el("div", { class: "row", style: { gap: "0.3rem", fontSize: "0.8rem" } }, [badge(r.type || "link", "ghost"), el("span", { text: other?.name || "?" })]);
                            })),
                        el("a", { class: "btn btn-primary btn-sm", href: detailPath("characters", c.id) }, "Open profile"),
                    ]);
                    inspector.append(header, body);
                },
                onOpen: (node) => navigate(detailPath("characters", node.entity.id)),
            });
            graph.setData({ nodes, edges });
        });
        return shell;
    }

    function listRelView() {
        const list = filtered();
        if (!list.length) {
            return el("div", { class: "card" }, [emptyState({ iconName: "link", title: "No relationships match", message: "Try clearing the filters." })]);
        }
        const wrap = el("div", { class: "grid cols-2" });
        list
            .slice()
            .sort((a, b) => compareText(a.type, b.type))
            .forEach((r) => {
                const a = byId("characters", r.aId);
                const b = byId("characters", r.bId);
                const steps = toArray(r.historySteps);
                wrap.appendChild(
                    el("div", { class: "card" }, [
                        el("div", { class: "card-head" }, [
                            el("h2", { style: { fontSize: "0.92rem" } }, [
                                el("span", { text: a?.name || "(deleted)" }),
                                el("span", { style: { opacity: 0.5 }, text: "↔" }),
                                el("span", { text: b?.name || "(deleted)" }),
                            ]),
                            el("div", { class: "head-actions" }, [
                                el("button", { class: "icon-btn", type: "button", style: { width: "30px", height: "30px" }, title: "Edit", onclick: () => openEditor("character_relationships", r.id) }, icon("edit")),
                            ]),
                        ]),
                        el("div", { class: "card-body stack sm" }, [
                            el("div", { class: "row", style: { gap: "0.3rem" } }, [badge(r.type || "—", "solid"), statusBadge(r.status), r.strength ? badge(`Strength ${r.strength}/5`, "ghost") : null]),
                            steps.length
                                ? el("div", { class: "relation-hist" }, steps.flatMap((s, i) => [
                                      el("span", { class: `rh-step${i === steps.length - 1 ? " cur" : ""}`, text: s.type || "—", title: s.note || "" }),
                                      i < steps.length - 1 ? el("span", { class: "rh-arrow", text: "→" }) : null,
                                  ]))
                                : null,
                            r.description ? el("div", { class: "prose", style: { fontSize: "0.85rem" }, html: renderMarkdown(r.description) }) : null,
                            el("div", { class: "row", style: { gap: "0.35rem" } }, [
                                a ? el("a", { class: "link-btn", href: detailPath("characters", a.id) }, `Open ${a.name}`) : null,
                                b ? el("a", { class: "link-btn", href: detailPath("characters", b.id) }, `Open ${b.name}`) : null,
                            ]),
                        ]),
                    ])
                );
            });
        return wrap;
    }

    render();
    root.addEventListener("planner:dispose", () => {
        if (graph) graph.destroy();
    });
    return root;
}

function relationColourFor(id) {
    const hues = ["#7b5bd6", "#4a90e2", "#0f9d8f", "#b7791f", "#c0392b", "#d53f8c", "#2f855a"];
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return hues[h % hues.length];
}
