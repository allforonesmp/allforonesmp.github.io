/* Story Planner — Dashboard: the current state of the narrative at a glance. */

import {el, icon, fmtDate, relTime, toArray, parseDate, MONTHS} from "../util.js";
import { activeDocs, archivedDocs, byId, recentActivity, getWorkspaceMeta, saveWorkspaceMeta, subscribe } from "../store.js";

import { statTile, emptyState, badge, statusBadge, importanceBadge, meter, toast, toastError, promptDialog, openModal, closeModal } from "../components/ui.js";
import { createAndEdit } from "../components/editor.js";
import { navigate, detailPath } from "../router.js";

;

function dateOfEvent(e) {
    return parseDate(e.actualDate || e.plannedDate || (e.month ? `${e.month}-01` : "")) || null;
}

export function dashboardPage() {
    const root = el("div", { class: "page" });
    const meta = getWorkspaceMeta();

    const events = activeDocs("events");
    const characters = activeDocs("characters");
    const mainEvents = events.filter((e) => e.kind === "Main Event");
    const completed = events.filter((e) => e.status === "Completed");
    const unresolvedThreads = activeDocs("story_threads").filter((t) => ["Not Started", "Active", "Developing", "On Hold"].includes(t.status) || !t.status);

    const season = byId("seasons", meta.currentSeasonId);
    const arc = byId("story_arcs", meta.currentArcId);
    const chapter = byId("chapters", meta.currentChapterId);

    /* ---------------------------------------------------------- header */
    const header = el("div", { class: "page-head" }, [
        el("div", {}, [
            el("h1", {}, ["Story dashboard"]),
            el("p", { class: "lead" }, [
                "Everything the team needs to know about where the AllForOne storyline stands right now.",
            ]),
        ]),
        el("div", { class: "page-actions" }, [
            el("button", { class: "btn btn-ghost", type: "button", onclick: () => openWorkspaceSettings(refresh) }, [icon("layers"), "Set current story state"]),
            el("a", { class: "btn btn-primary", href: "#/timeline" }, [icon("timeline"), "Open timeline"]),
        ]),
    ]);
    root.appendChild(header);

    /* ------------------------------------------------- current story card */
    const storyBody = el("div", { class: "stack sm" });
    const storyGrid = el("div", { class: "defs" }, [
        defItem("Current season", season ? el("a", { href: detailPath("seasons", season.id), text: season.name }) : empty("Not set")),
        defItem("Current story arc", arc ? el("a", { href: detailPath("story_arcs", arc.id), text: arc.name }) : empty("Not set")),
        defItem("Current chapter", chapter ? el("a", { href: detailPath("chapters", chapter.id), text: chapter.title }) : empty("Not set")),
        defItem("Storyline status", meta.storyStatus ? badge(meta.storyStatus, "solid") : empty("Not set")),
    ]);
    storyBody.appendChild(storyGrid);

    const seasonEvents = season ? events.filter((e) => String(e.seasonId) === String(season.id)) : [];
    const arcProgress = arc ? (Number(arc.progress) || progressFromEvents(events.filter((e) => String(e.arcId) === String(arc.id)))) : 0;
    const monthKeyNow = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const thisMonthMain = mainEvents.filter((e) => (e.month || "").startsWith(monthKeyNow));
    const monthProgress = thisMonthMain.length
        ? Math.round(thisMonthMain.reduce((sum, e) => sum + (Number(e.progress) || (e.status === "Completed" ? 100 : 0)), 0) / thisMonthMain.length)
        : Number(meta.monthlyProgress) || 0;

    storyBody.appendChild(
        el("div", { class: "grid cols-2", style: { gap: "0.9rem" } }, [
            el("div", { class: "stack sm" }, [
                meter("Overall storyline completion", Number(meta.overallProgress) || 0),
                el("button", {
                    class: "link-btn",
                    type: "button",
                    style: { alignSelf: "flex-start" },
                    onclick: async () => {
                        const v = await promptDialog({
                            title: "Overall storyline completion",
                            label: "Percentage (0–100). Progress is manual — dates never assume completion.",
                            value: String(meta.overallProgress || 0),
                        });
                        if (v === null) return;
                        try {
                            await saveWorkspaceMeta({ overallProgress: Math.max(0, Math.min(100, Number(v) || 0)) });
                            refresh();
                        } catch (err) {
                            toastError(err, "Saving progress");
                        }
                    },
                }, "Set manually"),
                meter(arc ? `Current arc — ${arc.name}` : "Current arc progress", arcProgress),
                meter(`This month's main event (${MONTHS[new Date().getMonth()]})`, monthProgress, { gold: true }),
            ]),
            el("div", { class: "stack sm" }, [
                el("div", { class: "section-title", text: "Upcoming milestones" }),
                ...milestoneList(meta, refresh),
                el("button", {
                    class: "btn btn-ghost btn-sm",
                    type: "button",
                    style: { alignSelf: "flex-start" },
                    onclick: () => editMilestones(meta, refresh),
                }, [icon("plus"), "Edit milestones"]),
            ]),
        ])
    );

    root.appendChild(
        el("div", { class: "card" }, [
            el("div", { class: "card-head" }, [
                el("h2", {}, [icon("layers"), "Story overview"]),
                el("div", { class: "head-actions" }, [
                    el("button", {
                        class: "btn btn-ghost btn-sm",
                        type: "button",
                        onclick: () => openWorkspaceSettings(),
                    }, [icon("settings"), "Set current"]),
                ]),
            ]),
            el("div", { class: "card-body" }, [storyBody]),
        ])
    );

    /* --------------------------------------------------------- stat tiles */
    const stats = el("div", { class: "stats" }, [
        statTile({ label: "Planned events", value: events.length, iconName: "calendar", accent: "var(--c-event)", href: "#/events" }),
        statTile({ label: "Completed events", value: completed.length, iconName: "check", accent: "var(--success)", href: "#/events?status=Completed" }),
        statTile({ label: "Main events", value: mainEvents.length, iconName: "star", accent: "var(--c-event-main)", href: "#/events?kind=Main%20Event" }),
        statTile({ label: "Active characters", value: characters.length, iconName: "users", accent: "var(--c-character)", href: "#/characters" }),
        statTile({ label: "Archived characters", value: archivedDocs("characters").length, iconName: "archive", accent: "var(--text-light)", href: "#/archive" }),
        statTile({ label: "Lore entries", value: activeDocs("lore").length, iconName: "book", accent: "var(--c-lore)", href: "#/lore" }),
        statTile({ label: "Factions", value: activeDocs("factions").length, iconName: "flag", accent: "var(--c-faction)", href: "#/factions" }),
        statTile({ label: "Unresolved threads", value: unresolvedThreads.length, iconName: "share", accent: "var(--c-thread)", href: "#/storyline?tab=threads" }),
    ]);
    root.appendChild(stats);

    /* ------------------------------------------------------ upcoming + activity */
    const upcoming = events
        .filter((e) => e.status !== "Completed" && e.status !== "Cancelled" && e.status !== "Archived")
        .map((e) => ({ e, d: dateOfEvent(e) }))
        .filter((x) => x.d && x.d.getTime() >= Date.now() - 86400000 * 7)
        .sort((a, b) => a.d - b.d)
        .slice(0, 6);

    const upcomingCard = el("div", { class: "card" }, [
        el("div", { class: "card-head" }, [
            el("h2", {}, [icon("calendarStar"), "Upcoming events"]),
            el("div", { class: "head-actions" }, [el("a", { class: "link-btn", href: "#/events" }, "All events")]),
        ]),
        upcoming.length
            ? el(
                  "div",
                  { class: "list" },
                  upcoming.map(({ e, d }) =>
                      el("a", { class: "list-item", href: detailPath("events", e.id) }, [
                          el("span", { class: "li-mark", style: { background: e.kind === "Main Event" ? "var(--gold-soft)" : "", color: e.kind === "Main Event" ? "var(--gold-dark)" : "" } }, icon(e.kind === "Main Event" ? "star" : "calendar")),
                          el("div", { class: "li-main" }, [
                              el("div", { class: "li-title" }, [
                                  el("span", { class: "t", text: e.title }),
                                  e.kind === "Main Event" ? badge("Main", "gold") : null,
                              ]),
                              el("div", { class: "li-meta" }, [
                                  el("span", { text: fmtDate(d) }),
                                  el("span", { class: "sep", text: "·" }),
                                  el("span", { text: e.category || e.kind || "Event" }),
                                  toArray(e.mainCharacterIds).length ? el("span", { class: "sep", text: "·" }) : null,
                                  toArray(e.mainCharacterIds).length
                                      ? el("span", { text: toArray(e.mainCharacterIds).map((id) => byId("characters", id)?.name || "?").slice(0, 3).join(", ") })
                                      : null,
                              ]),
                          ]),
                          el("span", { class: "li-side" }, [statusBadge(e.status), importanceBadge(e.importance)]),
                      ])
                  )
              )
            : emptyState({
                  iconName: "calendar",
                  title: "No upcoming events scheduled",
                  message: "Plan the next main event to keep the storyline moving.",
                  action: el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => createAndEdit("events", { kind: "Main Event", status: "Planned" }) }, [icon("plus"), "Plan an event"]),
              }),
    ]);

    const activity = recentActivity(7);
    const activityCard = el("div", { class: "card" }, [
        el("div", { class: "card-head" }, [
            el("h2", {}, [icon("clock"), "Recent activity"]),
            el("div", { class: "head-actions" }, [el("a", { class: "link-btn", href: "#/archive" }, "Archive")]),
        ]),
        activity.length
            ? el(
                  "div",
                  { class: "list" },
                  activity.map((item) =>
                      el("a", { class: "list-item", href: detailPath(item.collection, item.doc.id) }, [
                          el("span", { class: "li-mark" }, icon(collectionIcon(item.collection))),
                          el("div", { class: "li-main" }, [
                              el("div", { class: "li-title" }, [el("span", { class: "t", text: item.title })]),
                              el("div", { class: "li-meta" }, [
                                  el("span", { text: collectionLabel(item.collection) }),
                                  el("span", { class: "sep", text: "·" }),
                                  el("span", { text: relTime(item.doc.updatedAt) }),
                                  item.doc.updatedBy ? el("span", { class: "sep", text: "·" }) : null,
                                  item.doc.updatedBy ? el("span", { text: item.doc.updatedBy }) : null,
                              ]),
                          ]),
                      ])
                  )
              )
            : emptyState({ iconName: "clock", title: "No activity yet", message: "Edits to events, characters, lore and arcs appear here." }),
    ]);

    root.appendChild(el("div", { class: "grid split" }, [el("div", { class: "stack" }, [upcomingCard]), el("div", { class: "stack" }, [activityCard])]));

    /* ------------------------------------------------------ quick actions */
    const quick = el("div", { class: "quick-actions" }, [
        quickAction("users", "Create character", () => createAndEdit("characters")),
        quickAction("calendarStar", "Create event", () => createAndEdit("events")),
        quickAction("book", "Create lore entry", () => createAndEdit("lore")),
        quickAction("branch", "Create story arc", () => createAndEdit("story_arcs")),
        quickAction("note", "Add story idea", () => createAndEdit("notes")),
        quickAction("share", "Open story diagram", () => navigate("#/diagrams")),
    ]);
    root.appendChild(
        el("div", { class: "card" }, [
            el("div", { class: "card-head" }, [el("h2", {}, [icon("sparkles"), "Quick actions"])]),
            el("div", { class: "card-body" }, [quick]),
        ])
    );

    /* ------------------------------------------------------- refresh wiring */
    const unsub = subscribe((ev) => {
        if (ev.type === "changed" || ev.type === "saved" || ev.type === "loaded") {
            if (root.isConnected) {
                clearTimeout(refreshTimer);
                refreshTimer = setTimeout(() => {
                    const parent = root.parentNode;
                    if (parent) {
                        const fresh = dashboardPage();
                        parent.replaceChild(fresh, root);
                    }
                }, 700);
            }
        }
    });
    let refreshTimer = null;

    function refresh() {
        const parent = root.parentNode;
        if (parent) {
            const fresh = dashboardPage();
            parent.replaceChild(fresh, root);
        }
    }

    root.addEventListener("planner:dispose", () => {
        unsub();
        clearTimeout(refreshTimer);
    });
    return root;
}

/* ---------------------------------------------------------------- helpers */

function defItem(label, valueNode) {
    return el("div", { class: "def" }, [el("span", { class: "def-label", text: label }), el("div", { class: "def-value" }, [valueNode])]);
}

function empty(text) {
    return el("span", { class: "def-value empty-val", text });
}

function progressFromEvents(list) {
    if (!list.length) return 0;
    return Math.round(
        list.reduce((sum, e) => sum + (Number(e.progress) || (e.status === "Completed" ? 100 : e.status === "In Progress" ? 60 : 10)), 0) / list.length
    );
}

function quickAction(iconName, label, onclick) {
    return el("button", { class: "quick-action", type: "button", onclick }, [icon(iconName), el("span", { text: label })]);
}

function collectionIcon(c) {
    return (
        {
            events: "calendar",
            characters: "users",
            lore: "book",
            story_arcs: "branch",
            story_threads: "share",
            factions: "flag",
            locations: "mapPin",
            seasons: "layers",
            chapters: "book",
            character_relationships: "link",
            faction_relationships: "share",
            storyboards: "list",
            notes: "note",
        }[c] || "file"
    );
}

function collectionLabel(c) {
    return (
        {
            events: "Event",
            characters: "Character",
            lore: "Lore",
            story_arcs: "Story arc",
            story_threads: "Story thread",
            factions: "Faction",
            locations: "Location",
            seasons: "Season",
            chapters: "Chapter",
            character_relationships: "Relationship",
            faction_relationships: "Faction relation",
            storyboards: "Storyboard",
            notes: "Note",
        }[c] || c
    );
}

function milestoneList(meta, refresh) {
    const items = toArray(meta.milestones);
    if (!items.length) {
        return [el("p", { class: "field-hint", text: "No milestones defined yet. Milestones are manual checkpoints, not date-driven." })];
    }
    return items
        .slice()
        .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
        .map((m) =>
            el("div", { class: "row", style: { gap: "0.45rem", alignItems: "center", padding: "0.2rem 0" } }, [
                el("span", { class: `heat-cell heat-${m.done ? "4" : "1"}`, style: { borderRadius: "50%" } }),
                el("span", { style: { fontSize: "0.85rem", flex: "1" }, text: m.title }),
                m.date ? el("span", { class: "field-hint", text: fmtDate(m.date) }) : null,
                el("button", {
                    class: "link-btn",
                    type: "button",
                    onclick: async () => {
                        const next = items.map((x) => (x.title === m.title ? { ...x, done: !x.done } : x));
                        try {
                            await saveWorkspaceMeta({ milestones: next });
                            refresh();
                        } catch (err) {
                            toastError(err, "Saving milestones");
                        }
                    },
                }, m.done ? "Undo" : "Mark done"),
            ])
        );
}

function editMilestones(meta, refresh) {
    const items = toArray(meta.milestones).slice();
    const body = el("div", { class: "stack sm" });
    const render = () => {
        body.innerHTML = "";
        items.forEach((m, i) => {
            const title = el("input", { type: "text", value: m.title || "", placeholder: "Milestone title", style: { flex: "2 1 160px" } });
            const date = el("input", { type: "date", value: m.date || "", style: { flex: "0 1 150px" } });
            const done = el("input", { type: "checkbox", checked: Boolean(m.done) });
            const commit = () => {
                items[i] = { ...m, title: title.value, date: date.value, done: done.checked };
            };
            [title, date, done].forEach((input) => input.addEventListener("change", commit));
            body.appendChild(
                el("div", { class: "row nowrap", style: { gap: "0.35rem" } }, [
                    el("label", { class: "check" }, [done]),
                    title,
                    date,
                    el("button", {
                        class: "icon-btn",
                        type: "button",
                        onclick: () => {
                            items.splice(i, 1);
                            render();
                        },
                    }, icon("x")),
                ])
            );
        });
        body.appendChild(
            el("button", {
                class: "btn btn-ghost btn-sm",
                type: "button",
                onclick: () => {
                    items.push({ title: "", date: "", done: false });
                    render();
                },
            }, [icon("plus"), "Add milestone"])
        );
    };
    render();
    const modal = openModal({
        title: "Narrative milestones",
        body,
        footer: [
            el("button", { class: "btn btn-ghost", type: "button", onclick: () => closeModal(modal) }, "Cancel"),
            el("button", {
                class: "btn btn-primary",
                type: "button",
                onclick: async () => {
                    try {
                        await saveWorkspaceMeta({ milestones: items.filter((m) => m.title.trim()) });
                        closeModal(modal);
                        refresh();
                    } catch (err) {
                        toastError(err, "Saving milestones");
                    }
                },
            }, "Save milestones"),
        ],
    });
}

export function openWorkspaceSettings(onSaved) {
    const meta = getWorkspaceMeta();
    const seasonSelect = el("select", {}, [
        el("option", { value: "", text: "— Not set —" }),
        ...activeDocs("seasons").map((s) => el("option", { value: s.id, selected: String(meta.currentSeasonId) === String(s.id), text: s.name })),
    ]);
    const arcSelect = el("select", {}, [
        el("option", { value: "", text: "— Not set —" }),
        ...activeDocs("story_arcs").map((a) => el("option", { value: a.id, selected: String(meta.currentArcId) === String(a.id), text: a.name })),
    ]);
    const chapterSelect = el("select", {}, [
        el("option", { value: "", text: "— Not set —" }),
        ...activeDocs("chapters").map((c) => el("option", { value: c.id, selected: String(meta.currentChapterId) === String(c.id), text: c.title })),
    ]);
    const statusInput = el("input", { type: "text", value: meta.storyStatus || "", placeholder: "e.g. Building toward the Fracture" });
    const progressInput = el("input", { type: "number", min: 0, max: 100, value: Number(meta.overallProgress) || 0 });

    const modal = openModal({
        title: "Current story state",
        body: el("div", { class: "stack sm" }, [
            el("p", { class: "field-hint", text: "These values drive the dashboard. Progress is always manual — the app never assumes an arc is complete because a date passed." }),
            el("label", { class: "field" }, [el("span", { class: "field-label", text: "Current season" }), seasonSelect]),
            el("label", { class: "field" }, [el("span", { class: "field-label", text: "Current story arc" }), arcSelect]),
            el("label", { class: "field" }, [el("span", { class: "field-label", text: "Current chapter" }), chapterSelect]),
            el("label", { class: "field" }, [el("span", { class: "field-label", text: "Storyline status" }), statusInput]),
            el("label", { class: "field" }, [el("span", { class: "field-label", text: "Overall completion %" }), progressInput]),
        ]),
        footer: [
            el("button", { class: "btn btn-ghost", type: "button", onclick: () => closeModal(modal) }, "Cancel"),
            el("button", {
                class: "btn btn-primary",
                type: "button",
                onclick: async () => {
                    try {
                        await saveWorkspaceMeta({
                            currentSeasonId: seasonSelect.value,
                            currentArcId: arcSelect.value,
                            currentChapterId: chapterSelect.value,
                            storyStatus: statusInput.value,
                            overallProgress: Number(progressInput.value) || 0,
                        });
                        closeModal(modal);
                        toast("Story state updated.", "success");
                        if (onSaved) onSaved();
                    } catch (err) {
                        toastError(err, "Saving story state");
                    }
                },
            }, "Save"),
        ],
    });
}
