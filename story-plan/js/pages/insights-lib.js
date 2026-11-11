/* Story insight calculations — shared by the dashboard and the insights page.
   These are descriptive only; nothing here mutates the story automatically. */

import { docs, activeDocs, byId } from "../store.js";
import { toArray, parseDate, daysSince } from "../util.js";

export const UNRESOLVED_STATUSES = ["Not Started", "Active", "Developing", "On Hold", ""];
export const STALE_DAYS = 21;

export function isStaleThread(thread, events) {
    if (!UNRESOLVED_STATUSES.includes(thread.status ?? "")) return false;
    const related = toArray(thread.eventIds)
        .map((id) => byId("events", id))
        .filter(Boolean);
    const pool = related.length ? related : toArray(thread.arcIds).flatMap((arcId) => events.filter((e) => String(e.arcId) === String(arcId)));
    if (!pool.length) return true;
    const latest = Math.max(...pool.map((e) => parseDate(e.actualDate || e.plannedDate || (e.month ? `${e.month}-01` : ""))?.getTime() || 0));
    if (!latest) return true;
    return (Date.now() - latest) / 86400000 > STALE_DAYS;
}

export function characterAppearances() {
    const events = activeDocs("events");
    const map = new Map();
    for (const ch of activeDocs("characters")) {
        const count = events.filter((e) =>
            ["mainCharacterIds", "supportingCharacterIds", "antagonistIds", "affectedCharacterIds"].some((f) =>
                toArray(e[f]).map(String).includes(String(ch.id))
            )
        ).length;
        map.set(ch.id, count);
    }
    return map;
}

export function connectionsPerCharacter() {
    const rels = activeDocs("character_relationships");
    const map = new Map();
    for (const ch of activeDocs("characters")) map.set(ch.id, 0);
    for (const r of rels) {
        if (map.has(String(r.aId))) map.set(String(r.aId), map.get(String(r.aId)) + 1);
        if (map.has(String(r.bId))) map.set(String(r.bId), map.get(String(r.bId)) + 1);
    }
    return map;
}

export function eventsPerMonth() {
    const events = activeDocs("events");
    const map = new Map();
    for (const e of events) {
        const key = (e.month || (e.plannedDate || "").slice(0, 7) || (e.actualDate || "").slice(0, 7) || "undated");
        map.set(key, (map.get(key) || 0) + 1);
    }
    return new Map(Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])));
}

export function loreConnectionCounts() {
    const lore = activeDocs("lore");
    return lore.map((l) => {
        let count = toArray(l.relatedLoreIds).length + toArray(l.characterIds).length + toArray(l.eventIds).length + toArray(l.locationIds).length + toArray(l.factionIds).length;
        count += docs("lore").filter((other) => toArray(other.relatedLoreIds).map(String).includes(String(l.id))).length;
        return { doc: l, count };
    });
}

export function eventsMissingPrerequisites() {
    return activeDocs("events").filter((e) => {
        const prereqs = toArray(e.prerequisiteEventIds);
        if (!prereqs.length) return false;
        const missing = prereqs.map((id) => byId("events", id)).filter((p) => !p || p.status !== "Completed");
        return missing.length > 0 && !e.dependencyOverride;
    });
}

export function incompleteCharacters() {
    const required = ["appearance", "personalitySummary", "origin", "primaryMotivation", "history"];
    return activeDocs("characters").filter((c) => required.filter((f) => c[f] && String(c[f]).trim()).length < 3);
}

export function inactiveCharacters(days = 45) {
    const events = activeDocs("events");
    return activeDocs("characters")
        .map((c) => {
            const appearances = events
                .filter((e) => ["mainCharacterIds", "supportingCharacterIds", "antagonistIds"].some((f) => toArray(e[f]).map(String).includes(String(c.id))))
                .map((e) => parseDate(e.actualDate || e.plannedDate || (e.month ? `${e.month}-01` : ""))?.getTime() || 0);
            const latest = appearances.length ? Math.max(...appearances) : 0;
            return { doc: c, days: latest ? Math.floor((Date.now() - latest) / 86400000) : null };
        })
        .filter((x) => x.days === null || x.days > days);
}

export function arcEventCounts() {
    const events = activeDocs("events");
    return activeDocs("story_arcs")
        .map((a) => ({ doc: a, count: events.filter((e) => String(e.arcId) === String(a.id)).length }))
        .sort((a, b) => b.count - a.count);
}

export function factionActivity() {
    const events = activeDocs("events");
    const rels = activeDocs("faction_relationships");
    return activeDocs("factions")
        .map((f) => {
            const evts = events.filter((e) => toArray(e.factionIds).map(String).includes(String(f.id))).length;
            const relCount = rels.filter((r) => String(r.aId) === String(f.id) || String(r.bId) === String(f.id)).length;
            const members = activeDocs("characters").filter((c) => String(c.factionId) === String(f.id)).length;
            return { doc: f, events: evts, relations: relCount, members };
        })
        .sort((a, b) => b.events - a.events);
}

export function unresolvedThreads() {
    const events = activeDocs("events");
    return activeDocs("story_threads").filter((t) => UNRESOLVED_STATUSES.includes(t.status ?? "")).map((t) => ({ doc: t, stale: isStaleThread(t, events), idle: daysSince(t.updatedAt) }));
}

export function completionBreakdown() {
    const events = activeDocs("events");
    const byStatus = new Map();
    for (const e of events) {
        const s = e.status || "Unset";
        byStatus.set(s, (byStatus.get(s) || 0) + 1);
    }
    return byStatus;
}
