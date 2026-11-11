/* Story Planner — Story insights: descriptive analytics that surface gaps.
   Nothing here changes the story automatically. */

import {el, icon, toArray, MONTHS} from "../util.js";
import {activeDocs, byId} from "../store.js";
import {pageHead, card} from "../components/ui.js";
import { detailPath } from "../router.js";
import {
    characterAppearances,
    connectionsPerCharacter,
    eventsPerMonth,
    loreConnectionCounts,
    eventsMissingPrerequisites,
    incompleteCharacters,
    inactiveCharacters,
    arcEventCounts,
    factionActivity,
    unresolvedThreads,
    completionBreakdown,
} from "./insights-lib.js";

export function insightsPage() {
    const root = el("div", { class: "page" });
    root.appendChild(
        pageHead("Story insights", "Gaps and imbalances in the narrative. These are observations, not instructions — the creative call stays with you.", [
            el("a", { class: "btn btn-ghost", href: "#/dashboard" }, [icon("dashboard"), "Dashboard"]),
        ])
    );

    root.appendChild(
        el("div", { class: "notice" }, [
            icon("info"),
            el("span", { text: "Insights are computed live from your BreadBackend records. They never mark anything complete on their own." }),
        ])
    );

    const appearances = characterAppearances();
    const connections = connectionsPerCharacter();
    const perMonth = eventsPerMonth();
    const loreLinks = loreConnectionCounts();
    const missingPrereqs = eventsMissingPrerequisites();
    const incomplete = incompleteCharacters();
    const inactive = inactiveCharacters();
    const arcCounts = arcEventCounts();
    const factions = factionActivity();
    const threads = unresolvedThreads();
    const breakdown = completionBreakdown();

    /* ---- most frequent characters ---- */
    root.appendChild(
        el("div", { class: "grid cols-2" }, [
            card({
                title: "Most frequently appearing characters",
                iconName: "users",
                body: [
                    barList(
                        Array.from(appearances.entries())
                            .map(([id, count]) => ({ doc: byId("characters", id), count }))
                            .filter((x) => x.doc)
                            .sort((a, b) => b.count - a.count)
                            .slice(0, 8),
                        (x) => x.doc.name,
                        (x) => x.count
                    ),
                ],
            }),
            card({
                title: "Characters with the most connections",
                iconName: "link",
                body: [
                    barList(
                        Array.from(connections.entries())
                            .map(([id, count]) => ({ doc: byId("characters", id), count }))
                            .filter((x) => x.doc && x.count > 0)
                            .sort((a, b) => b.count - a.count)
                            .slice(0, 8),
                        (x) => x.doc.name,
                        (x) => x.count,
                        "relationships"
                    ),
                ],
            }),
        ])
    );

    /* ---- events per month + completion ---- */
    const monthKeys = Array.from(perMonth.keys()).filter((k) => k !== "undated");
    const maxMonth = Math.max(1, ...Array.from(perMonth.values()));
    root.appendChild(
        el("div", { class: "grid cols-2" }, [
            card({
                title: "Events per month",
                iconName: "calendar",
                body: [
                    el("div", { class: "bar-list" }, monthKeys.slice(-10).map((key) => {
                        const [y, m] = key.split("-");
                        const count = perMonth.get(key) || 0;
                        return el("div", { class: "bar-row" }, [
                            el("span", { class: "b-name", text: `${MONTHS[Number(m) - 1] || m} ${y}` }),
                            el("span", { class: "b-track" }, [el("span", { class: "b-fill", style: { width: `${(count / maxMonth) * 100}%` } })]),
                            el("span", { class: "b-val", text: String(count) }),
                        ]);
                    })),
                    perMonth.get("undated") ? el("p", { class: "field-hint", text: `${perMonth.get("undated")} event(s) have no month or date — they will not appear on month views.` }) : null,
                ],
            }),
            card({
                title: "Completed vs planned",
                iconName: "target",
                body: [
                    el("div", { class: "bar-list" }, Array.from(breakdown.entries()).sort((a, b) => b[1] - a[1]).map(([status, count]) =>
                        el("div", { class: "bar-row" }, [
                            el("span", { class: "b-name", text: status }),
                            el("span", { class: "b-track" }, [el("span", { class: "b-fill", style: { width: `${(count / Math.max(1, activeDocs("events").length)) * 100}%` } })]),
                            el("span", { class: "b-val", text: String(count) }),
                        ])
                    )),
                ],
            }),
        ])
    );

    /* ---- gaps ---- */
    root.appendChild(
        el("div", { class: "grid cols-2" }, [
            card({
                title: "Events with unmet prerequisites",
                iconName: "branch",
                body: [
                    missingPrereqs.length
                        ? el("div", { class: "ref-list" }, missingPrereqs.slice(0, 10).map((e) =>
                              el("a", { class: "ref", href: detailPath("events", e.id) }, [
                                  el("span", { class: "ref-ico", style: { background: "var(--error-soft)", color: "var(--error)" } }, icon("alert")),
                                  el("span", { class: "ref-name", text: e.title }),
                                  el("span", { class: "ref-side", text: `${toArray(e.prerequisiteEventIds).length} prereqs` }),
                              ])
                          ))
                        : el("p", { class: "field-hint", text: "None — every event with prerequisites has them satisfied or overridden." }),
                ],
            }),
            card({
                title: "Unresolved story threads",
                iconName: "share",
                body: [
                    threads.length
                        ? el("div", { class: "ref-list" }, threads.slice(0, 10).map((t) =>
                              el("a", { class: "ref", href: detailPath("story_threads", t.doc.id) }, [
                                  el("span", { class: "ref-ico", style: { background: t.stale ? "var(--error-soft)" : "var(--light-blue)", color: t.stale ? "var(--error)" : "var(--c-thread)" } }, icon(t.stale ? "alert" : "share")),
                                  el("span", { class: "ref-name", text: t.doc.title }),
                                  el("span", { class: "ref-side", text: t.stale ? "needs attention" : t.doc.status || "open" }),
                              ])
                          ))
                        : el("p", { class: "field-hint", text: "No unresolved threads. Every thread has been resolved or closed." }),
                    threads.filter((t) => t.stale).length
                        ? el("p", { class: "field-hint", style: { marginTop: "0.5rem" }, text: `${threads.filter((t) => t.stale).length} thread(s) have no development in the last 21 days.` })
                        : null,
                ],
            }),
        ])
    );

    /* ---- inactive characters + arcs ---- */
    root.appendChild(
        el("div", { class: "grid cols-2" }, [
            card({
                title: "Characters who have not appeared recently",
                iconName: "user",
                body: [
                    inactive.length
                        ? el("div", { class: "ref-list" }, inactive.slice(0, 10).map((x) =>
                              el("a", { class: "ref", href: detailPath("characters", x.doc.id) }, [
                                  el("span", { class: "ref-ico" }, icon("user")),
                                  el("span", { class: "ref-name", text: x.doc.name }),
                                  el("span", { class: "ref-side", text: x.days === null ? "never appeared" : `${x.days}d since last event` }),
                              ])
                          ))
                        : el("p", { class: "field-hint", text: "Every active character has appeared in an event recently." }),
                ],
            }),
            card({
                title: "Story arcs with the most events",
                iconName: "branch",
                body: [
                    arcCounts.length
                        ? barList(arcCounts.slice(0, 8), (x) => x.doc.name, (x) => x.count, "events")
                        : el("p", { class: "field-hint", text: "No story arcs yet." }),
                ],
            }),
        ])
    );

    /* ---- factions + lore ---- */
    root.appendChild(
        el("div", { class: "grid cols-2" }, [
            card({
                title: "Most active factions",
                iconName: "flag",
                body: [
                    factions.length
                        ? el("div", { class: "ref-list" }, factions.slice(0, 8).map((f) =>
                              el("a", { class: "ref", href: detailPath("factions", f.doc.id) }, [
                                  el("span", { class: "ref-ico", style: { color: "var(--c-faction)" } }, icon("flag")),
                                  el("span", { class: "ref-name", text: f.doc.name }),
                                  el("span", { class: "ref-side", text: `${f.events} events · ${f.members} members` }),
                              ])
                          ))
                        : el("p", { class: "field-hint", text: "No factions yet." }),
                ],
            }),
            card({
                title: "Lore entries with the most connections",
                iconName: "book",
                body: [
                    loreLinks.length
                        ? barList(
                              loreLinks.slice().sort((a, b) => b.count - a.count).slice(0, 8),
                              (x) => x.doc.title,
                              (x) => x.count,
                              "links"
                          )
                        : el("p", { class: "field-hint", text: "No lore entries yet." }),
                ],
            }),
        ])
    );

    /* ---- incomplete profiles ---- */
    root.appendChild(
        card({
            title: `Characters with incomplete profiles (${incomplete.length})`,
            iconName: "alert",
            body: [
                incomplete.length
                    ? el("div", { class: "ref-list" }, incomplete.slice(0, 12).map((c) =>
                          el("a", { class: "ref", href: detailPath("characters", c.id) }, [
                              el("span", { class: "ref-ico", style: { color: "var(--warning)" } }, icon("user")),
                              el("span", { class: "ref-name", text: c.name }),
                              el("span", { class: "ref-side", text: "needs appearance, personality, origin or motivation" }),
                          ])
                      ))
                    : el("p", { class: "field-hint", text: "Every character profile has its core sections filled in." }),
            ],
        })
    );

    return root;
}

function barList(items, nameFn, valueFn, unit) {
    if (!items.length) return el("p", { class: "field-hint", text: "Nothing to show yet." });
    const max = Math.max(1, ...items.map(valueFn));
    return el(
        "div",
        { class: "bar-list" },
        items.map((item) =>
            el("div", { class: "bar-row" }, [
                el("span", { class: "b-name", text: nameFn(item) || "(untitled)", title: nameFn(item) }),
                el("span", { class: "b-track" }, [el("span", { class: "b-fill", style: { width: `${(valueFn(item) / max) * 100}%` } })]),
                el("span", { class: "b-val", text: unit ? `${valueFn(item)} ${unit}` : String(valueFn(item)) }),
            ])
        )
    );
}
