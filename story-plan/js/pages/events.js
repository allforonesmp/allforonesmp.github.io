/* Story Planner — Events list (Main vs Normal events) and Timeline. */

import {el, icon, fmtDate, toArray, parseDate, MONTHS, MONTHS_LONG, monthKey, todayISO} from "../util.js";
import {activeDocs, byId, updateRecord, prefs, savePrefs} from "../store.js";
import { listView } from "../components/datatable.js";
import { pageHead, card, emptyState, badge, statusBadge, importanceBadge } from "../components/ui.js";
;
import { createAndEdit } from "../components/editor.js";
import { navigate, detailPath } from "../router.js";
import { OPTIONS } from "../schema.js";

export function eventsPage(params = new URLSearchParams()) {
    const kind = params.get("kind") || "";
    const root = listView({
        collection: "events",
        params,
        title: "Events",
        lead: "Main events drive the story once a month; normal events fill the gaps between them. Both can be linked to arcs, characters, lore and each other.",
        createLabel: "New event",
        createPreset: () => ({ kind: kind || "Normal Event", status: "Idea", importance: "Medium" }),
        actions: [
            el("div", { class: "segmented", style: { marginRight: "0.3rem" } }, [
                el("button", { type: "button", class: "active", onclick: () => navigate("#/events") }, "All"),
                el("button", { type: "button", onclick: () => navigate("#/events?kind=Main%20Event") }, "Main events"),
                el("button", { type: "button", onclick: () => navigate("#/events?kind=Normal%20Event") }, "Normal events"),
            ]),
            el("a", { class: "btn btn-ghost", href: "#/timeline" }, [icon("timeline"), "Timeline"]),
        ],
        filters: [
            { key: "kind", label: "Type", options: OPTIONS.eventKind },
            { key: "status", label: "Status", options: OPTIONS.eventStatus },
            { key: "category", label: "Category", options: OPTIONS.eventCategory },
            { key: "importance", label: "Importance", options: OPTIONS.importance },
            { key: "seasonId", label: "Season", collection: "seasons" },
            { key: "arcId", label: "Arc", collection: "story_arcs" },
        ],
        sorts: [
            { key: "date", label: "Chronological", get: (d) => dateOf(d) },
            { key: "updatedAt", label: "Last modified" },
            { key: "importance", label: "Importance", get: (d) => OPTIONS.importance.indexOf(d.importance) },
            { key: "title", label: "Alphabetical" },
        ],
        defaultSort: "date",
        predicate: (d) => (kind ? d.kind === kind : true),
        columns: [
            {
                key: "title",
                label: "Event",
                get: (d) => {
                    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: "220px" } }, [
                        el("div", { class: "row", style: { gap: "0.35rem" } }, [
                            el("span", { class: "cell-strong", text: d.title || "Untitled event" }),
                            d.kind === "Main Event" ? badge("Main", "gold") : null,
                        ]),
                        el("span", { class: "field-hint", text: [d.code, d.category].filter(Boolean).join(" · ") }),
                    ]);
                    return wrap;
                },
                sortable: false,
            },
            {
                key: "date",
                label: "When",
                get: (d) => {
                    const dt = parseDate(d.actualDate || d.plannedDate || (d.month ? `${d.month}-01` : ""));
                    return dt ? fmtDate(dt) : d.month || "Undated";
                },
            },
            { key: "status", label: "Status", get: (d) => statusBadge(d.status) || "—" },
            { key: "importance", label: "Importance", get: (d) => importanceBadge(d.importance) || "—" },
            {
                key: "cast",
                label: "Characters",
                sortable: false,
                get: (d) => {
                    const names = toArray(d.mainCharacterIds).map((id) => byId("characters", id)?.name || "?").slice(0, 3);
                    return names.length ? names.join(", ") : "—";
                },
            },
            {
                key: "seasonId",
                label: "Season / arc",
                sortable: false,
                get: (d) => [byId("seasons", d.seasonId)?.name, byId("story_arcs", d.arcId)?.name].filter(Boolean).join(" · ") || "—",
            },
        ],
        emptyTitle: "No events yet",
        emptyMessage: "Start with the next main event — the monthly anchor of the storyline — then fill the gaps with normal events.",
    });
    return root;
}

function dateOf(d) {
    return parseDate(d.actualDate || d.plannedDate || (d.month ? `${d.month}-01` : ""))?.getTime() || Number.MAX_SAFE_INTEGER;
}

/* ================================================================ TIMELINE */

export function timelinePage(params) {
    const root = el("div", { class: "page" });
    const events = activeDocs("events");
    let view = params.get("view") || prefs.defaultTimelineView || "detail";
    let seasonFilter = params.get("season") || "";
    let characterFilter = params.get("character") || "";
    let arcFilter = params.get("arc") || "";
    let typeFilter = params.get("kind") || "";
    let statusFilter = params.get("status") || "";
    let searchTerm = "";
    let zoom = 1;
    const highlight = params.get("highlight") || "";

    root.appendChild(
        pageHead("Timeline", "Every event in chronological order. Undated events stay placeable using their month or planned date.", [
            el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("events", { status: "Planned" }) }, [icon("plus"), "New event"]),
        ])
    );

    const filtersHost = el("div", { class: "row", style: { gap: "0.4rem", flexWrap: "wrap" } });
    const makeFilter = (label, options, current, onChange) => {
        const select = el("select", { class: "select-sm", "aria-label": label }, [
            el("option", { value: "", text: label }),
            ...options.map((o) => {
                const value = typeof o === "string" ? o : o.value;
                const text = typeof o === "string" ? o : o.label;
                return el("option", { value, selected: current === value, text });
            }),
        ]);
        select.addEventListener("change", () => onChange(select.value));
        return select;
    };

    filtersHost.append(
        makeFilter("All seasons", activeDocs("seasons").map((s) => ({ value: s.id, label: s.name })), seasonFilter, (v) => { seasonFilter = v; render(); }),
        makeFilter("All characters", activeDocs("characters").map((c) => ({ value: c.id, label: c.name })), characterFilter, (v) => { characterFilter = v; render(); }),
        makeFilter("All arcs", activeDocs("story_arcs").map((a) => ({ value: a.id, label: a.name })), arcFilter, (v) => { arcFilter = v; render(); }),
        makeFilter("All types", OPTIONS.eventKind, typeFilter, (v) => { typeFilter = v; render(); }),
        makeFilter("All statuses", OPTIONS.eventStatus, statusFilter, (v) => { statusFilter = v; render(); })
    );

    const searchInput = el("input", { type: "search", placeholder: "Search events…", style: { maxWidth: "220px" } });
    searchInput.addEventListener("input", () => { searchTerm = searchInput.value.toLowerCase(); render(); });
    filtersHost.appendChild(el("div", { class: "search-mini" }, [icon("search"), searchInput]));

    const seg = el("div", { class: "segmented" }, [
        ["year", "Year"],
        ["month", "Month"],
        ["detail", "Detailed"],
    ].map(([id, label]) =>
        el("button", {
            type: "button",
            class: view === id ? "active" : "",
            onclick: () => {
                view = id;
                savePrefs({ defaultTimelineView: id });
                Array.from(seg.children).forEach((c) => c.classList.remove("active"));
                seg.querySelectorAll("button")[["year", "month", "detail"].indexOf(id)].classList.add("active");
                render();
            },
        }, label)
    ));

    const zoomHost = el("div", { class: "row", style: { gap: "0.2rem", marginLeft: "auto" } }, [
        el("button", { class: "icon-btn", type: "button", title: "Zoom out", style: { width: "32px", height: "32px" }, onclick: () => { zoom = Math.max(0.5, zoom - 0.25); render(); } }, icon("zoomOut")),
        el("button", { class: "icon-btn", type: "button", title: "Zoom in", style: { width: "32px", height: "32px" }, onclick: () => { zoom = Math.min(3, zoom + 0.25); render(); } }, icon("zoomIn")),
        el("button", { class: "icon-btn", type: "button", title: "Reset zoom", style: { width: "32px", height: "32px" }, onclick: () => { zoom = 1; render(); } }, icon("reset")),
    ]);

    const toolbar = el("div", { class: "toolbar" }, [filtersHost, seg, zoomHost]);
    root.appendChild(toolbar);

    const stage = el("div", {});
    root.appendChild(stage);

    function filtered() {
        return events
            .filter((e) => !e.archived)
            .filter((e) => (seasonFilter ? String(e.seasonId) === String(seasonFilter) : true))
            .filter((e) => (arcFilter ? String(e.arcId) === String(arcFilter) : true))
            .filter((e) => (typeFilter ? e.kind === typeFilter : true))
            .filter((e) => (statusFilter ? e.status === statusFilter : true))
            .filter((e) =>
                characterFilter
                    ? ["mainCharacterIds", "supportingCharacterIds", "antagonistIds", "affectedCharacterIds"].some((f) =>
                          toArray(e[f]).map(String).includes(String(characterFilter))
                      )
                    : true
            )
            .filter((e) => {
                if (!searchTerm) return true;
                return [e.title, e.description, e.category, e.tags].filter(Boolean).join(" ").toLowerCase().includes(searchTerm);
            });
    }

    function render() {
        stage.innerHTML = "";
        const list = filtered().sort((a, b) => dateOf(a) - dateOf(b));
        if (!events.length) {
            stage.appendChild(
                el("div", { class: "card" }, [
                    emptyState({
                        iconName: "timeline",
                        title: "No events to plot",
                        message: "Create an event and it appears on the timeline immediately.",
                        action: el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("events") }, [icon("plus"), "Create event"]),
                    }),
                ])
            );
            return;
        }
        if (!list.length) {
            stage.appendChild(el("div", { class: "card" }, [emptyState({ iconName: "filter", title: "No events match these filters", message: "Clear a filter or search term to see more of the timeline." })]));
            return;
        }
        if (view === "year") stage.appendChild(yearView(list, highlight));
        else if (view === "month") stage.appendChild(monthView(list, highlight));
        else stage.appendChild(detailView(list, highlight, zoom));
    }

    render();
    return root;
}

/* ---------------------------------------------------------------- detail */

function detailView(list, highlight, zoom) {
    const wrap = el("div", { class: "timeline-wrap" });

    const months = [];
    const seen = new Set();
    for (const e of list) {
        const key = monthKey(e.actualDate || e.plannedDate || (e.month ? `${e.month}-01` : "")) || (e.month || "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        months.push(key);
    }
    if (!months.length) {
        const now = new Date();
        months.push(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    }
    months.sort();

    const laneCount = 4;
    const colWidth = Math.round(150 * zoom);
    const width = months.length * colWidth + 40;
    const laneHeight = 54;
    const laneLabelSpace = 18; // chips sit below their lane label instead of under it
    const height = 44 + laneCount * laneHeight + 20;

    const scroller = el("div", { class: "timeline-scroll" });
    const canvas = el("div", { class: "timeline-canvas", style: { width: `${width}px`, height: `${height}px` } });

    // axis + month columns
    const axis = el("div", { class: "tl-axis", style: { position: "sticky" } });
    months.forEach((key, i) => {
        const [y, m] = key.split("-");
        const col = el("div", { class: "tl-month", style: { left: `${i * colWidth}px`, width: `${colWidth}px` } }, [
            el("span", { class: "tl-month-label", text: `${MONTHS[Number(m) - 1] || m} ${y}` }),
        ]);
        canvas.appendChild(col);
    });

    // today marker
    const todayKey = monthKey(todayISO());
    const todayIdx = months.indexOf(todayKey);
    if (todayIdx >= 0) {
        const day = new Date().getDate();
        const frac = (day - 1) / 30;
        canvas.appendChild(el("div", { class: "tl-today", style: { left: `${todayIdx * colWidth + frac * colWidth}px` } }));
    }

    // lanes: main on top, then by importance
    const laneOf = (e) => {
        if (e.kind === "Main Event") return 0;
        if (e.importance === "Critical" || e.importance === "High") return 1;
        if (e.importance === "Medium") return 2;
        return 3;
    };
    const laneLabels = ["Main events", "High importance", "Normal", "Minor / other"];
    laneLabels.forEach((label, i) => {
        canvas.appendChild(el("div", { class: "tl-lane-label", style: { top: `${44 + i * laneHeight}px` }, text: label }));
    });

    const perLaneOffset = new Map();
    const ordered = list.slice().sort((a, b) => dateOf(a) - dateOf(b));
    for (const e of ordered) {
        const when = parseDate(e.actualDate || e.plannedDate || (e.month ? `${e.month}-01` : ""));
        const key = when ? monthKey(when) : e.month || "";
        const idx = Math.max(0, months.indexOf(key));
        const approx = !e.actualDate && !e.plannedDate && Boolean(e.month);
        const dayFrac = when ? (when.getDate() - 1) / 30 : 0.5;
        const lane = laneOf(e);
        const laneKey = `${idx}:${lane}`;
        const stack = perLaneOffset.get(laneKey) || 0;
        perLaneOffset.set(laneKey, stack + 1);

        const chip = el("button", {
            class: `tl-event${e.kind === "Main Event" ? " main" : ""}${approx ? " approx" : ""}`,
            type: "button",
            style: {
                left: `${idx * colWidth + 6 + dayFrac * (colWidth - 46) + Math.min(stack, 5) * 4}px`,
                top: `${44 + lane * laneHeight + laneLabelSpace + Math.min(stack, 1) * 3}px`,
                "--dot": e.kind === "Main Event" ? "var(--c-event-main)" : colourForStatus(e.status),
            },
            title: `${e.title} — ${when ? fmtDate(when) : "undated"} (${e.status || "no status"})`,
            onclick: () => navigate(detailPath("events", e.id)),
        }, [
            el("span", { class: "tl-dot" }),
            el("span", { text: e.title || "Untitled" }),
        ]);
        if (highlight && String(e.id) === String(highlight)) chip.style.outline = "2px solid var(--primary-blue)";

        // drag to reschedule (updates the stored planning month)
        chip.draggable = true;
        chip.addEventListener("dragstart", (ev) => {
            ev.dataTransfer.setData("text/plain", e.id);
        });
        canvas.appendChild(chip);
    }

    // month drop targets for rescheduling
    months.forEach((key, i) => {
        const zone = el("div", {
            style: {
                position: "absolute",
                left: `${i * colWidth}px`,
                top: "34px",
                width: `${colWidth}px`,
                height: `${height - 34}px`,
                zIndex: "0",
            },
        });
        zone.addEventListener("dragover", (ev) => {
            ev.preventDefault();
            zone.style.background = "color-mix(in srgb, var(--primary-blue) 10%, transparent)";
        });
        zone.addEventListener("dragleave", () => {
            zone.style.background = "";
        });
        zone.addEventListener("drop", async (ev) => {
            ev.preventDefault();
            zone.style.background = "";
            const id = ev.dataTransfer.getData("text/plain");
            if (!id) return;
            const evt = byId("events", id);
            if (!evt) return;
            const [y, m] = key.split("-");
            try {
                await updateRecord("events", id, {
                    month: key,
                    plannedDate: `${key}-${String(parseDate(evt.plannedDate)?.getDate() || 1).padStart(2, "0")}`,
                });
                toast(`"${evt.title}" moved to ${MONTHS_LONG[Number(m) - 1]} ${y}.`, "success");
            } catch (err) {
                toastError(err, "Rescheduling");
            }
        });
        canvas.appendChild(zone);
    });

    scroller.appendChild(canvas);
    wrap.appendChild(scroller);
    wrap.appendChild(legend());

    // centre on today on first paint
    requestAnimationFrame(() => {
        const target = todayIdx >= 0 ? todayIdx * colWidth - scroller.clientWidth / 2 : 0;
        scroller.scrollLeft = Math.max(0, target);
    });

    // drag-to-scroll (pointer handlers scoped to the scroller — no global leaks)
    let isDown = false;
    let startX = 0;
    let startLeft = 0;
    const endDrag = () => {
        isDown = false;
        scroller.style.cursor = "";
    };
    scroller.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".tl-event")) return;
        isDown = true;
        startX = e.clientX;
        startLeft = scroller.scrollLeft;
    });
    scroller.addEventListener("pointermove", (e) => {
        if (!isDown) return;
        scroller.scrollLeft = startLeft - (e.clientX - startX);
    });
    scroller.addEventListener("pointerup", endDrag);
    scroller.addEventListener("pointercancel", endDrag);
    scroller.addEventListener("pointerleave", endDrag);

    return wrap;
}

function legend() {
    return el("div", { class: "tl-legend" }, [
        el("span", {}, [el("i", { style: { background: "var(--c-event-main)" } }), "Main event"]),
        el("span", {}, [el("i", { style: { background: "var(--c-event)" } }), "Normal event"]),
        el("span", {}, [el("i", { style: { background: "var(--success)" } }), "Completed"]),
        el("span", {}, [el("i", { style: { background: "var(--warning)" } }), "In progress"]),
        el("span", { style: { marginLeft: "auto" } }, "Drag an event card onto a month to reschedule it"),
    ]);
}

function colourForStatus(status) {
    if (status === "Completed") return "var(--success)";
    if (status === "In Progress" || status === "In Development") return "var(--warning)";
    if (status === "Cancelled") return "var(--error)";
    return "var(--c-event)";
}

/* ------------------------------------------------------------------ month */

function monthView(list, highlight) {
    const byMonth = new Map();
    for (const e of list) {
        const key = monthKey(e.actualDate || e.plannedDate || (e.month ? `${e.month}-01` : "")) || "undated";
        if (!byMonth.has(key)) byMonth.set(key, []);
        byMonth.get(key).push(e);
    }
    const keys = Array.from(byMonth.keys()).sort();
    const grid = el("div", { class: "month-grid" });
    keys.forEach((key) => {
        const evts = byMonth.get(key).sort((a, b) => dateOf(a) - dateOf(b));
        const [y, m] = key.split("-");
        grid.appendChild(
            el("div", { class: "month-card" }, [
                el("h4", {}, [el("span", { text: m ? `${MONTHS_LONG[Number(m) - 1]} ${y}` : "Undated" }), el("span", { class: "field-hint", text: String(evts.length) })]),
                el("div", { class: "mc-events" }, evts.map((e) =>
                    el("button", {
                        class: `mc-event${e.kind === "Main Event" ? " main" : ""}`,
                        type: "button",
                        style: { "--dot": e.kind === "Main Event" ? "var(--c-event-main)" : colourForStatus(e.status), outline: String(e.id) === String(highlight) ? "2px solid var(--primary-blue)" : "" },
                        title: `${e.title} · ${e.status || ""}`,
                        onclick: () => navigate(detailPath("events", e.id)),
                    }, [e.kind === "Main Event" ? "★ " : "", e.title || "Untitled"])
                )),
            ])
        );
    });
    return grid;
}

/* ------------------------------------------------------------------- year */

function yearView(list, highlight) {
    const byYear = new Map();
    for (const e of list) {
        const d = parseDate(e.actualDate || e.plannedDate || (e.month ? `${e.month}-01` : ""));
        const y = d ? d.getFullYear() : "Undated";
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y).push(e);
    }
    const wrap = el("div", { class: "stack" });
    Array.from(byYear.keys())
        .sort((a, b) => String(a).localeCompare(String(b)))
        .forEach((year) => {
            const evts = byYear.get(year);
            const monthsHost = el("div", { class: "year-grid" });
            for (let m = 0; m < 12; m++) {
                const key = `${year}-${String(m + 1).padStart(2, "0")}`;
                const monthEvents = evts.filter((e) => monthKey(e.actualDate || e.plannedDate || (e.month ? `${e.month}-01` : "")) === key);
                const mainCount = monthEvents.filter((e) => e.kind === "Main Event").length;
                monthsHost.appendChild(
                    el("div", {
                        class: "month-card",
                        style: {
                            minHeight: "78px",
                            cursor: monthEvents.length ? "pointer" : "default",
                            background: mainCount ? "var(--gold-soft)" : "",
                            borderColor: mainCount ? "color-mix(in srgb, var(--gold) 45%, transparent)" : "",
                        },
                        onclick: () => monthEvents.length && navigate(`#/timeline?view=month`),
                    }, [
                        el("h4", {}, [el("span", { text: MONTHS[m] }), monthEvents.length ? el("span", { text: String(monthEvents.length) }) : null]),
                        el("div", { class: "mc-events" }, monthEvents.slice(0, 3).map((e) =>
                            el("button", {
                                class: `mc-event${e.kind === "Main Event" ? " main" : ""}`,
                                type: "button",
                                style: { "--dot": e.kind === "Main Event" ? "var(--c-event-main)" : colourForStatus(e.status) },
                                onclick: (ev) => { ev.stopPropagation(); navigate(detailPath("events", e.id)); },
                            }, e.title || "Untitled")
                        )),
                        monthEvents.length > 3 ? el("span", { class: "field-hint", text: `+${monthEvents.length - 3} more` }) : null,
                    ])
                );
            }
            wrap.appendChild(
                el("div", { class: "card" }, [
                    el("div", { class: "card-head" }, [
                        el("h2", {}, [icon("calendar"), String(year)]),
                        el("span", { class: "field-hint", style: { marginLeft: "auto" }, text: `${evts.length} events · ${evts.filter((e) => e.kind === "Main Event").length} main` }),
                    ]),
                    el("div", { class: "card-body" }, [monthsHost]),
                ])
            );
        });
    return wrap;
}
