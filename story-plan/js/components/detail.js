/* AllForOne Story Planner — generic entity detail view.
 *
 * Read-first presentation of a record: schema-driven overview, derived
 * cross-references (never duplicated data), per-entity extras such as a
 * character's timeline or an event's dependency chain, plus change history.
 */

import { el, clear, icon, toArray, fmtDate, relTime, truncate, parseDate, MONTHS } from "../util.js";
import { ENTITIES } from "../schema.js";
import { renderMarkdown } from "../md.js";
import { byId, docs, referencesGrouped, historyFor, archiveRecord, subscribe, ensureHistory, updateRecord } from "../store.js";
import { openEditor, createAndEdit } from "./editor.js";
import { toast, toastError, emptyState, statusBadge, importanceBadge, knowledgeBadge, badge, refChip, avatarFor, confirmDialog } from "./ui.js";
import { navigate, detailPath } from "../router.js";

/* ------------------------------------------------------------- utilities */

function fieldValueNode(field, doc) {
    const value = doc[field.key];
    const isEmpty = value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length);
    if (isEmpty) return null;

    switch (field.type) {
        case "markdown":
        case "textarea":
            return el("div", { class: "prose", html: renderMarkdown(value) });

        case "ref": {
            const target = byId(field.refType, value);
            return target
                ? refChip(field.refType, value)
                : el("span", { class: "def-value empty-val", text: "(deleted record)" });
        }

        case "refs":
            return el("div", { class: "chip-row" }, toArray(value).map((id) => refChip(field.refType, id)));

        case "tags":
            return el("div", { class: "chip-row" }, toArray(value).map((t) => el("span", { class: "chip", text: t })));

        case "bool":
            return el("span", { class: "badge", text: value ? "Yes" : "No" });

        case "multiselect":
            return el("div", { class: "chip-row" }, toArray(value).map((t) => badge(t)));

        case "date":
            return el("span", { text: fmtDate(value) || value });

        case "month":
            return el("span", { text: value ? valueLabelMonth(value) : value });

        case "image": {
            return el("div", { class: "thumb-row" }, [
                el("a", { href: value, target: "_blank", rel: "noopener noreferrer", class: "thumb" }, [
                    el("img", { src: value, alt: field.label, loading: "lazy" }),
                ]),
            ]);
        }

        case "images":
            return el(
                "div",
                { class: "thumb-row" },
                toArray(value).map((url) =>
                    el("a", { href: url, target: "_blank", rel: "noopener noreferrer", class: "thumb" }, [
                        /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url)
                            ? el("img", { src: url, alt: "", loading: "lazy" })
                            : el("div", { style: { display: "grid", placeItems: "center", height: "100%" } }, icon("file")),
                    ])
                )
            );

        case "historySteps":
            return el(
                "div",
                { class: "relation-hist", style: { flexWrap: "wrap" } },
                toArray(value).flatMap((step, i) => {
                    const parts = [el("span", { class: "rh-step cur", title: step.note || "", text: step.type || "—" })];
                    if (step.date) parts.push(el("span", { class: "field-hint", style: { marginLeft: "0.15rem" }, text: fmtDate(step.date) }));
                    if (i < value.length - 1) parts.push(el("span", { class: "rh-arrow", text: "→" }));
                    return parts;
                })
            );

        case "memberHistory":
            return el(
                "div",
                { class: "list" },
                toArray(value)
                    .slice()
                    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
                    .map((row) =>
                        el("div", { class: "row", style: { gap: "0.4rem", padding: "0.2rem 0" } }, [
                            el("span", { class: "badge ghost", text: row.action || "—" }),
                            el("span", { text: row.name || "(unnamed)" }),
                            row.date ? el("span", { class: "field-hint", text: fmtDate(row.date) }) : null,
                        ])
                    )
            );

        case "number":
            return el("span", { text: String(value) });

        default:
            return el("span", { text: String(value) });
    }
}

function valueLabelMonth(value) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(value));
    if (!m) return String(value);
    return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function sectionBlock(title, content) {
    return el("div", { class: "section-block" }, [el("h3", { text: title }), content]);
}

/* --------------------------------------------------------------- connections */

export function connectionsPanel(collection, doc, { exclude = [], compact = false } = {}) {
    const groups = referencesGrouped(collection, doc.id);
    const wrap = el("div", { class: "stack sm" });
    let total = 0;

    // explicit outgoing links first (fields declared on this record)
    const ent = ENTITIES[collection];
    const outgoingByType = new Map();
    for (const group of ent.groups) {
        for (const field of group.fields) {
            if (field.type !== "ref" && field.type !== "refs") continue;
            const ids = toArray(doc[field.key]);
            if (!ids.length) continue;
            if (!outgoingByType.has(field.refType)) outgoingByType.set(field.refType, new Set());
            ids.forEach((id) => outgoingByType.get(field.refType).add(String(id)));
        }
    }

    for (const [refType, ids] of outgoingByType) {
        if (exclude.includes(refType)) continue;
        const entDef = ENTITIES[refType];
        if (!entDef) continue;
        const list = Array.from(ids).filter((id) => byId(refType, id));
        if (!list.length) continue;
        total += list.length;
        wrap.appendChild(
            el("div", { class: "conn-group" }, [
                el("div", { class: "conn-label" }, [`Linked ${entDef.plural}`, el("span", { class: "n", text: String(list.length) })]),
                el(
                    "div",
                    { class: "ref-list" },
                    (compact ? list.slice(0, 6) : list).map((id) => refRow(refType, byId(refType, id)))
                ),
            ])
        );
    }

    // reverse references (records pointing at this one)
    for (const [refCollection, refs] of groups) {
        if (exclude.includes(refCollection)) continue;
        const entDef = ENTITIES[refCollection];
        if (!entDef) continue;
        wrap.appendChild(
            el("div", { class: "conn-group" }, [
                el("div", { class: "conn-label" }, [
                    `Referenced by ${entDef.plural}`,
                    el("span", { class: "n", text: String(refs.length) }),
                ]),
                el(
                    "div",
                    { class: "ref-list" },
                    (compact ? refs.slice(0, 6) : refs).map((r) => refRow(refCollection, r.doc, r.fieldLabel))
                ),
            ])
        );
        total += refs.length;
    }

    if (!total) {
        wrap.appendChild(
            emptyState({
                iconName: "link",
                title: "Nothing linked yet",
                message: `Link this ${ent.label.toLowerCase()} to other records in the editor and the connections appear here automatically.`,
            })
        );
    }
    return wrap;
}

export function refRow(collection, doc, hint) {
    if (!doc) return null;
    const ent = ENTITIES[collection];
    return el(
        "a",
        { class: "ref", href: detailPath(collection, doc.id), style: { "--accent": ent.color } },
        [
            el("span", { class: "ref-ico" }, icon(ent.icon)),
            el("span", { class: "ref-name", text: ent.title(doc) }),
            el("span", { class: "ref-side", text: hint || doc.status || doc.category || "" }),
        ]
    );
}

/* ---------------------------------------------------------------- history */

export function historyPanel(collection, doc) {
    const entries = historyFor(collection, doc.id);
    const wrap = el("div", {});
    if (!entries.length) {
        return emptyState({
            iconName: "clock",
            title: "No change history yet",
            message: "Edits recorded from now on will appear here with what changed, and who changed it.",
        });
    }
    entries.slice(0, 40).forEach((entry) => {
        const changes = Object.entries(entry.changes || {});
        wrap.appendChild(
            el("div", { class: "history-item" }, [
                el("span", { class: "hi-dot" }),
                el("div", { class: "hi-main" }, [
                    el("div", { class: "row between" }, [
                        el("strong", { style: { fontSize: "0.84rem" }, text: `Updated ${changes.length} field${changes.length === 1 ? "" : "s"}` }),
                        el("span", { class: "hi-when", text: relTime(entry.createdAt) }),
                    ]),
                    el("div", { class: "hi-when", text: `${entry.author || "unknown"} · ${new Date(entry.createdAt).toLocaleString()}` }),
                    entry.snapshot
                        ? el("button", {
                              class: "btn btn-ghost btn-sm",
                              type: "button",
                              style: { alignSelf: "flex-start", marginTop: "0.3rem" },
                              title: "Restore the field values from this snapshot",
                              onclick: async () => {
                                  const ok = await confirmDialog({
                                      title: "Restore this version?",
                                      message: "Field values from this snapshot are written back to the record. The current values are kept in history first, so nothing is lost.",
                                      confirmLabel: "Restore",
                                  });
                                  if (!ok) return;
                                  try {
                                      const { snapshot, id, _skipCurrent, ...rest } = entry;
                                      const current = byId(collection, doc.id);
                                      const patch = {};
                                      for (const [k, v] of Object.entries(snapshot)) {
                                          if (["id", "createdAt", "createdBy", "updatedAt", "updatedBy"].includes(k)) continue;
                                          if (JSON.stringify(current[k]) !== JSON.stringify(v)) patch[k] = v;
                                      }
                                      if (!Object.keys(patch).length) {
                                          toast("This snapshot already matches the record.", "info");
                                          return;
                                      }
                                      await updateRecord(collection, doc.id, patch, { immediate: true });
                                      toast("Version restored.", "success");
                                  } catch (err) {
                                      toastError(err, "Restoring version");
                                  }
                              },
                          }, [icon("restore"), "Restore this version"])
                        : null,
                    el(
                        "div",
                        { class: "hi-changes" },
                        changes.slice(0, 8).map(([field, delta]) =>
                            el("div", { class: "history-diff" }, [
                                el("span", { class: "f", text: labelForField(collection, field) }),
                                el("span", { class: "old", text: truncate(stringify(delta.from), 60) || "(empty)" }),
                                el("span", { text: "→" }),
                                el("span", { class: "new", text: truncate(stringify(delta.to), 60) || "(empty)" }),
                            ])
                        )
                    ),
                ]),
            ])
        );
    });
    return el("div", {}, [
        el("p", { class: "field-hint", style: { marginBottom: "0.5rem" }, text: "History is stored in the change_history collection — previous values are never overwritten." }),
        wrap,
    ]);
}

function stringify(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? "…" : x)).join(", ");
    return JSON.stringify(v);
}

function labelForField(collection, key) {
    const def = ENTITIES[collection];
    for (const g of def?.groups || []) {
        const f = g.fields.find((x) => x.key === key);
        if (f) return f.label;
    }
    return key;
}

/* --------------------------------------------------------------- main view */

export function entityDetail(collection, id) {
    const ent = ENTITIES[collection];
    const doc = byId(collection, id);
    const root = el("div", { class: "page" });

    if (!doc) {
        root.appendChild(
            emptyState({
                iconName: "alert",
                title: "Record not found",
                message: "It may have been deleted, or the link is out of date.",
                action: el("a", { class: "btn btn-primary", href: `#/${collection === "story_arcs" ? "arcs" : collection}` }, "Back to list"),
            })
        );
        return root;
    }

    /* ---- header ---- */
    const titleParts = [ent.title(doc)];
    const subBadges = [];
    if (doc.status) subBadges.push(statusBadge(doc.status));
    if (doc.importance) subBadges.push(importanceBadge(doc.importance));
    if (doc.knowledge) subBadges.push(knowledgeBadge(doc.knowledge));
    if (doc.kind) subBadges.push(badge(doc.kind, doc.kind === "Main Event" ? "gold" : "ghost"));
    if (doc.type) subBadges.push(badge(doc.type, "ghost"));
    if (doc.category) subBadges.push(badge(doc.category, "ghost"));
    if (doc.archived) subBadges.push(badge("Archived", "muted"));

    const subline = [];
    if (doc.code) subline.push(doc.code);
    if (doc.username) subline.push(`@${doc.username}`);
    if (doc.plannedDate) subline.push(`Planned ${fmtDate(doc.plannedDate)}`);
    if (doc.dimension) subline.push(doc.dimension);
    if (doc.coords) subline.push(doc.coords);
    if (doc.updatedAt) subline.push(`Updated ${relTime(doc.updatedAt)}`);

    const headLeft = el("div", { class: "detail-head-main" }, [
        el("div", { class: "row", style: { gap: "0.35rem" } }, [
            el("button", { class: "link-btn", type: "button", onclick: () => history.back(), style: { display: "inline-flex", alignItems: "center", gap: "0.25rem" } }, [
                icon("chevronLeft", ""),
                "Back",
            ]),
        ]),
        el("h1", {}, [
            ...titleParts,
            doc.archived ? badge("Archived", "muted") : null,
        ]),
        el("div", { class: "subline" }, [
            ...subBadges.filter(Boolean),
            ...subline.map((s, i) => el("span", { text: s, style: i || subBadges.length ? { opacity: 0.85 } : {} })),
        ]),
        doc.shortDescription || doc.description ? el("p", { class: "summary prose", html: renderMarkdown(doc.shortDescription || truncate(stripMd(doc.description), 320)) }) : null,
    ]);

    const actions = el("div", { class: "detail-head-side" }, [
        el("a", {
            class: "btn btn-ghost btn-sm",
            href: `#/diagrams?focus=${encodeURIComponent(collection)}:${encodeURIComponent(doc.id)}`,
            title: "Open in the storyline diagram",
        }, [icon("share"), "Diagram"]),
        el("button", {
            class: "btn btn-ghost btn-sm",
            type: "button",
            onclick: () => navigate(`#/timeline?${collection === "characters" ? "character" : "highlight"}=${encodeURIComponent(doc.id)}`),
        }, [icon("timeline"), "Timeline"]),
        el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => openEditor(collection, doc.id) }, [icon("edit"), "Edit"]),
        el("button", {
            class: "icon-btn",
            type: "button",
            title: doc.archived ? "Restore from archive" : "Archive",
            onclick: async () => {
                try {
                    await archiveRecord(collection, doc.id, !doc.archived);
                    toast(doc.archived ? "Restored." : "Archived — still searchable in the Archive.", "success");
                } catch (err) {
                    toastError(err, "Archiving");
                }
            },
        }, icon(doc.archived ? "restore" : "archive")),
    ]);

    const header = el("div", { class: "detail-head", style: { "--accent": ent.color } }, [
        doc.image ? avatarFor(doc) : null,
        headLeft,
        actions,
    ]);
    root.appendChild(header);

    /* ---- tabs ---- */
    const tabs = [{ id: "overview", label: "Overview" }];
    const extras = EXTRAS[collection] ? EXTRAS[collection](doc) : [];
    extras.forEach((x) => tabs.push({ id: x.id, label: x.label, count: x.count }));
    tabs.push({ id: "connections", label: "Connections" });
    tabs.push({ id: "history", label: "History" });

    const tabBar = el("div", { class: "tabs", role: "tablist" });
    const body = el("div", {});
    let active = new URLSearchParams((window.location.hash.split("?")[1] || "")).get("tab") || "overview";

    const renderTab = () => {
        clear(tabBar);
        tabs.forEach((t) => {
            tabBar.appendChild(
                el("button", {
                    type: "button",
                    class: t.id === active ? "active" : "",
                    onclick: () => {
                        active = t.id;
                        renderTab();
                    },
                }, [t.label, t.count != null ? el("span", { class: "count", text: String(t.count) }) : null])
            );
        });
        clear(body);
        if (active === "overview") body.appendChild(overviewPanel(collection, doc, extras));
        else if (active === "connections") body.appendChild(el("div", { class: "card" }, [el("div", { class: "card-body" }, [connectionsPanel(collection, doc)])]));
        else if (active === "history") {
            const host = el("div", { class: "card" }, [el("div", { class: "card-body" }, [el("div", { class: "loading-line" }, [el("span", { class: "spinner" }), el("span", { text: "Loading change history…" })])])]);
            body.appendChild(host);
            ensureHistory().then(() => {
                if (!host.isConnected) return;
                clear(host);
                host.appendChild(el("div", { class: "card-body" }, [historyPanel(collection, doc)]));
            });
        }
        else {
            const extra = extras.find((x) => x.id === active);
            body.appendChild(extra ? extra.render() : el("div", { text: "Nothing here." }));
        }
    };
    root.appendChild(tabBar);
    root.appendChild(body);
    renderTab();

    const unsub = subscribe((ev) => {
        if (ev.type === "changed" && ev.collection === collection && String(ev.id) === String(id)) {
            if (root.isConnected) {
                const parent = root.parentNode;
                const fresh = entityDetail(collection, id);
                if (parent) parent.replaceChild(fresh, root);
            }
        }
    });
    root.addEventListener("planner:dispose", () => unsub());
    return root;
}

function stripMd(text) {
    return String(text || "")
        .replace(/[#*`>_~]/g, "")
        .replace(/\n+/g, " ")
        .trim();
}

/* ------------------------------------------------------------- overview */

function overviewPanel(collection, doc, extras) {
    const ent = ENTITIES[collection];
    const wrap = el("div", { class: "stack" });

    const blocks = [];
    for (const group of ent.groups) {
        const content = [];
        const inline = [];
        for (const field of group.fields) {
            const node = fieldValueNode(field, doc);
            if (!node) continue;
            const isLong = field.type === "markdown" || field.type === "textarea" || field.type === "images" || field.type === "historySteps" || field.type === "memberHistory";
            if (isLong) {
                content.push(sectionBlock(field.label, node));
            } else {
                inline.push(el("div", { class: "def" }, [el("span", { class: "def-label", text: field.label }), el("div", { class: "def-value" }, [node])]));
            }
        }
        if (!inline.length && !content.length) continue;
        const cardBody = [];
        if (inline.length) cardBody.push(el("dl", { class: "defs" }, inline));
        cardBody.push(...content);
        blocks.push(
            el("div", { class: "card" }, [
                el("div", { class: "card-head" }, [el("h2", {}, [icon(ent.icon), group.title])]),
                el("div", { class: "card-body stack sm" }, cardBody),
            ])
        );
    }

    if (!blocks.length) {
        wrap.appendChild(
            emptyState({
                iconName: "edit",
                title: `This ${ent.label.toLowerCase()} is empty`,
                message: "Open the editor to start filling in the details.",
                action: el("button", { class: "btn btn-primary", onclick: () => openEditor(collection, doc.id) }, [icon("edit"), "Open editor"]),
            })
        );
    } else {
        wrap.append(...blocks);
    }
    return wrap;
}

/* ------------------------------------------------------- per-entity extras */

const EXTRAS = {
    characters: (doc) => [
        { id: "timeline", label: "Timeline", render: () => characterTimeline(doc) },
        { id: "relationships", label: "Relationships", count: characterRelationships(doc).length, render: () => relationshipPanel(doc) },
        { id: "knowledge", label: "What they know", render: () => knowledgePanel(doc) },
    ],
    events: (doc) => [
        { id: "dependencies", label: "Dependencies", render: () => dependencyPanel(doc) },
        { id: "storyboard", label: "Storyboard", render: () => storyboardPanel(doc) },
        { id: "cast", label: "Cast & places", render: () => castPanel(doc) },
    ],
    story_arcs: (doc) => [
        { id: "events", label: "Events", count: arcEvents(doc).length, render: () => arcEventPanel(doc) },
        { id: "threads", label: "Threads", render: () => arcThreadPanel(doc) },
    ],
    story_threads: (doc) => [{ id: "progress", label: "Progress", render: () => threadProgressPanel(doc) }],
    lore: (doc) => [{ id: "lorelinks", label: "Lore web", render: () => loreLinksPanel(doc) }],
    factions: (doc) => [
        { id: "members", label: "Membership", render: () => factionMembersPanel(doc) },
        { id: "relations", label: "Faction relations", render: () => factionRelationPanel(doc) },
    ],
    seasons: (doc) => [{ id: "structure", label: "Chapters & arcs", render: () => seasonStructurePanel(doc) }],
    chapters: (doc) => [{ id: "arcs", label: "Arcs & events", render: () => chapterStructurePanel(doc) }],
};

function eventsForCharacter(doc) {
    const id = String(doc.id);
    const involved = docs("events").filter((e) =>
        ["mainCharacterIds", "supportingCharacterIds", "antagonistIds", "affectedCharacterIds"].some((f) =>
            toArray(e[f]).map(String).includes(id)
        )
    );
    return involved.sort((a, b) => dateOf(a) - dateOf(b));
}

function dateOf(doc) {
    return parseDate(doc.actualDate || doc.plannedDate || (doc.month ? `${doc.month}-01` : ""))?.getTime() || Number.MAX_SAFE_INTEGER;
}

function characterTimeline(doc) {
    const events = eventsForCharacter(doc);
    const relationships = characterRelationships(doc);
    const wrap = el("div", { class: "card" });
    wrap.appendChild(el("div", { class: "card-head" }, [el("h2", {}, [icon("timeline"), "Character timeline"]), el("span", { class: "field-hint", style: { marginLeft: "auto" }, text: `${events.length} events` })]));

    const body = el("div", { class: "card-body" });
    if (!events.length && !relationships.length) {
        body.appendChild(emptyState({ iconName: "calendar", title: "No events yet", message: "Add this character to an event to build their personal timeline." }));
    }

    const rows = [];
    if (doc.firstAppearance) {
        rows.push({ when: doc.firstAppearance, label: "First appearance", kind: "milestone" });
    }
    events.forEach((e) => rows.push({ when: e.actualDate || e.plannedDate || (e.month ? `${e.month}-01` : ""), label: e.title, event: e }));
    relationships.forEach((r) => {
        if (r.startDate) rows.push({ when: r.startDate, label: `Relationship begins: ${otherName(r, doc)}` });
    });
    rows.sort((a, b) => (parseDate(a.when)?.getTime() || 0) - (parseDate(b.when)?.getTime() || 0));

    rows.forEach((row) => {
        const inner = el("div", { class: "li-main" }, [
            el("div", { class: "li-title" }, [
                el("span", { class: "t", text: row.label }),
                row.event ? badge(row.event.kind === "Main Event" ? "Main" : "Normal", row.event.kind === "Main Event" ? "gold" : "ghost") : null,
            ]),
            el("div", { class: "li-meta" }, [
                el("span", { text: row.when ? fmtDate(row.when) : "Undated" }),
                row.event?.status ? el("span", { class: "sep", text: "·" }) : null,
                row.event?.status ? el("span", { text: row.event.status }) : null,
            ]),
        ]);
        body.appendChild(
            row.event
                ? el("a", { class: "list-item", href: detailPath("events", row.event.id) }, [el("span", { class: "li-mark" }, icon("calendar")), inner])
                : el("div", { class: "list-item" }, [el("span", { class: "li-mark" }, icon("star")), inner])
        );
    });
    wrap.appendChild(body);
    return wrap;
}

function otherName(rel, doc) {
    const otherId = String(rel.aId) === String(doc.id) ? rel.bId : rel.aId;
    return byId("characters", otherId)?.name || "(unknown)";
}

export function characterRelationships(doc) {
    return docs("character_relationships").filter(
        (r) => String(r.aId) === String(doc.id) || String(r.bId) === String(doc.id)
    );
}

function relationshipPanel(doc) {
    const rels = characterRelationships(doc);
    const wrap = el("div", { class: "stack sm" });
    const bar = el("div", { class: "row between" }, [
        el("h2", { style: { fontSize: "1rem" }, text: "Relationships" }),
        el("button", {
            class: "btn btn-primary btn-sm",
            type: "button",
            onclick: () => createAndEdit("character_relationships", { aId: doc.id }),
        }, [icon("plus"), "New relationship"]),
    ]);
    wrap.appendChild(bar);

    if (!rels.length) {
        wrap.appendChild(emptyState({ iconName: "link", title: "No relationships documented", message: "Record how this character connects to others — friends, rivals, family, betrayals." }));
        return wrap;
    }

    rels.forEach((rel) => {
        const other = byId("characters", String(rel.aId) === String(doc.id) ? rel.bId : rel.aId);
        const card = el("div", { class: "relation-item" }, [
            el("div", { class: "relation-head" }, [
                el("span", { class: "rel-name", text: other?.name || "(deleted character)" }),
                badge(rel.type || "—", "ghost"),
                statusBadge(rel.status),
                el("span", { style: { marginLeft: "auto" }, class: "row" }, [
                    el("button", { class: "icon-btn", type: "button", style: { width: "28px", height: "28px" }, title: "Edit", onclick: () => openEditor("character_relationships", rel.id) }, icon("edit")),
                ]),
            ]),
            rel.description ? el("div", { class: "prose", style: { fontSize: "0.85rem" }, html: renderMarkdown(rel.description) }) : null,
            toArray(rel.historySteps).length
                ? el(
                      "div",
                      { class: "relation-hist" },
                      toArray(rel.historySteps).flatMap((s, i) => [
                          el("span", { class: `rh-step${i === toArray(rel.historySteps).length - 1 ? " cur" : ""}`, text: s.type || "—", title: s.note || "" }),
                          i < toArray(rel.historySteps).length - 1 ? el("span", { class: "rh-arrow", text: "→" }) : null,
                      ])
                  )
                : null,
            rel.strength ? el("span", { class: "field-hint", text: `Strength ${rel.strength}/5` }) : null,
        ]);
        wrap.appendChild(card);
    });
    return wrap;
}

function knowledgePanel(doc) {
    const knownLore = docs("lore").filter((l) => toArray(l.characterIds).map(String).includes(String(doc.id)));
    const secrets = docs("lore").filter((l) => l.knowledge === "Secret");
    const wrap = el("div", { class: "stack sm" });
    wrap.appendChild(
        el("div", { class: "notice" }, [
            icon("info"),
            el("span", { text: "Creator knowledge and character knowledge are tracked separately. Secrets here are known to the storytellers, not necessarily to this character." }),
        ])
    );
    const rows = [
        ["Known information", doc.knownInfo],
        ["Unknown information", doc.unknownInfo],
        ["Secrets they hold", doc.secretsHeld],
        ["Secrets about them", doc.secretsAbout],
        ["False beliefs", doc.falseBeliefs],
        ["Hiding", doc.hiding],
    ].filter(([, v]) => v);
    rows.forEach(([label, value]) =>
        wrap.appendChild(el("div", { class: "card" }, [el("div", { class: "card-head" }, [el("h2", { text: label })]), el("div", { class: "card-body prose", html: renderMarkdown(value) })]))
    );
    if (knownLore.length) {
        wrap.appendChild(
            el("div", { class: "card" }, [
                el("div", { class: "card-head" }, [el("h2", {}, [icon("book"), "Lore linked to this character"])]),
                el("div", { class: "card-body tight" }, [el("div", { class: "ref-list" }, knownLore.map((l) => refRow("lore", l))) ]),
            ])
        );
    }
    if (!rows.length && !knownLore.length) {
        wrap.appendChild(emptyState({ iconName: "lockSmall", title: "No knowledge recorded", message: "Track what this character knows, what they believe, and what they are hiding." }));
    }
    if (secrets.length) {
        wrap.appendChild(el("p", { class: "field-hint", text: `${secrets.length} secret lore entries exist in the database.` }));
    }
    return wrap;
}

function dependencyPanel(doc) {
    const wrap = el("div", { class: "stack sm" });
    const prereqs = toArray(doc.prerequisiteEventIds).map((id) => byId("events", id)).filter(Boolean);
    const unmet = prereqs.filter((p) => p.status !== "Completed");
    const blocked = unmet.length > 0 && !doc.dependencyOverride;

    if (prereqs.length) {
        wrap.appendChild(
            el("div", { class: `notice ${blocked ? "danger" : ""}` }, [
                icon(blocked ? "alert" : "check"),
                el("div", {}, [
                    el("strong", { text: blocked ? "Not narratively ready" : "Dependencies satisfied" }),
                    el("p", {
                        style: { margin: "0.2rem 0 0" },
                        text: blocked
                            ? `${unmet.length} prerequisite event${unmet.length === 1 ? " hasn't" : "s haven't"} completed yet: ${unmet.map((u) => u.title).join(", ")}.`
                            : "All prerequisite events are complete (or the override is on).",
                    }),
                ]),
            ])
        );
    }

    const chain = el("div", { class: "dependency-flow" });
    prereqs.forEach((p) => {
        chain.appendChild(prereqNode(p));
        chain.appendChild(el("span", { class: "dep-arrow" }, icon("arrowRight")));
    });
    chain.appendChild(el("span", { class: "dep-node current" }, [icon("star"), el("span", { text: doc.title })]));
    toArray(doc.leadsToEventIds)
        .map((id) => byId("events", id))
        .filter(Boolean)
        .forEach((next) => {
            chain.appendChild(el("span", { class: "dep-arrow" }, icon("arrowRight")));
            chain.appendChild(el("a", { class: "dep-node", href: detailPath("events", next.id) }, [el("span", { text: next.title })]));
        });

    wrap.appendChild(el("div", { class: "card" }, [
        el("div", { class: "card-head" }, [el("h2", {}, [icon("branch"), "Dependency chain"])]),
        el("div", { class: "card-body" }, [chain]),
    ]));

    const simultaneous = toArray(doc.simultaneousEventIds).map((id) => byId("events", id)).filter(Boolean);
    const alternatives = toArray(doc.alternativeEventIds).map((id) => byId("events", id)).filter(Boolean);
    if (simultaneous.length || alternatives.length) {
        wrap.appendChild(
            el("div", { class: "grid cols-2" }, [
                simultaneous.length
                    ? el("div", { class: "card" }, [el("div", { class: "card-head" }, [el("h2", { text: "Happens simultaneously" })]), el("div", { class: "card-body tight" }, [el("div", { class: "ref-list" }, simultaneous.map((e) => refRow("events", e)))])])
                    : null,
                alternatives.length
                    ? el("div", { class: "card" }, [el("div", { class: "card-head" }, [el("h2", { text: "Alternative paths" })]), el("div", { class: "card-body tight" }, [el("div", { class: "ref-list" }, alternatives.map((e) => refRow("events", e)))])])
                    : null,
            ])
        );
    }

    if (!prereqs.length && !toArray(doc.leadsToEventIds).length) {
        wrap.appendChild(emptyState({ iconName: "branch", title: "No dependencies set", message: "Link prerequisite and follow-on events in the editor to see the chain here." }));
    }
    return wrap;
}

function prereqNode(p) {
    const done = p.status === "Completed";
    return el("a", { class: `dep-node ${done ? "" : "blocked"}`, href: detailPath("events", p.id), title: p.status }, [
        icon(done ? "check" : "alert"),
        el("span", { text: p.title }),
    ]);
}

function storyboardPanel(doc) {
    const boards = docs("storyboards").filter((b) => String(b.eventId) === String(doc.id));
    const wrap = el("div", { class: "stack sm" });
    wrap.appendChild(
        el("div", { class: "row between" }, [
            el("h2", { style: { fontSize: "1rem" }, text: "Storyboards" }),
            el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => createAndEdit("storyboards", { eventId: doc.id, title: `${doc.title} — storyboard` }) }, [icon("plus"), "New storyboard"]),
        ])
    );
    if (!boards.length) {
        wrap.appendChild(emptyState({ iconName: "list", title: "No storyboard yet", message: "Storyboards break an event into ordered scenes with dialogue, props and recording notes.", action: el("a", { class: "btn btn-ghost", href: "#/storyboards" }, "Open storyboards") }));
    } else {
        boards.forEach((b) => wrap.appendChild(el("a", { class: "list-item", href: `#/storyboards?board=${encodeURIComponent(b.id)}`, style: { borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" } }, [el("span", { class: "li-mark" }, icon("list")), el("div", { class: "li-main" }, [el("div", { class: "li-title", text: b.title }), el("div", { class: "li-meta", text: b.status || "" })])])));
    }
    return wrap;
}

function castPanel(doc) {
    const groups = [
        ["Main characters", doc.mainCharacterIds],
        ["Supporting characters", doc.supportingCharacterIds],
        ["Antagonists", doc.antagonistIds],
        ["Indirectly affected", doc.affectedCharacterIds],
    ].filter(([, ids]) => toArray(ids).length);

    const placeGroups = [
        ["Locations", "locations", doc.locationIds],
        ["Factions", "factions", doc.factionIds],
        ["Lore", "lore", doc.loreIds],
        ["Story threads", "story_threads", doc.threadIds],
    ].filter(([, , ids]) => toArray(ids).length);

    const wrap = el("div", { class: "grid cols-2" });
    if (groups.length) {
        wrap.appendChild(
            el("div", { class: "card" }, [
                el("div", { class: "card-head" }, [el("h2", {}, [icon("users"), "Characters"])]),
                el("div", { class: "card-body tight" }, groups.map(([label, ids]) =>
                    el("div", { class: "conn-group", style: { marginBottom: "0.5rem" } }, [
                        el("div", { class: "conn-label", text: label }),
                        el("div", { class: "ref-list" }, toArray(ids).map((id) => refRow("characters", byId("characters", id)))),
                    ])
                )),
            ])
        );
    }
    if (placeGroups.length) {
        wrap.appendChild(
            el("div", { class: "card" }, [
                el("div", { class: "card-head" }, [el("h2", {}, [icon("mapPin"), "Places, factions & lore"])]),
                el("div", { class: "card-body tight" }, placeGroups.map(([label, coll, ids]) =>
                    el("div", { class: "conn-group", style: { marginBottom: "0.5rem" } }, [
                        el("div", { class: "conn-label", text: label }),
                        el("div", { class: "ref-list" }, toArray(ids).map((id) => refRow(coll, byId(coll, id)))),
                    ])
                )),
            ])
        );
    }
    if (!wrap.children.length) return emptyState({ iconName: "users", title: "No cast linked", message: "Link characters, locations, factions and lore to this event." });
    return wrap;
}

function arcEvents(doc) {
    const explicit = toArray(doc.eventIds).map(String);
    return docs("events")
        .filter((e) => String(e.arcId) === String(doc.id) || explicit.includes(String(e.id)))
        .sort((a, b) => dateOf(a) - dateOf(b));
}

function arcEventPanel(doc) {
    const events = arcEvents(doc);
    const wrap = el("div", { class: "stack sm" });
    wrap.appendChild(el("div", { class: "row between" }, [
        el("h2", { style: { fontSize: "1rem" }, text: `${events.length} events in this arc` }),
        el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => createAndEdit("events", { arcId: doc.id, seasonId: doc.seasonId || "", chapterId: doc.chapterId || "", kind: "Normal Event" }) }, [icon("plus"), "Add event"]),
    ]));
    if (!events.length) return emptyState({ iconName: "calendar", title: "No events in this arc", message: "Assign events to this arc from the event editor." });
    events.forEach((e) => {
        wrap.appendChild(
            el("a", { class: "list-item", href: detailPath("events", e.id), style: { borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" } }, [
                el("span", { class: "li-mark" }, icon("calendar")),
                el("div", { class: "li-main" }, [
                    el("div", { class: "li-title" }, [el("span", { class: "t", text: e.title }), e.kind === "Main Event" ? badge("Main", "gold") : null]),
                    el("div", { class: "li-meta" }, [el("span", { text: dateOf(e) === Number.MAX_SAFE_INTEGER ? "Undated" : fmtDate(e.plannedDate || e.month) }), el("span", { class: "sep", text: "·" }), el("span", { text: e.status || "" })]),
                ]),
                el("span", { class: "li-side" }, [importanceBadge(e.importance)]),
            ])
        );
    });
    return wrap;
}

function arcThreadPanel(doc) {
    const threads = docs("story_threads").filter((t) => toArray(t.arcIds).map(String).includes(String(doc.id)));
    if (!threads.length) return emptyState({ iconName: "share", title: "No threads linked", message: "Link story threads to this arc to track unresolved developments." });
    return el("div", { class: "card" }, [el("div", { class: "card-body tight" }, [el("div", { class: "ref-list" }, threads.map((t) => refRow("story_threads", t)))])]);
}

function threadProgressPanel(doc) {
    const events = toArray(doc.eventIds).map((id) => byId("events", id)).filter(Boolean);
    const wrap = el("div", { class: "stack sm" });
    wrap.appendChild(el("div", { class: "card" }, [
        el("div", { class: "card-head" }, [el("h2", {}, [icon("timeline"), "Thread events"])]),
        el("div", { class: "card-body tight" }, events.length
            ? el("div", { class: "ref-list" }, events.map((e) => refRow("events", e)))
            : el("p", { class: "field-hint", text: "No events linked." })),
    ]));
    if (doc.originEventId) {
        const origin = byId("events", doc.originEventId);
        if (origin) wrap.appendChild(el("div", { class: "card" }, [el("div", { class: "card-head" }, [el("h2", {}, [icon("star"), "Origin"])]), el("div", { class: "card-body tight" }, [el("div", { class: "ref-list" }, [refRow("events", origin)])])]));
    }
    const related = docs("story_threads").filter((t) => toArray(t.connectedThreadIds).map(String).includes(String(doc.id)));
    if (related.length) {
        wrap.appendChild(el("div", { class: "card" }, [el("div", { class: "card-head" }, [el("h2", { text: "Threads pointing here" })]), el("div", { class: "card-body tight" }, [el("div", { class: "ref-list" }, related.map((t) => refRow("story_threads", t)))])]));
    }
    return wrap;
}

function loreLinksPanel(doc) {
    const related = toArray(doc.relatedLoreIds).map((id) => byId("lore", id)).filter(Boolean);
    const explainers = docs("lore").filter((l) => toArray(l.relatedLoreIds).map(String).includes(String(doc.id)));
    const wrap = el("div", { class: "stack sm" });
    if (related.length) {
        wrap.appendChild(el("div", { class: "card" }, [el("div", { class: "card-head" }, [el("h2", {}, [icon("book"), "Explains / connects to"])]), el("div", { class: "card-body tight" }, [el("div", { class: "ref-list" }, related.map((l) => refRow("lore", l)))])]));
    }
    if (explainers.length) {
        wrap.appendChild(el("div", { class: "card" }, [el("div", { class: "card-head" }, [el("h2", {}, [icon("book"), "Connected from"])]), el("div", { class: "card-body tight" }, [el("div", { class: "ref-list" }, explainers.map((l) => refRow("lore", l)))])]));
    }
    if (!related.length && !explainers.length) {
        wrap.appendChild(emptyState({ iconName: "book", title: "No lore connections", message: "Link this entry to other lore so the knowledge web stays coherent." }));
    }
    return wrap;
}

function factionMembersPanel(doc) {
    const members = docs("characters").filter((c) => String(c.factionId) === String(doc.id) || toArray(c.factionIds).map(String).includes(String(doc.id)));
    const wrap = el("div", { class: "stack sm" });
    wrap.appendChild(el("div", { class: "row between" }, [
        el("h2", { style: { fontSize: "1rem" }, text: `Members (${members.length})` }),
    ]));
    if (!members.length) {
        wrap.appendChild(emptyState({ iconName: "users", title: "No members recorded", message: "Set a character's primary faction, or list them in this faction's members." }));
    } else {
        wrap.appendChild(el("div", { class: "card" }, [el("div", { class: "card-body tight" }, [el("div", { class: "ref-list" }, members.map((c) => refRow("characters", c, c.status)))])]));
    }
    if (toArray(doc.memberHistory).length) {
        wrap.appendChild(el("div", { class: "card" }, [
            el("div", { class: "card-head" }, [el("h2", {}, [icon("clock"), "Membership over time"])]),
            el("div", { class: "card-body" }, [fieldValueNode({ key: "memberHistory", label: "Membership over time", type: "memberHistory" }, doc) || el("span", { text: "—" })]),
        ]));
    }
    return wrap;
}

function factionRelationPanel(doc) {
    const rels = docs("faction_relationships").filter((r) => String(r.aId) === String(doc.id) || String(r.bId) === String(doc.id));
    const wrap = el("div", { class: "stack sm" });
    wrap.appendChild(el("div", { class: "row between" }, [
        el("h2", { style: { fontSize: "1rem" }, text: "Faction relations" }),
        el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => createAndEdit("faction_relationships", { aId: doc.id }) }, [icon("plus"), "New relation"]),
    ]));
    if (!rels.length) return wrap.appendChild(emptyState({ iconName: "flag", title: "No faction relations", message: "Track alliances, rivalries and wars between factions." })), wrap;
    rels.forEach((r) => {
        const other = byId("factions", String(r.aId) === String(doc.id) ? r.bId : r.aId);
        wrap.appendChild(el("div", { class: "relation-item" }, [
            el("div", { class: "relation-head" }, [
                other ? el("a", { href: detailPath("factions", other.id), class: "rel-name", text: other.name }) : el("span", { class: "rel-name", text: "(deleted)" }),
                badge(r.type || "—"),
                statusBadge(r.status),
                el("button", { class: "icon-btn", type: "button", style: { width: "28px", height: "28px", marginLeft: "auto" }, onclick: () => openEditor("faction_relationships", r.id) }, icon("edit")),
            ]),
            r.description ? el("div", { class: "prose", style: { fontSize: "0.84rem" }, html: renderMarkdown(r.description) }) : null,
        ]));
    });
    return wrap;
}

function seasonStructurePanel(doc) {
    const chapters = docs("chapters").filter((c) => String(c.seasonId) === String(doc.id)).sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
    const arcs = docs("story_arcs").filter((a) => String(a.seasonId) === String(doc.id));
    const events = docs("events").filter((e) => String(e.seasonId) === String(doc.id));
    const wrap = el("div", { class: "stack sm" });
    wrap.appendChild(el("div", { class: "stats", style: { gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))" } }, [
        miniStat("Chapters", chapters.length),
        miniStat("Arcs", arcs.length),
        miniStat("Events", events.length),
        miniStat("Completed", events.filter((e) => e.status === "Completed").length),
    ]));
    if (chapters.length) {
        wrap.appendChild(el("div", { class: "card" }, [el("div", { class: "card-head" }, [el("h2", {}, [icon("book"), "Chapters"])]), el("div", { class: "card-body tight" }, [el("div", { class: "ref-list" }, chapters.map((c) => refRow("chapters", c, c.status)))])]));
    }
    if (arcs.length) {
        wrap.appendChild(el("div", { class: "card" }, [el("div", { class: "card-head" }, [el("h2", {}, [icon("branch"), "Story arcs"])]), el("div", { class: "card-body tight" }, [el("div", { class: "ref-list" }, arcs.map((a) => refRow("story_arcs", a, a.status)))])]));
    }
    if (!chapters.length && !arcs.length) return emptyState({ iconName: "layers", title: "Nothing under this season yet", message: "Add chapters and story arcs that belong to this season." });
    return wrap;
}

function miniStat(label, value) {
    return el("div", { class: "stat" }, [el("div", { class: "stat-label", text: label }), el("div", { class: "stat-value", text: String(value) })]);
}

function chapterStructurePanel(doc) {
    const arcs = docs("story_arcs").filter((a) => String(a.chapterId) === String(doc.id));
    const events = docs("events").filter((e) => String(e.chapterId) === String(doc.id)).sort((a, b) => dateOf(a) - dateOf(b));
    const wrap = el("div", { class: "stack sm" });
    if (arcs.length) {
        wrap.appendChild(el("div", { class: "card" }, [el("div", { class: "card-head" }, [el("h2", {}, [icon("branch"), "Arcs"])]), el("div", { class: "card-body tight" }, [el("div", { class: "ref-list" }, arcs.map((a) => refRow("story_arcs", a)))])]));
    }
    if (events.length) {
        wrap.appendChild(el("div", { class: "card" }, [el("div", { class: "card-head" }, [el("h2", {}, [icon("calendar"), "Events"])]), el("div", { class: "card-body tight" }, [el("div", { class: "ref-list" }, events.map((e) => refRow("events", e, e.status)))])]));
    }
    if (!arcs.length && !events.length) return emptyState({ iconName: "book", title: "No arcs or events yet", message: "Assign arcs and events to this chapter." });
    return wrap;
}
