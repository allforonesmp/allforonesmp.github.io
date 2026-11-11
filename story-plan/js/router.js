/* AllForOne Story Planner — hash router (works on GitHub Pages, no rewrites). */

import { ENTITIES } from "./schema.js";

export const ROUTES = {
    dashboard: { label: "Dashboard", path: "/dashboard" },
    storyline: { label: "Storyline", path: "/storyline" },
    timeline: { label: "Timeline", path: "/timeline" },
    events: { label: "Events", path: "/events" },
    characters: { label: "Characters", path: "/characters" },
    relationships: { label: "Relationships", path: "/relationships" },
    lore: { label: "Lore Database", path: "/lore" },
    locations: { label: "Locations", path: "/locations" },
    factions: { label: "Factions", path: "/factions" },
    arcs: { label: "Chapters & Arcs", path: "/arcs" },
    diagrams: { label: "Story Diagrams", path: "/diagrams" },
    storyboards: { label: "Storyboards", path: "/storyboards" },
    notes: { label: "Notes & Ideas", path: "/notes" },
    insights: { label: "Story Insights", path: "/insights" },
    archive: { label: "Archive", path: "/archive" },
    settings: { label: "Settings", path: "/settings" },
};

/* collection -> singular detail route segment */
const DETAIL_SEGMENT = {
    seasons: "season",
    chapters: "chapter",
    story_arcs: "arc",
    story_threads: "thread",
    events: "event",
    characters: "character",
    lore: "lore",
    factions: "faction",
    locations: "location",
    storyboards: "storyboard",
    notes: "note",
};

const SEGMENT_COLLECTION = Object.fromEntries(Object.entries(DETAIL_SEGMENT).map(([c, s]) => [s, c]));

export function detailPath(collection, id) {
    const seg = DETAIL_SEGMENT[collection];
    if (!seg || !id) return "#/dashboard";
    return `#/${seg}/${encodeURIComponent(id)}`;
}

export function listPath(collection) {
    const map = {
        events: "events",
        characters: "characters",
        lore: "lore",
        factions: "factions",
        locations: "locations",
        story_arcs: "arcs",
        story_threads: "storyline",
        seasons: "storyline",
        chapters: "arcs",
        notes: "notes",
        storyboards: "storyboards",
        character_relationships: "relationships",
        faction_relationships: "factions",
    };
    return `#/${map[collection] || "dashboard"}`;
}

let current = { name: "dashboard", id: "", params: new URLSearchParams() };
let handler = null;
let suppress = false;

export function currentRoute() {
    return current;
}

export function parseHash() {
    const raw = (location.hash || "#/dashboard").replace(/^#\/?/, "");
    const [pathPart, queryPart] = raw.split("?");
    const parts = pathPart.split("/").filter(Boolean).map(decodeURIComponent);
    const params = new URLSearchParams(queryPart || "");

    if (!parts.length) return { name: "dashboard", id: "", params };

    const [first, second] = parts;
    if (SEGMENT_COLLECTION[first] && second) {
        return { name: `${first}:detail`, id: second, collection: SEGMENT_COLLECTION[first], params };
    }
    if (ROUTES[first]) return { name: first, id: second || "", params };
    return { name: "dashboard", id: "", params };
}

export function navigate(path, { replace = false } = {}) {
    const target = path.startsWith("#") ? path : `#${path.startsWith("/") ? "" : "/"}${path}`;
    if (replace) {
        history.replaceState(null, "", target);
        current = parseHash();
        if (handler) handler(current);
    } else if (location.hash === target) {
        current = parseHash();
        if (handler) handler(current);
    } else {
        location.hash = target;
    }
}

export function go(collection, id) {
    navigate(detailPath(collection, id));
}

export function start(renderFn) {
    handler = renderFn;
    const onHash = () => {
        if (suppress) return;
        current = parseHash();
        handler(current);
    };
    window.addEventListener("hashchange", onHash);
    current = parseHash();
    handler(current);
}

export function routeLabel(route) {
    if (route.collection && ENTITIES[route.collection]) {
        return ENTITIES[route.collection].plural;
    }
    const base = route.name.split(":")[0];
    return ROUTES[base]?.label || "Dashboard";
}
