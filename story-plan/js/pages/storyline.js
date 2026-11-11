/* Story Planner — Storyline: seasons → chapters → arcs → events, plus threads. */

import { el, icon, fmtDate, toArray, parseDate, compareText } from "../util.js";
import {docs, activeDocs, byId, subscribe} from "../store.js";
import { renderMarkdown } from "../md.js";
import {pageHead, card, emptyState, badge, statusBadge, importanceBadge, meter, sectionTitle, refChip} from "../components/ui.js";
import { refRow } from "../components/detail.js";
import { createAndEdit, openEditor } from "../components/editor.js";
import { detailPath } from "../router.js";
import { isStaleThread } from "./insights-lib.js";

export function storylinePage(params) {
    const root = el("div", { class: "page" });
    let tab = params.get("tab") || "seasons";

    root.appendChild(
        pageHead("Storyline", "The whole narrative, structured: seasons break into chapters, chapters contain arcs, arcs contain events.", [
            el("button", { class: "btn btn-ghost", type: "button", onclick: () => createAndEdit("seasons") }, [icon("layers"), "New season"]),
            el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("story_threads") }, [icon("plus"), "New thread"]),
        ])
    );

    const tabs = el("div", { class: "tabs" });
    const body = el("div", {});
    const renderTabs = () => {
        body.innerHTML = "";
        tabs.innerHTML = "";
        [
            ["seasons", "Seasons & chapters", activeDocs("seasons").length],
            ["arcs", "Story arcs", activeDocs("story_arcs").length],
            ["threads", "Story threads", activeDocs("story_threads").length],
        ].forEach(([id, label, count]) => {
            tabs.appendChild(
                el("button", { type: "button", class: tab === id ? "active" : "", onclick: () => { tab = id; renderTabs(); } }, [label, el("span", { class: "count", text: String(count) })])
            );
        });
        if (tab === "seasons") body.appendChild(seasonsView());
        else if (tab === "arcs") body.appendChild(arcsView());
        else body.appendChild(threadsView());
    };
    root.append(tabs, body);
    renderTabs();

    const unsub = subscribe((ev) => {
        if ((ev.type === "changed" || ev.type === "loaded" || ev.type === "saved") && root.isConnected) {
            clearTimeout(t);
            t = setTimeout(renderTabs, 500);
        }
    });
    let t = null;
    root.addEventListener("planner:dispose", () => { unsub(); clearTimeout(t); });
    return root;
}

/* ---------------------------------------------------------------- seasons */

function seasonsView() {
    const seasons = activeDocs("seasons").sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
    const wrap = el("div", { class: "stack" });

    if (!seasons.length) {
        return el("div", { class: "card" }, [
            emptyState({
                iconName: "layers",
                title: "No seasons yet",
                message: "A season is the top level of the storyline. Create Season 1 to begin organising chapters, arcs and events.",
                action: el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("seasons") }, [icon("plus"), "Create first season"]),
            }),
        ]);
    }

    const openState = new Set(seasons.slice(0, 1).map((s) => s.id));

    seasons.forEach((season) => {
        const chapters = docs("chapters").filter((c) => String(c.seasonId) === String(season.id) && !c.archived).sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
        const arcs = docs("story_arcs").filter((a) => String(a.seasonId) === String(season.id) && !a.archived);
        const events = docs("events").filter((e) => String(e.seasonId) === String(season.id) && !e.archived);
        const done = events.filter((e) => e.status === "Completed").length;

        const block = el("div", { class: `season-block${openState.has(season.id) ? " open" : ""}` });
        const head = el("button", { class: "season-head", type: "button" });
        head.append(
            el("span", { class: "season-num", text: `S${season.number || "?"}` }),
            el("span", { class: "season-title" }, [el("span", { text: season.name || "Untitled season" }), statusBadge(season.status)]),
            el("span", { class: "field-hint", text: `${chapters.length} chapters · ${arcs.length} arcs · ${events.length} events` }),
            el("span", { class: "chev" }, icon("chevronRight"))
        );
        head.addEventListener("click", () => block.classList.toggle("open"));

        const body = el("div", { class: "season-body" });
        if (season.description) body.appendChild(el("div", { class: "prose", html: renderMarkdown(season.description) }));

        body.appendChild(
            el("div", { class: "row", style: { gap: "0.4rem", flexWrap: "wrap" } }, [
                season.startDate ? el("span", { class: "kv-inline" }, [icon("clock"), `${fmtDate(season.startDate)}${season.endDate ? ` → ${fmtDate(season.endDate)}` : ""}`]) : null,
                ...toArray(season.themes).map((t) => badge(t, "ghost")),
                el("span", { style: { marginLeft: "auto" }, class: "row" }, [
                    el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => openEditor("seasons", season.id) }, [icon("edit"), "Edit season"]),
                    el("a", { class: "btn btn-ghost btn-sm", href: detailPath("seasons", season.id) }, "Open"),
                ]),
            ])
        );

        body.appendChild(meter(`Season progress — ${done}/${events.length} events complete`, events.length ? Math.round((done / events.length) * 100) : 0));

        // chapters
        const chapterHost = el("div", { class: "stack sm" });
        chapters.forEach((chapter) => {
            const chapterEvents = docs("events").filter((e) => String(e.chapterId) === String(chapter.id) && !e.archived);
            const chapterArcs = arcs.filter((a) => String(a.chapterId) === String(chapter.id));
            const cBlock = el("div", { class: "chapter" });
            const cHead = el("button", { class: "chapter-head", type: "button" }, [
                el("span", { class: "season-num", text: `Ch.${chapter.number || "?"}` }),
                el("h4", { text: chapter.title || "Untitled chapter" }),
                statusBadge(chapter.status),
                el("span", { class: "field-hint", style: { marginLeft: "auto" }, text: `${chapterEvents.length} events` }),
            ]);
            const cBody = el("div", { class: "chapter-body", hidden: true });
            cHead.addEventListener("click", () => {
                cBody.hidden = !cBody.hidden;
            });
            if (chapter.objective) cBody.appendChild(el("p", { style: { fontSize: "0.86rem", color: "var(--text-medium)" }, text: chapter.objective }));
            if (chapterArcs.length) {
                cBody.appendChild(el("div", { class: "chip-row" }, chapterArcs.map((a) => refChip("story_arcs", a.id))));
            }
            if (chapterEvents.length) {
                cBody.appendChild(
                    el("div", { class: "ref-list" }, chapterEvents.sort((a, b) => dateOf(a) - dateOf(b)).map((e) => refRow("events", e, e.status)))
                );
            }
            cBody.appendChild(el("div", { class: "row" }, [el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => openEditor("chapters", chapter.id) }, [icon("edit"), "Edit chapter"])]));
            cBlock.append(cHead, cBody);
            chapterHost.appendChild(cBlock);
        });
        body.appendChild(chapterHost);

        body.appendChild(
            el("div", { class: "row" }, [
                el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => createAndEdit("chapters", { seasonId: season.id }) }, [icon("plus"), "Add chapter"]),
                el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => createAndEdit("story_arcs", { seasonId: season.id }) }, [icon("plus"), "Add arc"]),
                el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => createAndEdit("events", { seasonId: season.id }) }, [icon("plus"), "Add event"]),
            ])
        );

        block.append(head, body);
        wrap.appendChild(block);
    });

    // arcs without a season
    const orphans = activeDocs("story_arcs").filter((a) => !a.seasonId);
    if (orphans.length) {
        wrap.appendChild(
            el("div", { class: "card" }, [
                el("div", { class: "card-head" }, [el("h2", {}, [icon("branch"), "Arcs not assigned to a season"])]),
                el("div", { class: "card-body tight" }, [el("div", { class: "ref-list" }, orphans.map((a) => refRow("story_arcs", a, a.status)))]),
            ])
        );
    }
    return wrap;
}

/* ------------------------------------------------------------------- arcs */

export function arcsView() {
    const arcs = activeDocs("story_arcs");
    const wrap = el("div", { class: "stack" });
    const seasons = activeDocs("seasons").sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));

    const toolbar = el("div", { class: "row between" }, [
        el("h2", { style: { fontSize: "1rem" }, text: `${arcs.length} story arcs` }),
        el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => createAndEdit("story_arcs") }, [icon("plus"), "New arc"]),
    ]);
    wrap.appendChild(toolbar);

    if (!arcs.length) {
        return el("div", { class: "card" }, [
            emptyState({
                iconName: "branch",
                title: "No story arcs yet",
                message: "Arcs are the narrative sequences between chapters and individual events. They can overlap where characters' paths cross.",
                action: el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("story_arcs") }, [icon("plus"), "Create an arc"]),
            }),
        ]);
    }

    seasons.forEach((season) => {
        const seasonArcs = arcs.filter((a) => String(a.seasonId) === String(season.id)).sort((a, b) => compareText(a.name, b.name));
        if (!seasonArcs.length) return;
        wrap.appendChild(sectionTitle(`${season.name}${season.number ? ` · Season ${season.number}` : ""}`));
        wrap.appendChild(arcGrid(seasonArcs));
    });
    const loose = arcs.filter((a) => !a.seasonId);
    if (loose.length) {
        wrap.appendChild(sectionTitle("Unassigned arcs"));
        wrap.appendChild(arcGrid(loose));
    }
    return wrap;
}

function arcGrid(arcs) {
    return el(
        "div",
        { class: "grid cols-3" },
        arcs.map((arc) => {
            const events = docs("events").filter((e) => String(e.arcId) === String(arc.id) && !e.archived);
            const done = events.filter((e) => e.status === "Completed").length;
            const pct = Number(arc.progress) || (events.length ? Math.round((done / events.length) * 100) : 0);
            return el("a", { class: "arc-card", href: detailPath("story_arcs", arc.id), style: { "--accent": "var(--c-arc)" } }, [
                el("h3", {}, [el("span", { text: arc.name || "Untitled arc" })]),
                el("div", { class: "row", style: { gap: "0.3rem" } }, [statusBadge(arc.status), arc.importance ? importanceBadge(arc.importance) : null]),
                arc.description ? el("p", { text: stripMd(arc.description) }) : arc.mainConflict ? el("p", { text: arc.mainConflict }) : null,
                el("div", { class: "progress sm" }, [el("span", { style: { width: `${pct}%` } })]),
                el("div", { class: "arc-foot" }, [
                    el("span", { text: `${events.length} events` }),
                    el("span", { text: "·" }),
                    el("span", { text: `${pct}% complete` }),
                    toArray(arc.mainCharacterIds).length ? el("span", { text: "·" }) : null,
                    toArray(arc.mainCharacterIds).length
                        ? el("span", { text: toArray(arc.mainCharacterIds).map((id) => byId("characters", id)?.name || "?").slice(0, 2).join(", ") })
                        : null,
                ]),
            ]);
        })
    );
}

/* ---------------------------------------------------------------- threads */

export function threadsView() {
    const events = activeDocs("events");
    const threads = activeDocs("story_threads");
    const wrap = el("div", { class: "stack" });

    const unresolved = threads.filter((t) => ["Not Started", "Active", "Developing", "On Hold", ""].includes(t.status ?? ""));
    const stale = unresolved.filter((t) => isStaleThread(t, events));

    wrap.appendChild(
        el("div", { class: "row between" }, [
            el("div", { class: "row", style: { gap: "0.5rem" } }, [
                badge(`${unresolved.length} unresolved`, "warning"),
                stale.length ? badge(`${stale.length} need attention`, "danger") : badge("All threads active", "success"),
            ]),
            el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => createAndEdit("story_threads") }, [icon("plus"), "New thread"]),
        ])
    );

    if (stale.length) {
        wrap.appendChild(
            el("div", { class: "notice danger" }, [
                icon("alert"),
                el("div", {}, [
                    el("strong", { text: "Unresolved threads without recent development" }),
                    el("p", { style: { margin: "0.2rem 0 0" }, text: stale.map((t) => t.title).slice(0, 6).join(", ") }),
                ]),
            ])
        );
    }

    if (!threads.length) {
        return el("div", { class: "card" }, [
            emptyState({
                iconName: "share",
                title: "No story threads yet",
                message: "A thread tracks one ongoing plotline across events and arcs — a missing character, an unopened door, a promise not yet kept.",
                action: el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("story_threads") }, [icon("plus"), "Create a thread"]),
            }),
        ]);
    }

    const byStatus = new Map();
    for (const t of threads) {
        const key = t.status || "Not Started";
        if (!byStatus.has(key)) byStatus.set(key, []);
        byStatus.get(key).push(t);
    }
    const order = ["Active", "Developing", "Not Started", "On Hold", "Resolved", "Abandoned"];
    const sortedKeys = Array.from(byStatus.keys()).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));

    sortedKeys.forEach((status) => {
        const list = byStatus.get(status);
        wrap.appendChild(sectionTitle(`${status} · ${list.length}`));
        wrap.appendChild(
            el(
                "div",
                { class: "grid cols-2" },
                list.map((thread) => {
                    const isStale = isStaleThread(thread, events);
                    const linked = toArray(thread.eventIds).map((id) => byId("events", id)).filter(Boolean);
                    return el("div", { class: `arc-card thread-card${isStale ? " stale" : ""}`, onclick: () => openEditor("story_threads", thread.id) }, [
                        el("h3", {}, [el("span", { text: thread.title || "Untitled thread" }), isStale ? el("span", { class: "thread-flag" }, [icon("alert"), "Stale"]) : null]),
                        el("div", { class: "row", style: { gap: "0.3rem" } }, [statusBadge(thread.status), importanceBadge(thread.importance)]),
                        thread.description ? el("p", { text: stripMd(thread.description) }) : null,
                        el("div", { class: "arc-foot" }, [
                            el("span", { text: `${linked.length} events` }),
                            toArray(thread.characterIds).length ? el("span", { text: "·" }) : null,
                            toArray(thread.characterIds).length
                                ? el("span", { text: toArray(thread.characterIds).map((id) => byId("characters", id)?.name || "?").slice(0, 3).join(", ") })
                                : null,
                        ]),
                    ]);
                })
            )
        );
    });
    return wrap;
}

function dateOf(doc) {
    return parseDate(doc.actualDate || doc.plannedDate || (doc.month ? `${doc.month}-01` : ""))?.getTime() || Number.MAX_SAFE_INTEGER;
}

function stripMd(text) {
    return String(text || "").replace(/[#*`>_~]/g, "").replace(/\n+/g, " ").trim().slice(0, 180);
}

/* --------------------------------------------------------------- chapters */

export function chaptersView() {
    const chapters = activeDocs("chapters");
    const arcs = activeDocs("story_arcs");
    const wrap = el("div", { class: "stack" });

    const toolbar = el("div", { class: "row between" }, [
        el("h2", { style: { fontSize: "1rem" }, text: `${chapters.length} chapters` }),
        el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => createAndEdit("chapters") }, [icon("plus"), "New chapter"]),
    ]);
    wrap.appendChild(toolbar);

    if (!chapters.length) {
        return el("div", { class: "card" }, [
            emptyState({
                iconName: "book",
                title: "No chapters yet",
                message: "Chapters divide a season into movements: an opening situation, major developments, and an ending situation.",
                action: el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("chapters") }, [icon("plus"), "Create a chapter"]),
            }),
        ]);
    }

    const seasons = activeDocs("seasons").sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
    const renderGroup = (label, list) => {
        if (!list.length) return;
        wrap.appendChild(sectionTitle(label));
        const sorted = list.slice().sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
        const grid = el("div", { class: "grid cols-2" });
        sorted.forEach((chapter) => {
            const chapterEvents = docs("events").filter((e) => String(e.chapterId) === String(chapter.id) && !e.archived);
            const chapterArcs = arcs.filter((a) => String(a.chapterId) === String(chapter.id));
            const done = chapterEvents.filter((e) => e.status === "Completed").length;
            grid.appendChild(
                el("div", { class: "arc-card", style: { "--accent": "var(--c-chapter)", cursor: "pointer" }, onclick: () => openEditor("chapters", chapter.id) }, [
                    el("h3", {}, [el("span", { class: "season-num", text: `Ch.${chapter.number || "?"}` }), el("span", { text: chapter.title || "Untitled chapter" })]),
                    el("div", { class: "row", style: { gap: "0.3rem" } }, [statusBadge(chapter.status), badge(`${chapterEvents.length} events`, "ghost"), badge(`${chapterArcs.length} arcs`, "ghost")]),
                    chapter.objective ? el("p", { text: chapter.objective }) : chapter.description ? el("p", { text: stripMd(chapter.description) }) : null,
                    el("div", { class: "progress sm" }, [el("span", { style: { width: `${chapterEvents.length ? Math.round((done / chapterEvents.length) * 100) : 0}%` } })]),
                    el("div", { class: "arc-foot" }, [
                        el("span", { text: "Opening" }),
                        el("span", { text: "→" }),
                        el("span", { text: "Developments" }),
                        el("span", { text: "→" }),
                        el("span", { text: "Ending" }),
                    ]),
                ])
            );
        });
        wrap.appendChild(grid);
    };

    seasons.forEach((season) => {
        renderGroup(`${season.name}${season.number ? ` · Season ${season.number}` : ""}`, chapters.filter((c) => String(c.seasonId) === String(season.id)));
    });
    renderGroup("Chapters without a season", chapters.filter((c) => !c.seasonId));
    return wrap;
}
