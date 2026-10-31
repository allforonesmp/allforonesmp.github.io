/* Shared presentational building blocks */

import { store } from "../core/store.js";
import { icon } from "../core/icons.js";
import { esc, initials, mcHead, safeUrl, fmtDate, fmtDateShort, truncate, avatarHtml } from "../core/util.js";
import {
    IMPORTANCE,
    CANON,
    EVENT_CATEGORIES,
    EVENT_ICONS,
    STORYLINE_STATUS,
    MYSTERY_STATUS,
    SECRET_STATUS,
    RELATION_TYPES,
    PHASES,
    FACTION_STATUS,
    ITEM_STATUS,
    LOCATION_TYPES,
    CHARACTER_STATUS,
} from "../core/schema.js";

export const CATEGORY_COLORS = {
    introduction: "#7ea6ff",
    development: "#9fb4d8",
    political: "#d7b878",
    war: "#e05d52",
    betrayal: "#b295ff",
    discovery: "#5fd0c2",
    death: "#8d94a3",
    mystery: "#b295ff",
    alliance: "#4fbf82",
    election: "#7ea6ff",
    faction: "#e9a05a",
    personal: "#e78bb6",
    world: "#f0c674",
    construction: "#9aa3b2",
};

export const categoryMeta = (value) =>
    EVENT_CATEGORIES.find((c) => c.value === value) || { value: "development", label: "Event" };

export function categoryIcon(value) {
    return EVENT_ICONS[value] || "sparkles";
}

export function importanceBars(n, cls = "") {
    const v = Number(n) || 0;
    return `<span class="badge-imp ${cls}" title="Importance ${v}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? "on" : ""}"></i>`).join("")}</span>`;
}

export function canonBadge(value) {
    const v = value || "confirmed";
    const label = (CANON.find((c) => c.value === v) || { label: "Canon" }).label;
    return `<span class="canon ${esc(v)}" title="Canon status">${esc(label)}</span>`;
}

export function statusPill(value, labelOverride = null) {
    if (!value) return "";
    const label = labelOverride || String(value).replace(/_/g, " ");
    return `<span class="status ${esc(String(value).toLowerCase())}">${esc(label)}</span>`;
}

export function importanceLabel(n) {
    return (IMPORTANCE.find((i) => i.value === Number(n)) || {}).label || "Minor";
}

export function castChips(ids, { limit = 5, size = "sm", link = true } = {}) {
    const items = (ids || [])
        .map((id) => store.get("characters", id))
        .filter(Boolean);
    const shown = limit ? items.slice(0, limit) : items;
    const rest = items.length - shown.length;
    return `<span class="cast-chips">${shown
        .map((c) => {
            const inner = `${avatarHtml(c.name, { username: c.username, image: c.portraitUrl, size: "xs" })}<span>${esc(c.name)}</span>`;
            return link
                ? `<a class="cast-chip ${esc(c.status || "")}" href="#/characters/${c.key}" data-link>${inner}</a>`
                : `<span class="cast-chip">${inner}</span>`;
        })
        .join("")}${rest > 0 ? `<span class="cast-more">+${rest}</span>` : ""}</span>`;
}

export function refChips(type, ids, { limit = 4, iconName = null, empty = "" } = {}) {
    const rows = (ids || []).map((id) => store.get(type, id)).filter(Boolean);
    if (!rows.length) return empty;
    const shown = rows.slice(0, limit);
    const rest = rows.length - shown.length;
    return `<span class="chips">${shown
        .map(
            (r) =>
                `<a class="chip link" href="#/${routeFor(type)}/${esc(r.key)}" data-link>${iconName ? icon(iconName) : ""}${esc(r.name || r.title)}</a>`,
        )
        .join("")}${rest > 0 ? `<span class="chip">+${rest}</span>` : ""}</span>`;
}

export function routeFor(type) {
    return (
        {
            characters: "characters",
            events: "events",
            factions: "factions",
            storylines: "storylines",
            locations: "locations",
            items: "items",
            mysteries: "secrets",
            secrets: "secrets",
            relationships: "relationships",
        }[type] || type
    );
}

export function statTile({ label, value, sub = "", icon: ic = "info", href = "", accent = "gold", id = "" }) {
    const inner = `
        <div class="stat-tile-icon ${accent}">${icon(ic)}</div>
        <div class="stat-tile-body">
            <div class="stat-tile-value">${esc(value)}</div>
            <div class="stat-tile-label">${esc(label)}</div>
            ${sub ? `<div class="stat-tile-sub">${esc(sub)}</div>` : ""}
        </div>
        <span class="stat-tile-arrow">${icon("arrowRight")}</span>`;
    return href
        ? `<a class="stat-tile" href="#${href}" ${id ? `id="${id}"` : ""}>${inner}</a>`
        : `<div class="stat-tile" ${id ? `id="${id}"` : ""}>${inner}</div>`;
}

export function emptyState({ icon: ic = "archive", title = "Nothing here yet", text = "", action = "" }) {
    return `<div class="empty">
        <div class="eicon">${icon(ic)}</div>
        <h4>${esc(title)}</h4>
        ${text ? `<p>${esc(text)}</p>` : ""}
        ${action}
    </div>`;
}

export function panel({ title, icon: ic = null, sub = "", right = "", body = "", cls = "", id = "", bodyCls = "" }) {
    return `<section class="panel ${cls}" ${id ? `id="${id}"` : ""}>
        ${title ? `<div class="panel-head"><h3>${ic ? icon(ic) : ""}${esc(title)}</h3>${sub ? `<span class="sub">${esc(sub)}</span>` : ""}${right ? `<div class="right">${right}</div>` : ""}</div>` : ""}
        <div class="panel-body ${bodyCls}">${body}</div>
    </section>`;
}

export function characterCard(c, { stats = null } = {}) {
    const faction = c.factionId ? store.get("factions", c.factionId) : null;
    const relCount = store.all("relationships").filter((r) => r.aId === c.key || r.bId === c.key).length;
    const evCount = store.all("events").filter((e) => (e.characterIds || []).includes(c.key)).length;
    return `<a class="char-card hoverable ${esc(c.status || "")}" href="#/characters/${esc(c.key)}" data-link>
        <div class="char-card-media">
            ${avatarHtml(c.name, { username: c.username, image: c.portraitUrl, size: "xl" })}
            <div class="char-card-fade"></div>
            ${canonBadge(c.canon)}
        </div>
        <div class="char-card-body">
            <div class="char-card-name">${esc(c.name)}</div>
            <div class="char-card-username mono">@${esc(c.username || "unknown")}</div>
            <p class="char-card-tagline clamp-2">${esc(c.tagline || c.description || "No description yet.")}</p>
            <div class="row wrap gap-4" style="margin-top:9px">
                ${statusPill(c.status)}
                ${faction ? `<span class="chip" style="border-color:${esc(faction.color || "var(--line)")}44"><i class="faction-dot" style="background:${esc(faction.color || "#999")}"></i>${esc(faction.name)}</span>` : `<span class="chip">Unaffiliated</span>`}
            </div>
            <div class="char-card-foot">
                <span title="Relationships">${icon("relationships")} ${relCount}</span>
                <span title="Events">${icon("events")} ${evCount}</span>
                <span title="Storylines">${icon("storylines")} ${store.all("storylines").filter((s) => (s.characterIds || []).includes(c.key)).length}</span>
                ${c.locationId ? `<span class="push" title="${esc(store.nameOf("locations", c.locationId) || "")}">${icon("pin")} ${esc(truncate(store.nameOf("locations", c.locationId) || "", 16))}</span>` : ""}
            </div>
        </div>
    </a>`;
}

export function eventCard(ev, { showStoryline = true } = {}) {
    const meta = categoryMeta(ev.category);
    const location = ev.locationId ? store.get("locations", ev.locationId) : null;
    return `<a class="event-card hoverable" href="#/events?open=${esc(ev.key)}" data-event="${esc(ev.key)}" data-link>
        <div class="event-card-marker" style="--cat:${CATEGORY_COLORS[ev.category] || "#9aa3b2"}">${icon(categoryIcon(ev.category))}</div>
        <div class="event-card-main">
            <div class="row wrap gap-6" style="margin-bottom:5px">
                <span class="cat-label">${esc(meta.label)}</span>
                <span class="dot-sep"></span>
                <span class="mono tiny dim">${esc(fmtDate(ev.date))}</span>
                ${importanceBars(ev.importance)}
                ${canonBadge(ev.canon || "confirmed")}
            </div>
            <div class="event-card-title">${esc(ev.title)}</div>
            <p class="event-card-summary clamp-2">${esc(ev.summary || ev.description || "")}</p>
            <div class="row wrap gap-8" style="margin-top:8px">
                ${castChips(ev.characterIds, { limit: 3 })}
                ${location ? `<span class="chip">${icon("pin")} ${esc(location.name)}</span>` : ""}
                ${showStoryline && (ev.storylineIds || []).length ? `<span class="chip violet">${icon("storylines")} ${esc(store.nameOf("storylines", ev.storylineIds[0]) || "")}</span>` : ""}
            </div>
        </div>
    </a>`;
}

export function storylineCard(s) {
    const statusLabel = (STORYLINE_STATUS.find((x) => x.value === s.status) || {}).label || s.status;
    const phaseLabel = (PHASES.find((x) => x.value === s.phase) || {}).label || "Introduction";
    return `<a class="story-card hoverable" href="#/storylines/${esc(s.key)}" data-link>
        <div class="story-card-top">
            <div class="row gap-8" style="align-items:center">
                <span class="status ${esc(s.status)}">${esc(statusLabel)}</span>
                ${importanceBars(s.importance)}
            </div>
            ${canonBadge(s.canon)}
        </div>
        <h3 class="story-card-title">${esc(s.name)}</h3>
        <p class="story-card-sub clamp-2">${esc(s.subtitle || s.premise || "")}</p>
        <div class="story-card-cast">${castChips(s.characterIds, { limit: 4 })}</div>
        <div class="story-card-foot">
            <span>${icon("clock")} ${esc(s.startDate ? fmtDateShort(s.startDate) : "Undated")}</span>
            <span>${icon("branch")} ${esc(phaseLabel)}</span>
            <span class="push">${icon("events")} ${store.all("events").filter((e) => (e.storylineIds || []).includes(s.key)).length} events</span>
        </div>
    </a>`;
}

export function mysteryCard(m) {
    const statusLabel = (MYSTERY_STATUS.find((x) => x.value === m.status) || {}).label || m.status;
    return `<a class="mystery-card hoverable" href="#/secrets?open=${esc(m.key)}" data-mystery="${esc(m.key)}" data-link>
        <div class="mystery-top">
            <span class="mystery-symbol">${icon("key")}</span>
            <span class="status ${esc(m.status)}">${esc(statusLabel)}</span>
            ${importanceBars(m.importance)}
        </div>
        <h3>${esc(m.title)}</h3>
        <p class="clamp-3">${esc(m.description || "")}</p>
        <div class="mystery-stats">
            <span>${icon("info")} ${(m.clues || []).length} clues</span>
            <span>${icon("eye")} ${(m.theories || []).length} theories</span>
            <span>${icon("check")} ${(m.confirmed || []).length} confirmed</span>
        </div>
    </a>`;
}

export function factionCard(f) {
    const leader = f.leaderId ? store.get("characters", f.leaderId) : null;
    const members = (f.memberIds || []).map((id) => store.get("characters", id)).filter(Boolean);
    return `<a class="faction-card hoverable" href="#/factions/${esc(f.key)}" data-link style="--fcolor:${esc(f.color || "#d7b878")}">
        <div class="faction-banner">
            <div class="faction-crest">${f.logoUrl ? `<img src="${esc(safeUrl(f.logoUrl))}" alt="">` : esc(initials(f.name))}</div>
            <div class="faction-banner-fade"></div>
            ${statusPill(f.status, (FACTION_STATUS.find((x) => x.value === f.status) || {}).label)}
        </div>
        <div class="faction-body">
            <h3>${esc(f.name)}</h3>
            <div class="faction-motto">${esc(f.tagline || "No motto recorded")}</div>
            <div class="faction-meta">
                <span>${icon("crown")} ${esc(leader ? leader.name : "No leader")}</span>
                <span>${icon("characters")} ${members.length + (leader ? 1 : 0)}</span>
                <span>${icon("pin")} ${(f.locationIds || []).length}</span>
            </div>
            <div class="faction-members">${castChips([...(f.leaderId ? [f.leaderId] : []), ...(f.memberIds || [])], { limit: 5 })}</div>
        </div>
    </a>`;
}

export function locationCard(l) {
    const controller = l.controllerFactionId ? store.get("factions", l.controllerFactionId) : null;
    return `<a class="location-card hoverable" href="#/locations/${esc(l.key)}" data-link>
        <div class="location-thumb">
            ${l.imageUrl ? `<img src="${esc(safeUrl(l.imageUrl))}" alt="">` : `<span class="location-glyph">${icon("locations")}</span>`}
            <span class="location-type">${esc((LOCATION_TYPES.find((t) => t.value === l.type) || {}).label || l.type)}</span>
        </div>
        <div class="location-body">
            <h3>${esc(l.name)}</h3>
            <div class="mono tiny dim">${esc(l.coords || "Coordinates unknown")}</div>
            <p class="clamp-2">${esc(l.description || "")}</p>
            <div class="row wrap gap-4" style="margin-top:8px">
                ${controller ? `<span class="chip" style="color:${esc(controller.color)}"><i class="faction-dot" style="background:${esc(controller.color)}"></i>${esc(controller.name)}</span>` : `<span class="chip">Unclaimed</span>`}
                ${statusPill(l.condition)}
            </div>
        </div>
    </a>`;
}

export function itemCard(it) {
    const owner = it.ownerId ? store.get("characters", it.ownerId) : null;
    return `<a class="item-card hoverable" href="#/items/${esc(it.key)}" data-link>
        <div class="item-glyph">${it.imageUrl ? `<img src="${esc(safeUrl(it.imageUrl))}" alt="">` : icon("items")}</div>
        <div class="item-body">
            <h3>${esc(it.name)}</h3>
            <div class="tiny dim">${esc((it.type || "artefact").replace(/^./, (c) => c.toUpperCase()))}</div>
            <p class="clamp-2">${esc(it.description || "")}</p>
            <div class="row wrap gap-4" style="margin-top:8px">
                ${statusPill(it.status, (ITEM_STATUS.find((x) => x.value === it.status) || {}).label)}
                ${owner ? `<span class="chip">${avatarHtml(owner.name, { username: owner.username, size: "xs" })}${esc(owner.name)}</span>` : `<span class="chip">Owner unknown</span>`}
            </div>
        </div>
    </a>`;
}

export function relationMeta(type) {
    return RELATION_TYPES.find((r) => r.value === type) || { label: type || "Link", kind: "historic", color: "var(--r-historic)" };
}

export function characterStatusLabel(v) {
    return (CHARACTER_STATUS.find((x) => x.value === v) || {}).label || v;
}

export function secretStatusLabel(v) {
    return (SECRET_STATUS.find((x) => x.value === v) || {}).label || v;
}

export function avatarFor(record, size = "md") {
    return avatarHtml(record?.name || record?.title || "", {
        username: record?.username,
        image: record?.portraitUrl,
        size,
    });
}

export function eventOpenAttrs(key) {
    return `data-event="${esc(key)}"`;
}

export function freshness(iso) {
    if (!iso) return "";
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 2) return "recent";
    return "";
}

export { PHASES, MYSTERY_STATUS, SECRET_STATUS, RELATION_TYPES, STORYLINE_STATUS, FACTION_STATUS, avatarHtml };
