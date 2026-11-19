/* AllForOne Story Planner — story time.
 *
 * Only events (and seasons) are planned with calendar dates. Everything else —
 * when a character first appears, when a relationship starts, when lore is
 * discovered — is placed relative to the events instead: "Before Event 2",
 * "During Event 5", "After Event 7". Event numbers follow story order, so
 * inserting or moving an event re-flows everything placed against it.
 *
 * A story-time value is stored as { eventId, when } where `when` is one of
 * STORY_WHEN. Older records may still hold a plain date string; those are
 * shown as-is (marked as a legacy date) until someone picks an event.
 */

import { el, fmtDate, parseDate } from "./util.js";
import { docs, byId } from "./store.js";
import { detailPath } from "./router.js";

export const STORY_WHEN = ["Before", "During", "After"];

function eventDate(e) {
    return parseDate(e.actualDate || e.plannedDate || (e.month ? `${e.month}-01` : ""))?.getTime() ?? null;
}

function codeNum(e) {
    const m = /(\d+)\s*$/.exec(String(e.code || ""));
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/** Non-archived events in story order: dated events chronologically, then undated ones by event ID. */
export function storyEvents() {
    return docs("events")
        .filter((e) => !e.archived)
        .slice()
        .sort((a, b) => {
            const da = eventDate(a);
            const db = eventDate(b);
            if (da !== null && db !== null && da !== db) return da - db;
            if (da === null && db !== null) return 1;
            if (da !== null && db === null) return -1;
            const ca = codeNum(a);
            const cb = codeNum(b);
            if (ca !== cb) return ca - cb;
            return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
        });
}

/** 1-based position of an event in story order, or null. */
export function eventNumber(id) {
    const idx = storyEvents().findIndex((e) => String(e.id) === String(id));
    return idx === -1 ? null : idx + 1;
}

export function eventLabel(e, n = eventNumber(e?.id)) {
    if (!e) return "(deleted event)";
    const num = n ? `Event ${n}` : "Event";
    return `${num} — ${e.title || "Untitled event"}${e.kind === "Main Event" ? " ★" : ""}`;
}

export function isStoryTime(v) {
    return Boolean(v && typeof v === "object" && v.eventId);
}

/** Human-readable text for a story-time value (or a legacy date string). */
export function storyTimeText(v) {
    if (!v) return "";
    if (isStoryTime(v)) {
        const e = byId("events", v.eventId);
        return `${v.when || "During"} ${eventLabel(e)}`;
    }
    if (typeof v === "string") return fmtDate(v) || v;
    return "";
}

/** Sortable position in story order. Unplaced values sort last. */
export function storyTimeRank(v) {
    const offset = { Before: 0, During: 1, After: 2 };
    const list = storyEvents();
    if (isStoryTime(v)) {
        const idx = list.findIndex((e) => String(e.id) === String(v.eventId));
        if (idx === -1) return Number.MAX_SAFE_INTEGER - 1;
        return idx * 3 + (offset[v.when] ?? 1);
    }
    if (typeof v === "string" && parseDate(v)) {
        // Legacy date: slot it just before the first event dated on/after it.
        const t = parseDate(v).getTime();
        const idx = list.findIndex((e) => (eventDate(e) ?? Infinity) >= t);
        return (idx === -1 ? list.length : idx) * 3 - 0.5;
    }
    return Number.MAX_SAFE_INTEGER;
}

/** Rank for an event itself (sits at "During"). */
export function eventRank(e) {
    return storyTimeRank({ eventId: e.id, when: "During" });
}

/** Display node: "During" + linked event, or a legacy date. */
export function storyTimeNode(v) {
    if (isStoryTime(v)) {
        const e = byId("events", v.eventId);
        return el("span", {}, [
            el("span", { text: `${v.when || "During"} ` }),
            e ? el("a", { href: detailPath("events", e.id), text: eventLabel(e) }) : el("span", { class: "empty-val", text: "(deleted event)" }),
        ]);
    }
    if (typeof v === "string" && v) {
        return el("span", { title: "Old calendar date — pick an event to place this in story time" }, [
            el("span", { text: fmtDate(v) || v }),
            el("span", { class: "field-hint", text: " (old date)" }),
        ]);
    }
    return null;
}

/** Editor: [Before|During|After] [Event N — title]. Calls onChange with a value or "". */
export function storyTimeInput(value, onChange, { compact = false } = {}) {
    const current = isStoryTime(value) ? value : null;
    const wrap = el("div", { class: "row nowrap", style: { gap: "0.3rem", flex: compact ? "1 1 220px" : "1 1 auto" } });

    const whenSelect = el(
        "select",
        { "aria-label": "Before, during or after", style: { flex: "0 0 auto", width: "auto" } },
        STORY_WHEN.map((w) => el("option", { value: w, selected: (current?.when || "During") === w, text: w }))
    );
    const events = storyEvents();
    const eventSelect = el("select", { "aria-label": "Event", style: { flex: "1 1 160px", minWidth: "0" } }, [
        el("option", { value: "", text: "— Not placed —" }),
        ...events.map((e, i) => el("option", { value: e.id, selected: String(current?.eventId) === String(e.id), text: eventLabel(e, i + 1) })),
    ]);
    if (current && !events.some((e) => String(e.id) === String(current.eventId))) {
        const e = byId("events", current.eventId);
        eventSelect.appendChild(el("option", { value: current.eventId, selected: true, text: e ? `${e.title} (archived)` : "(deleted event)" }));
    }

    const commit = () => {
        onChange(eventSelect.value ? { eventId: eventSelect.value, when: whenSelect.value } : "");
    };
    whenSelect.addEventListener("change", commit);
    eventSelect.addEventListener("change", commit);
    wrap.append(whenSelect, eventSelect);

    if (!current && typeof value === "string" && value) {
        const outer = el("div", { style: { display: "flex", flexDirection: "column", gap: "0.2rem", flex: wrap.style.flex } }, [
            wrap,
            el("span", { class: "field-hint", text: `Was dated ${fmtDate(value) || value}. Pick an event to switch to story time.` }),
        ]);
        return outer;
    }
    if (!events.length) {
        const outer = el("div", { style: { display: "flex", flexDirection: "column", gap: "0.2rem" } }, [
            wrap,
            el("span", { class: "field-hint", text: "Create events first — story time is measured in events." }),
        ]);
        return outer;
    }
    return wrap;
}

