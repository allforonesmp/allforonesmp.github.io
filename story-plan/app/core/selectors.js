/* =========================================================================
   Derived data — everything the UI computes from the store.
   ========================================================================= */

import { store, state } from "./store.js";
import { RELATION_TYPES, EVENT_CATEGORIES, PHASES, IMPORTANCE, TYPES, CANON_LABEL } from "./schema.js";
import { unique, groupBy, parseDate } from "./util.js";

const relType = (v) => RELATION_TYPES.find((r) => r.value === v) || { value: v, label: v || "Connection", kind: "historic", color: "var(--r-historic)" };

export function relationshipsOf(characterId) {
    return store.all("relationships").filter((r) => r.aId === characterId || r.bId === characterId);
}

export function relationshipBetween(aId, bId) {
    return store.all("relationships").find(
        (r) => (r.aId === aId && r.bId === bId) || (r.aId === bId && r.bId === aId),
    );
}

export function eventsFor(characterId) {
    return store
        .all("events")
        .filter((e) => (e.characterIds || []).includes(characterId))
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

export function eventsAtLocation(locationId) {
    return store.all("events").filter((e) => e.locationId === locationId).sort(sortByDate);
}

export function eventsForFaction(factionId) {
    return store.all("events").filter((e) => (e.factionIds || []).includes(factionId)).sort(sortByDate);
}

export function eventsForStoryline(storylineId) {
    return store.all("events").filter((e) => (e.storylineIds || []).includes(storylineId)).sort(sortByDate);
}

export function storylinesForCharacter(characterId) {
    return store.all("storylines").filter((s) => (s.characterIds || []).includes(characterId));
}

export function storylinesForFaction(factionId) {
    return store.all("storylines").filter((s) => (s.factionIds || []).includes(factionId));
}

export function itemsOwnedBy(characterId) {
    return store.all("items").filter((i) => i.ownerId === characterId);
}

export function charactersInFaction(factionId) {
    return store.all("characters").filter((c) => c.factionId === factionId);
}

export function factionOf(character) {
    return character?.factionId ? store.get("factions", character.factionId) : null;
}

export function locationOf(record) {
    return record?.locationId ? store.get("locations", record.locationId) : null;
}

export function secretsKnownBy(characterId) {
    return store.all("secrets").filter((s) => (s.holderIds || []).includes(characterId));
}

export function secretsSuspectedBy(characterId) {
    return store.all("secrets").filter((s) => (s.suspectIds || []).includes(characterId));
}

export function secretsUnknownTo(characterId) {
    return store.all("secrets").filter((s) => (s.unawareIds || []).includes(characterId));
}

export function mysteriesInvolving(characterId) {
    return store.all("mysteries").filter((m) => (m.characterIds || []).includes(characterId));
}

export function consequencesFor(type, key) {
    const out = [];
    for (const ev of store.all("events", { includeArchived: true })) {
        for (const c of ev.consequenceLinks || []) {
            if (c.targetType === type && c.targetId === key) out.push({ event: ev, consequence: c });
        }
    }
    return out;
}

export function relativeTimeEvents(characterId, limit = 5) {
    return eventsFor(characterId).slice(-limit).reverse();
}

/* -------------------------------------------------------------------------
   Graph construction
   ------------------------------------------------------------------------- */
export function buildGraph({ types = null, focus = null, includeSecret = true } = {}) {
    const allowed = new Set(types || ["characters", "events", "factions", "locations", "mysteries", "storylines", "items"]);
    const nodes = [];
    const push = (type, row) => {
        if (!row || !allowed.has(type)) return;
        nodes.push({ id: `${type}:${row.key}`, type, key: row.key, record: row });
    };
    if (allowed.has("characters")) store.all("characters").forEach((r) => push("characters", r));
    if (allowed.has("events")) store.all("events").forEach((r) => push("events", r));
    if (allowed.has("factions")) store.all("factions").forEach((r) => push("factions", r));
    if (allowed.has("locations")) store.all("locations").forEach((r) => push("locations", r));
    if (allowed.has("mysteries")) store.all("mysteries").forEach((r) => push("mysteries", r));
    if (allowed.has("storylines")) store.all("storylines").forEach((r) => push("storylines", r));
    if (allowed.has("items")) store.all("items").forEach((r) => push("items", r));

    const ids = new Set(nodes.map((n) => n.id));
    const edges = [];
    const seen = new Set();
    const addEdge = (edge) => {
        if (!ids.has(`${edge.fromType}:${edge.fromKey}`) || !ids.has(`${edge.toType}:${edge.toKey}`)) return;
        const sig = [edge.fromType, edge.fromKey, edge.toType, edge.toKey, edge.kind, edge.label].join("|");
        if (seen.has(sig)) return;
        seen.add(sig);
        edges.push({
            ...edge,
            id: edge.id || `e_${edges.length}`,
            from: `${edge.fromType}:${edge.fromKey}`,
            to: `${edge.toType}:${edge.toKey}`,
        });
    };

    // Character ↔ character relationships
    if (allowed.has("characters")) {
        for (const rel of store.all("relationships")) {
            if (rel.secret && !includeSecret) continue;
            const t = relType(rel.type);
            addEdge({
                id: `rel:${rel.key}`,
                fromType: "characters",
                fromKey: rel.aId,
                toType: "characters",
                toKey: rel.bId,
                kind: t.kind,
                label: t.label,
                date: rel.startDate,
                source: "relationship",
                recordKey: rel.key,
                status: rel.status,
                dashed: rel.status === "ended" || rel.status === "broken" || rel.canon === "planned",
            });
        }
    }

    // Events
    for (const ev of store.all("events")) {
        if (!allowed.has("events")) break;
        for (const cid of ev.characterIds || []) {
            addEdge({ fromType: "events", fromKey: ev.key, toType: "characters", toKey: cid, kind: "historic", label: "involved", date: ev.date, source: "field", field: "characterIds", ownerType: "events", ownerKey: ev.key });
        }
        for (const fid of ev.factionIds || []) {
            addEdge({ fromType: "events", fromKey: ev.key, toType: "factions", toKey: fid, kind: "historic", label: "involved", date: ev.date, source: "field", field: "factionIds", ownerType: "events", ownerKey: ev.key });
        }
        if (ev.locationId) {
            addEdge({ fromType: "events", fromKey: ev.key, toType: "locations", toKey: ev.locationId, kind: "historic", label: "occurred at", date: ev.date, source: "field", field: "locationId", ownerType: "events", ownerKey: ev.key });
        }
        for (const sid of ev.storylineIds || []) {
            addEdge({ fromType: "events", fromKey: ev.key, toType: "storylines", toKey: sid, kind: "historic", label: "part of", date: ev.date, source: "field", field: "storylineIds", ownerType: "events", ownerKey: ev.key });
        }
        for (const rid of ev.relatedEventIds || []) {
            addEdge({ fromType: "events", fromKey: ev.key, toType: "events", toKey: rid, kind: "historic", label: "related to", date: ev.date, source: "field", field: "relatedEventIds", ownerType: "events", ownerKey: ev.key });
        }
    }

    // Factions
    for (const f of store.all("factions")) {
        if (!allowed.has("factions")) break;
        if (f.leaderId) {
            addEdge({ fromType: "characters", fromKey: f.leaderId, toType: "factions", toKey: f.key, kind: "ally", label: "leads", source: "field", field: "leaderId", ownerType: "factions", ownerKey: f.key });
        }
        for (const mid of f.memberIds || []) {
            addEdge({ fromType: "characters", fromKey: mid, toType: "factions", toKey: f.key, kind: "ally", label: "member", source: "field", field: "memberIds", ownerType: "factions", ownerKey: f.key });
        }
        for (const past of f.membershipHistory || []) {
            if (past.characterId) {
                addEdge({ fromType: "characters", fromKey: past.characterId, toType: "factions", toKey: f.key, kind: "historic", label: `former ${past.role || "member"}`, date: past.to, dashed: true, source: "field", field: "memberIds", ownerType: "factions", ownerKey: f.key });
            }
        }
        for (const lid of f.locationIds || []) {
            addEdge({ fromType: "factions", fromKey: f.key, toType: "locations", toKey: lid, kind: "ally", label: "controls", source: "field", field: "locationIds", ownerType: "factions", ownerKey: f.key });
        }
        for (const aid of f.allyIds || []) {
            addEdge({ fromType: "factions", fromKey: f.key, toType: "factions", toKey: aid, kind: "ally", label: "allied", source: "field", field: "allyIds", ownerType: "factions", ownerKey: f.key });
        }
        for (const eid of f.enemyIds || []) {
            addEdge({ fromType: "factions", fromKey: f.key, toType: "factions", toKey: eid, kind: "enemy", label: "at war", source: "field", field: "enemyIds", ownerType: "factions", ownerKey: f.key });
        }
        if (f.locationIds?.length === 0 && f.territory) {
            /* territory is prose */
        }
    }

    // Storylines
    for (const s of store.all("storylines")) {
        if (!allowed.has("storylines")) break;
        for (const cid of s.characterIds || []) {
            addEdge({ fromType: "storylines", fromKey: s.key, toType: "characters", toKey: cid, kind: "secret", label: "arc", source: "field", field: "characterIds", ownerType: "storylines", ownerKey: s.key });
        }
        for (const fid of s.factionIds || []) {
            addEdge({ fromType: "storylines", fromKey: s.key, toType: "factions", toKey: fid, kind: "secret", label: "arc", source: "field", field: "factionIds", ownerType: "storylines", ownerKey: s.key });
        }
        for (const lid of s.locationIds || []) {
            addEdge({ fromType: "storylines", fromKey: s.key, toType: "locations", toKey: lid, kind: "secret", label: "setting", source: "field", field: "locationIds", ownerType: "storylines", ownerKey: s.key });
        }
        for (const mid of s.mysteryIds || []) {
            addEdge({ fromType: "storylines", fromKey: s.key, toType: "mysteries", toKey: mid, kind: "secret", label: "raises", source: "field", field: "mysteryIds", ownerType: "storylines", ownerKey: s.key });
        }
        if (s.parentId) {
            addEdge({ fromType: "storylines", fromKey: s.key, toType: "storylines", toKey: s.parentId, kind: "secret", label: "subplot of", source: "field", field: "parentId", ownerType: "storylines", ownerKey: s.key });
        }
    }

    // Mysteries
    for (const m of store.all("mysteries")) {
        if (!allowed.has("mysteries")) break;
        for (const cid of m.characterIds || []) {
            addEdge({ fromType: "mysteries", fromKey: m.key, toType: "characters", toKey: cid, kind: "secret", label: "involves", source: "field", field: "characterIds", ownerType: "mysteries", ownerKey: m.key });
        }
        for (const eid of m.eventIds || []) {
            addEdge({ fromType: "mysteries", fromKey: m.key, toType: "events", toKey: eid, kind: "secret", label: "clue", source: "field", field: "eventIds", ownerType: "mysteries", ownerKey: m.key });
        }
        for (const lid of m.locationIds || []) {
            addEdge({ fromType: "mysteries", fromKey: m.key, toType: "locations", toKey: lid, kind: "secret", label: "site", source: "field", field: "locationIds", ownerType: "mysteries", ownerKey: m.key });
        }
    }

    // Items
    for (const it of store.all("items")) {
        if (!allowed.has("items")) break;
        if (it.ownerId) {
            addEdge({ fromType: "characters", fromKey: it.ownerId, toType: "items", toKey: it.key, kind: "family", label: "owns", source: "field", field: "ownerId", ownerType: "items", ownerKey: it.key });
        }
        if (it.locationId) {
            addEdge({ fromType: "items", fromKey: it.key, toType: "locations", toKey: it.locationId, kind: "historic", label: "kept at", source: "field", field: "locationId", ownerType: "items", ownerKey: it.key });
        }
        for (const eid of it.eventIds || []) {
            addEdge({ fromType: "items", fromKey: it.key, toType: "events", toKey: eid, kind: "historic", label: "history", source: "field", field: "eventIds", ownerType: "items", ownerKey: it.key });
        }
    }

    // Locations
    for (const l of store.all("locations")) {
        if (!allowed.has("locations")) break;
        if (l.controllerFactionId) {
            addEdge({ fromType: "locations", fromKey: l.key, toType: "factions", toKey: l.controllerFactionId, kind: "ally", label: "held by", source: "field", field: "controllerFactionId", ownerType: "locations", ownerKey: l.key });
        }
        if (l.ownerId) {
            addEdge({ fromType: "locations", fromKey: l.key, toType: "characters", toKey: l.ownerId, kind: "family", label: "owned by", source: "field", field: "ownerId", ownerType: "locations", ownerKey: l.key });
        }
        for (const cid of l.characterIds || []) {
            addEdge({ fromType: "locations", fromKey: l.key, toType: "characters", toKey: cid, kind: "historic", label: "associated", source: "field", field: "characterIds", ownerType: "locations", ownerKey: l.key });
        }
        for (const fid of l.factionIds || []) {
            addEdge({ fromType: "locations", fromKey: l.key, toType: "factions", toKey: fid, kind: "historic", label: "associated", source: "field", field: "factionIds", ownerType: "locations", ownerKey: l.key });
        }
    }

    // Custom connections
    for (const link of store.all("links")) {
        addEdge({
            id: `link:${link.key}`,
            fromType: link.fromType,
            fromKey: link.fromId,
            toType: link.toType,
            toKey: link.toId,
            kind: link.kind || "historic",
            label: link.label,
            date: link.date,
            source: "custom",
            recordKey: link.key,
        });
    }

    let resultNodes = nodes;
    if (focus) {
        const focusId = `${focus.type}:${focus.key}`;
        const neighbors = new Set([focusId]);
        for (const e of edges) {
            if (`${e.fromType}:${e.fromKey}` === focusId) neighbors.add(`${e.toType}:${e.toKey}`);
            if (`${e.toType}:${e.toKey}` === focusId) neighbors.add(`${e.fromType}:${e.fromKey}`);
        }
        resultNodes = nodes.filter((n) => neighbors.has(n.id));
    }
    const resultIds = new Set(resultNodes.map((n) => n.id));
    const resultEdges = edges.filter((e) => resultIds.has(`${e.fromType}:${e.fromKey}`) && resultIds.has(`${e.toType}:${e.toKey}`));
    return { nodes: resultNodes, edges: resultEdges };
}

export function relatedEntities(type, key) {
    const out = [];
    const add = (t, id, label, extra = {}) => {
        if (!id) return;
        const record = store.get(t, id);
        if (!record) return;
        out.push({ type: t, key: id, label: store.nameOf(t, id), kind: label, ...extra });
    };
    if (type === "characters") {
        const c = store.get("characters", key);
        if (!c) return out;
        add("factions", c.factionId, "member of");
        add("locations", c.locationId, "located at");
        for (const rel of relationshipsOf(key)) {
            const t = relType(rel.type);
            add("characters", rel.aId === key ? rel.bId : rel.aId, t.label.toLowerCase(), { relationshipKey: rel.key });
        }
        for (const ev of eventsFor(key)) add("events", ev.key, "participated in");
        for (const s of storylinesForCharacter(key)) add("storylines", s.key, "arc");
        for (const it of itemsOwnedBy(key)) add("items", it.key, "owns");
        for (const m of mysteriesInvolving(key)) add("mysteries", m.key, "involved in");
        for (const s of secretsKnownBy(key)) add("secrets", s.key, "knows");
        for (const s of secretsSuspectedBy(key)) add("secrets", s.key, "suspects");
    } else if (type === "events") {
        const ev = store.get("events", key);
        for (const id of ev.characterIds || []) add("characters", id, "involved");
        for (const id of ev.factionIds || []) add("factions", id, "involved");
        for (const id of ev.storylineIds || []) add("storylines", id, "part of");
        for (const id of ev.relatedEventIds || []) add("events", id, "related");
        add("locations", ev.locationId, "occurred at");
        for (const c of ev.consequenceLinks || []) add(c.targetType, c.targetId, "affected");
    } else if (type === "factions") {
        const f = store.get("factions", key);
        add("characters", f.leaderId, "led by");
        for (const id of f.memberIds || []) add("characters", id, "member");
        for (const id of f.locationIds || []) add("locations", id, "controls");
        for (const id of f.allyIds || []) add("factions", id, "allied");
        for (const id of f.enemyIds || []) add("factions", id, "at war");
        for (const ev of eventsForFaction(key)) add("events", ev.key, "event");
        for (const s of storylinesForFaction(key)) add("storylines", s.key, "arc");
    } else if (type === "storylines") {
        const s = store.get("storylines", key);
        for (const id of s.characterIds || []) add("characters", id, "cast");
        for (const id of s.factionIds || []) add("factions", id, "cast");
        for (const id of s.locationIds || []) add("locations", id, "setting");
        for (const id of s.mysteryIds || []) add("mysteries", id, "raises");
        for (const id of store.all("storylines").filter((x) => x.parentId === key).map((x) => x.key)) add("storylines", id, "subplot");
        add("storylines", s.parentId, "parent arc");
        for (const ev of eventsForStoryline(key)) add("events", ev.key, "event");
    } else if (type === "locations") {
        add("characters", store.get("locations", key)?.ownerId, "owned by");
        add("factions", store.get("locations", key)?.controllerFactionId, "controlled by");
        for (const id of store.get("locations", key)?.characterIds || []) add("characters", id, "associated");
        for (const id of store.get("locations", key)?.factionIds || []) add("factions", id, "associated");
        for (const ev of eventsAtLocation(key)) add("events", ev.key, "event");
        for (const f of store.all("factions")) if ((f.locationIds || []).includes(key)) add("factions", f.key, "controls");
        for (const m of store.all("mysteries")) if ((m.locationIds || []).includes(key)) add("mysteries", m.key, "mystery site");
    } else if (type === "items") {
        const it = store.get("items", key);
        add("characters", it.ownerId, "owned by");
        add("locations", it.locationId, "kept at");
        for (const id of it.previousOwners || []) add("characters", id.characterId, "former owner");
        for (const id of it.eventIds || []) add("events", id, "history");
    } else if (type === "mysteries") {
        const m = store.get("mysteries", key);
        for (const id of m.characterIds || []) add("characters", id, "involved");
        for (const id of m.eventIds || []) add("events", id, "clue");
        for (const id of m.locationIds || []) add("locations", id, "site");
        for (const s of store.all("storylines")) if ((s.mysteryIds || []).includes(key)) add("storylines", s.key, "woven into");
    } else if (type === "secrets") {
        const s = store.get("secrets", key);
        for (const id of s.holderIds || []) add("characters", id, "knows the truth");
        for (const id of s.suspectIds || []) add("characters", id, "suspects");
        for (const id of s.unawareIds || []) add("characters", id, "unaware");
        for (const id of s.relatedEventIds || []) add("events", id, "related");
        for (const id of s.relatedMysteryIds || []) add("mysteries", id, "related");
    }
    const seen = new Set();
    return out.filter((r) => {
        const sig = `${r.type}:${r.key}:${r.kind}`;
        if (seen.has(sig)) return false;
        seen.add(sig);
        return true;
    });
}

/* -------------------------------------------------------------------------
   Stats
   ------------------------------------------------------------------------- */
const sortByDate = (a, b) => (a.date || "").localeCompare(b.date || "");

export function computeStats() {
    const characters = store.all("characters");
    const events = store.all("events");
    const factions = store.all("factions");
    const storylines = store.all("storylines");
    const locations = store.all("locations");
    const items = store.all("items");
    const mysteries = store.all("mysteries");
    const secrets = store.all("secrets");
    const relationships = store.all("relationships");

    const relCountByChar = new Map();
    const enemyByChar = new Map();
    const allyByChar = new Map();
    const sharedEvents = new Map();

    for (const rel of relationships) {
        const t = relType(rel.type);
        for (const id of [rel.aId, rel.bId]) {
            relCountByChar.set(id, (relCountByChar.get(id) || 0) + 1);
            if (["enemy", "betrayal", "rivalry", "distrust"].includes(rel.type)) enemyByChar.set(id, (enemyByChar.get(id) || 0) + 1);
            if (["friendship", "alliance", "romance", "family", "mentor", "business", "unrequited", "debt"].includes(rel.type)) allyByChar.set(id, (allyByChar.get(id) || 0) + 1);
        }
    }
    for (const ev of events) {
        for (const id of ev.characterIds || []) sharedEvents.set(id, (sharedEvents.get(id) || 0) + 1);
    }

    const mostInvolved = characters
        .map((c) => ({
            ...c,
            eventCount: sharedEvents.get(c.key) || 0,
            relCount: relCountByChar.get(c.key) || 0,
            enemyCount: enemyByChar.get(c.key) || 0,
            allyCount: allyByChar.get(c.key) || 0,
            milestoneCount: (c.journey || []).length,
            score: (sharedEvents.get(c.key) || 0) * 2 + (relCountByChar.get(c.key) || 0),
        }))
        .sort((a, b) => b.score - a.score);

    const factionStats = factions
        .map((f) => ({
            ...f,
            memberCount: (f.memberIds || []).length + (f.leaderId ? 1 : 0),
            eventCount: events.filter((e) => (e.factionIds || []).includes(f.key)).length,
            locationCount: locations.filter((l) => l.controllerFactionId === f.key).length,
            storylineCount: storylines.filter((s) => (s.factionIds || []).includes(f.key)).length,
            score: (f.memberIds || []).length * 2 + events.filter((e) => (e.factionIds || []).includes(f.key)).length * 2 + locations.filter((l) => l.controllerFactionId === f.key).length,
        }))
        .sort((a, b) => b.score - a.score);

    const locationStats = locations
        .map((l) => ({ ...l, eventCount: events.filter((e) => e.locationId === l.key).length }))
        .sort((a, b) => b.eventCount - a.eventCount);

    const storylineStats = storylines
        .map((s) => ({ ...s, eventCount: events.filter((e) => (e.storylineIds || []).includes(s.key)).length }))
        .sort((a, b) => b.eventCount - a.eventCount);

    const sortedEvents = [...events].sort(
        (a, b) => (b.importance || 0) - (a.importance || 0) || (b.consequenceLinks || []).length - (a.consequenceLinks || []).length,
    );

    const byStatus = groupBy(characters, (c) => c.status || "unknown");
    const byCategory = groupBy(events, (e) => e.category || "development");

    const timeline = [...events].sort(sortByDate);
    const months = new Map();
    for (const ev of timeline) {
        const d = parseDate(ev.date);
        if (!d) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        months.set(key, (months.get(key) || 0) + 1);
    }

    const canonMix = groupBy([...characters, ...events, ...factions, ...storylines], (r) => r.canon || "confirmed");

    return {
        counts: {
            characters: characters.length,
            events: events.length,
            factions: factions.length,
            storylines: storylines.length,
            activeStorylines: storylines.filter((s) => s.status === "active").length,
            upcomingStorylines: storylines.filter((s) => ["upcoming", "planned"].includes(s.status)).length,
            locations: locations.length,
            items: items.length,
            mysteries: mysteries.length,
            unresolvedMysteries: mysteries.filter((m) => !["solved", "abandoned"].includes(m.status)).length,
            secrets: secrets.length,
            hiddenSecrets: secrets.filter((s) => s.status === "hidden").length,
            relationships: relationships.length,
            activeFactions: factions.filter((f) => ["active", "rising", "declining"].includes(f.status)).length,
            conflicts: relationships.filter((r) => ["enemy", "rivalry", "distrust", "betrayal"].includes(r.type) && r.status === "active").length,
            upcomingEvents: events.filter((e) => e.canon === "planned").length,
        },
        mostInvolved,
        factionStats,
        locationStats,
        storylineStats,
        sortedEvents,
        byStatus,
        byCategory,
        months: [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])),
        canonMix,
        oldest: timeline[0] || null,
        newest: timeline[timeline.length - 1] || null,
        totalConsequences: events.reduce((sum, e) => sum + (e.consequenceLinks || []).length, 0),
    };
}

export function dashboardSnapshot() {
    const stats = computeStats();
    const currentStorylines = store
        .all("storylines")
        .filter((s) => ["active", "upcoming"].includes(s.status))
        .sort((a, b) => (b.importance || 0) - (a.importance || 0));
    const liveConflicts = store
        .all("relationships")
        .filter((r) => ["enemy", "rivalry", "betrayal", "distrust"].includes(r.type) && r.status !== "ended" && r.status !== "broken")
        .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
    const openMysteries = store
        .all("mysteries")
        .filter((m) => !["solved", "abandoned"].includes(m.status))
        .sort((a, b) => (b.importance || 0) - (a.importance || 0));
    const recentEvents = [...store.all("events")]
        .filter((e) => e.canon !== "planned")
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .slice(0, 6);
    const upcoming = [...store.all("events")]
        .filter((e) => e.canon === "planned")
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .slice(0, 5);
    const featuredChars = stats.mostInvolved.filter((c) => c.status === "alive").slice(0, 6);
    const latestActivity = [...(state.data.activity || [])].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 12);
    const developing = store
        .all("relationships")
        .filter((r) => ["strained", "secret", "planned"].includes(r.status) || r.secret)
        .slice(0, 4);
    return { stats, currentStorylines, liveConflicts, openMysteries, recentEvents, upcoming, featuredChars, latestActivity, developing };
}

/* -------------------------------------------------------------------------
   Search
   ------------------------------------------------------------------------- */
const SEARCH_FIELDS = {
    characters: ["name", "username", "tagline", "description", "nicknames", "occupation", "personality.overview", "backstory.origin"],
    events: ["title", "summary", "description", "cause", "outcome", "consequences"],
    factions: ["name", "tagline", "description", "ideology", "objectives", "territory"],
    storylines: ["name", "subtitle", "premise", "mainConflict", "currentSituation", "theme"],
    locations: ["name", "region", "description", "historicalImportance", "coords"],
    items: ["name", "description", "origin", "significance"],
    mysteries: ["title", "description", "origin", "clues", "theories", "questions", "revealPlan"],
    secrets: ["title", "description", "truth", "revealImpact", "evidence"],
    relationships: ["description", "met", "history"],
};

function pluck(obj, path) {
    return path.split(".").reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

function textOf(value) {
    if (Array.isArray(value)) return value.join(" ");
    if (value && typeof value === "object") return Object.values(value).map(textOf).join(" ");
    return String(value || "");
}

export function searchAll(query, filters = {}) {
    const q = String(query || "").trim().toLowerCase();
    const { types, characterId, factionId, storylineId, canon, importance, status, dateFrom, dateTo } = filters;
    const results = [];
    if (!q && !characterId && !factionId && !storylineId) return results;

    const passesCommon = (type, row) => {
        if (types && types.length && !types.includes(type)) return false;
        if (canon && row.canon && row.canon !== canon) return false;
        if (importance && Number(row.importance || 0) < Number(importance)) return false;
        if (status) {
            const s = row.status || row.category || "";
            if (s !== status) return false;
        }
        if (dateFrom && (row.date || row.createdAt || "") < dateFrom) return false;
        if (dateTo && (row.date || row.createdAt || "") > dateTo) return false;
        if (characterId) {
            const related =
                (row.characterIds || []).includes(characterId) ||
                row.aId === characterId ||
                row.bId === characterId ||
                row.ownerId === characterId ||
                row.leaderId === characterId ||
                (row.holderIds || []).includes(characterId) ||
                (row.suspectIds || []).includes(characterId) ||
                (row.memberIds || []).includes(characterId);
            if (!related) return false;
        }
        if (factionId) {
            const related =
                row.factionId === factionId ||
                (row.factionIds || []).includes(factionId) ||
                row.leaderId === factionId ||
                row.controllerFactionId === factionId ||
                (row.allyIds || []).includes(factionId) ||
                (row.enemyIds || []).includes(factionId) ||
                row.key === factionId;
            if (!related) return false;
        }
        if (storylineId) {
            const related =
                row.key === storylineId ||
                (row.storylineIds || []).includes(storylineId) ||
                row.parentId === storylineId;
            if (!related) return false;
        }
        return true;
    };

    for (const [type, fields] of Object.entries(SEARCH_FIELDS)) {
        for (const row of store.all(type, { includeArchived: false })) {
            if (!passesCommon(type, row)) continue;
            const title = row.name || row.title || "Untitled";
            let score = 0;
            let matchedFields = [];
            if (q) {
                if (title.toLowerCase().includes(q)) score += title.toLowerCase().startsWith(q) ? 12 : 8;
                for (const f of fields) {
                    const text = textOf(pluck(row, f)).toLowerCase();
                    if (text.includes(q)) {
                        score += 2;
                        matchedFields.push(f);
                    }
                }
                if (!score) continue;
            } else {
                score = 1;
            }
            const subtitle =
                type === "characters"
                    ? [row.username, store.nameOf("factions", row.factionId)].filter(Boolean).join(" · ")
                    : type === "events"
                      ? `${row.date || "Undated"} · ${(EVENT_CATEGORIES.find((c) => c.value === row.category) || {}).label || "Event"}`
                      : type === "relationships"
                        ? `${store.label("characters", row.aId)} ↔ ${store.label("characters", row.bId)}`
                        : type === "factions"
                          ? `${(row.memberIds || []).length} members`
                          : type === "storylines"
                            ? `${(row.characterIds || []).length} characters · ${row.status || ""}`
                            : row.description || row.premise || "";
            results.push({ type, row, title, subtitle, score, matchedFields });
        }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 80);
}

/* -------------------------------------------------------------------------
   Storyline progression
   ------------------------------------------------------------------------- */
export function storylinePhaseData(storylineKey) {
    const events = eventsForStoryline(storylineKey);
    const buckets = PHASES.map((p) => ({
        ...p,
        events: events.filter((e) => (e.phase || "") === p.value),
        unassigned: false,
    }));
    const unassigned = events.filter((e) => !PHASES.some((p) => p.value === e.phase));
    if (unassigned.length) {
        const idx = PHASES.findIndex((p) => p.value === (store.get("storylines", storylineKey)?.phase || "introduction"));
        const target = buckets[Math.max(0, idx)];
        if (target) target.events.push(...unassigned);
    }
    return buckets.map((b) => ({ ...b, events: [...b.events].sort(sortByDate) }));
}

export function storylineProgress(storyline) {
    const events = eventsForStoryline(storyline.key);
    if (!events.length) return 0;
    const phaseIndex = Math.max(0, PHASES.findIndex((p) => p.value === storyline.phase));
    const withPhase = events.filter((e) => PHASES.some((p) => p.value === e.phase));
    if (!withPhase.length) return Math.round(((phaseIndex + 0.5) / PHASES.length) * 100);
    const sum = withPhase.reduce((acc, e) => acc + PHASES.findIndex((p) => p.value === e.phase) + 1, 0);
    return Math.round((sum / (withPhase.length * PHASES.length)) * 100);
}

export function canonLabel(value) {
    return CANON_LABEL[value] || "Confirmed canon";
}

export function typeLabel(type, plural = true) {
    const t = TYPES[type];
    if (!t) return type;
    return plural ? t.label : t.singular;
}

export function importanceLabel(n) {
    return (IMPORTANCE.find((i) => Number(i.value) === Number(n)) || {}).label || "Minor";
}

export function characterInitialsList(ids) {
    return unique(ids || [])
        .map((id) => store.get("characters", id))
        .filter(Boolean);
}
