/* Reusable record quick-view drawer, opened from maps, timelines and lists */

import { store } from "../core/store.js";
import { icon } from "../core/icons.js";
import { esc, fmtDate, fmtDateShort, timeAgo, truncate, safeUrl } from "../core/util.js";
import {
    PHASES,
    RELATION_TYPES,
    MYSTERY_STATUS,
    SECRET_STATUS,
    STORYLINE_STATUS,
    FACTION_STATUS,
    ITEM_STATUS,
    LOCATION_CONDITION,
    CHARACTER_STATUS,
    EVENT_CATEGORIES,
    CANON,
} from "../core/schema.js";
import {
    avatarHtml,
    canonBadge,
    statusPill,
    importanceBars,
    castChips,
    refChips,
    routeFor,
    categoryMeta,
    categoryIcon,
    CATEGORY_COLORS,
    relationMeta,
} from "./cards.js";
import { openDrawer, openEntityForm, confirmDialog, toast, singular } from "./ui.js";
import { navigate } from "../core/util.js";
import { eventsFor, relationshipsOf, secretsKnownBy, secretsSuspectedBy, itemsOwnedBy, storylinePhaseData } from "../core/selectors.js";

const labelOptions = (opts, value) => (opts.find((o) => o.value === value) || {}).label || value || "—";

function fact(label, value) {
    if (!value) return "";
    return `<div class="fact"><span class="fact-label">${esc(label)}</span><span class="fact-value">${value}</span></div>`;
}

function bullets(title, items, ic = "chevronRight") {
    if (!items || !items.length) return "";
    return `<div class="qv-block"><div class="qv-block-title">${esc(title)}</div><ul class="dot-list">${items
        .map((i) => `<li>${icon(ic)}<span>${esc(i)}</span></li>`)
        .join("")}</ul></div>`;
}

function prose(title, text) {
    if (!text) return "";
    return `<div class="qv-block"><div class="qv-block-title">${esc(title)}</div><p class="qv-prose">${esc(text)}</p></div>`;
}

function section(title, body, right = "") {
    if (!body) return "";
    return `<div class="qv-section"><div class="qv-section-head"><h4>${esc(title)}</h4>${right}</div>${body}</div>`;
}

export function openQuickView(type, key) {
    const record = store.get(type, key);
    if (!record) {
        toast("That record no longer exists.", "error");
        return;
    }
    let closeFn = null;
    const render = () => {
        const latest = store.get(type, key);
        if (!latest) {
            closeFn?.();
            return;
        }
        const { title, subtitle, hero, badges, body, footer } = buildContent(type, latest);
        const { close, el } = openDrawer({
            title,
            subtitle,
            body: `<div class="qv">${hero}${badges}${body}</div>`,
            foot: footer,
            onMount: (drawer) => {
                drawer.querySelector("[data-qv-edit]")?.addEventListener("click", () => {
                    openEntityForm({
                        type,
                        record: latest,
                        onSaved: () => {
                            close();
                            openQuickView(type, key);
                        },
                        onDeleted: () => close(),
                    });
                });
                drawer.querySelector("[data-qv-open]")?.addEventListener("click", () => {
                    close();
                    navigate(`/${routeFor(type)}${type === "events" ? `?open=${latest.key}` : `/${latest.key}`}`);
                });
                drawer.querySelector("[data-qv-archive]")?.addEventListener("click", () => {
                    store.archive(type, latest.key, !latest.archived);
                    toast(latest.archived ? "Record restored." : "Record archived.", "success");
                    close();
                    openQuickView(type, key);
                });
                drawer.querySelector("[data-qv-delete]")?.addEventListener("click", () => {
                    confirmDialog({
                        title: `Delete ${singular(type)}?`,
                        message: `Delete <b>${esc(store.nameOf(type, key) || title)}</b>?`,
                        detail: "References will be cleaned up across the archive. This cannot be undone.",
                        confirmLabel: "Delete permanently",
                        onConfirm: () => {
                            store.remove(type, { key });
                            close();
                            toast("Record deleted.", "success");
                        },
                    });
                });
                drawer.querySelectorAll("[data-truth-toggle]").forEach((btn) =>
                    btn.addEventListener("click", () => {
                        const target = drawer.querySelector("[data-truth]");
                        if (target) target.classList.toggle("revealed");
                    }),
                );
                drawer.addEventListener("click", (e) => {
                    const link = e.target.closest("a[data-link], a[href^='#/']");
                    if (link) close();
                });
            },
        });
        closeFn = close;
    };
    render();
}

function buildContent(type, r) {
    const nameOfChar = (id) => store.get("characters", id);
    let title = r.name || r.title || "Untitled";
    let subtitle = "";
    let hero = "";
    let badges = "";
    let body = "";
    let footer = "";

    const actions = (extra = "") => `
        ${extra}
        <button class="btn sm" data-qv-archive>${icon("archive")} ${r.archived ? "Restore" : "Archive"}</button>
        <button class="btn sm danger" data-qv-delete>${icon("trash")}</button>
        <span class="spacer"></span>
        <button class="btn sm" data-qv-open>${icon("external")} Open full record</button>
        <button class="btn sm primary" data-qv-edit>${icon("edit")} Edit</button>`;

    if (type === "characters") {
        subtitle = [r.nicknames?.length ? `“${r.nicknames[0]}”` : "", `@${r.username || "unknown"}`].filter(Boolean).join(" · ");
        hero = `<div class="qv-hero">
            ${avatarHtml(r.name, { username: r.username, image: r.portraitUrl, size: "xl" })}
            <div class="qv-hero-copy">
                <p class="qv-hero-tagline">${esc(r.tagline || "")}</p>
                <div class="row wrap gap-4">${statusPill(r.status)}${canonBadge(r.canon)}
                ${r.factionId ? `<a class="chip link" href="#/factions/${esc(r.factionId)}" data-link>${icon("factions")} ${esc(store.nameOf("factions", r.factionId) || "")}</a>` : ""}
                ${r.locationId ? `<a class="chip link" href="#/locations/${esc(r.locationId)}" data-link>${icon("pin")} ${esc(store.nameOf("locations", r.locationId) || "")}</a>` : ""}</div>
            </div>
        </div>`;
        const relationships = relationshipsOf(r.key);
        const attrs = r.attributes || {};
        body = `
            ${prose("Overview", r.description)}
            <div class="qv-facts">
                ${fact("Age", esc(r.age || "—"))}
                ${fact("Occupation", esc(r.occupation || "—"))}
                ${fact("First seen", esc(r.firstAppearance ? fmtDate(r.firstAppearance) : "—"))}
                ${fact("Events", String(eventsFor(r.key).length))}
                ${fact("Relationships", String(relationships.length))}
                ${fact("Journey stages", String((r.journey || []).length))}
            </div>
            ${section(
                "Connections",
                `<div class="qv-rel-list">${relationships
                    .slice(0, 6)
                    .map((rel) => {
                        const other = nameOfChar(rel.aId === r.key ? rel.bId : rel.aId);
                        const meta = relationMeta(rel.type);
                        return `<button class="qv-rel" data-view-char="${esc(other?.key || "")}">
                            ${avatarHtml(other?.name || "?", { username: other?.username, size: "xs" })}
                            <span class="t">${esc(other?.name || "Unknown")}</span>
                            <span class="chip" style="color:${meta.color}">${esc(meta.label)}</span>
                        </button>`;
                    })
                    .join("") || '<span class="dim small">No relationships recorded yet.</span>'}</div>`,
                `<button class="btn sm ghost" data-open-tab="relationships">See all</button>`,
            )}
            ${
                Object.keys(attrs).length
                    ? section(
                          "Attributes",
                          `<div class="attr-bars">${Object.entries(attrs)
                              .map(
                                  ([k, v]) =>
                                      `<div class="attr-bar"><span>${esc(k.replace(/^./, (c) => c.toUpperCase()))}</span><div class="bar"><i style="width:${(Number(v) / 10) * 100}%"></i></div><b class="mono">${Number(v)}</b></div>`,
                              )
                              .join("")}</div>`,
                      )
                    : ""
            }
            ${section(
                "Recent history",
                `<div class="qv-timeline">${eventsFor(r.key)
                    .slice(-4)
                    .reverse()
                    .map(
                        (ev) =>
                            `<button class="qv-tl-item" data-view-event="${esc(ev.key)}"><span class="dot" style="background:${CATEGORY_COLORS[ev.category] || "#999"}"></span><span class="d">${esc(fmtDateShort(ev.date))}</span><span class="t">${esc(ev.title)}</span></button>`,
                    )
                    .join("") || '<span class="dim small">No events recorded.</span>'}</div>`,
            )}
            ${secretsKnownBy(r.key).length ? section("Knows", `<div class="chips">${secretsKnownBy(r.key).map((s) => `<a class="chip violet link" href="#/secrets?open=${esc(s.key)}" data-link>${icon("lock")} ${esc(s.title)}</a>`).join("")}</div>`) : ""}
            ${itemsOwnedBy(r.key).length ? section("Holds", `<div class="chips">${itemsOwnedBy(r.key).map((i) => `<a class="chip link" href="#/items/${esc(i.key)}" data-link>${icon("items")} ${esc(i.name)}</a>`).join("")}</div>`) : ""}
        `;
        footer = actions();
    } else if (type === "events") {
        const meta = categoryMeta(r.category);
        subtitle = `${meta.label} · ${fmtDate(r.date)}`;
        hero = `<div class="qv-hero event-hero">
            <div class="event-big-marker" style="--cat:${CATEGORY_COLORS[r.category] || "#999"}">${icon(categoryIcon(r.category))}</div>
            <div class="qv-hero-copy">
                <p class="qv-hero-tagline">${esc(r.summary || "")}</p>
                <div class="row wrap gap-4">${importanceBars(r.importance, "lg")}${canonBadge(r.canon)}${r.phase ? `<span class="chip gold">${esc(labelOptions(PHASES, r.phase))}</span>` : ""}</div>
            </div>
        </div>`;
        body = `
            ${prose("Full account", r.description)}
            <div class="qv-facts">
                ${fact("Date", esc(fmtDate(r.date)))}
                ${fact("Category", esc(meta.label))}
                ${fact("Location", r.locationId ? `<a href="#/locations/${esc(r.locationId)}" class="chip link" data-link>${esc(store.nameOf("locations", r.locationId) || "")}</a>` : "—")}
                ${fact("Storylines", (r.storylineIds || []).map((id) => `<a href="#/storylines/${esc(id)}" class="chip link" data-link>${esc(store.nameOf("storylines", id) || "")}</a>`).join(" ") || "—")}
            </div>
            ${r.characterIds?.length ? section("Characters involved", castChips(r.characterIds, { limit: 12 })) : ""}
            ${r.factionIds?.length ? section("Factions involved", refChips("factions", r.factionIds, { limit: 6 })) : ""}
            ${prose("Cause", r.cause)}
            ${prose("Immediate outcome", r.outcome)}
            ${prose("Long-term consequences", r.consequences)}
            ${
                (r.consequenceLinks || []).length
                    ? section(
                          "Consequence links",
                          `<div class="consequence-list">${r.consequenceLinks
                              .map(
                                  (c) => `<div class="consequence">
                                      ${icon("arrowRight")}
                                      <span>${esc(c.text || "Consequence")}</span>
                                      ${c.targetType && c.targetId && store.get(c.targetType, c.targetId) ? `<a class="chip link" href="#/${routeFor(c.targetType)}${c.targetType === "events" ? `?open=${esc(c.targetId)}` : `/${esc(c.targetId)}`}" data-link>${esc(store.nameOf(c.targetType, c.targetId))}</a>` : ""}
                                  </div>`,
                              )
                              .join("")}</div>`,
                      )
                    : ""
            }
            ${(r.relatedEventIds || []).length ? section("Related events", `<div class="chips">${(r.relatedEventIds || []).map((id) => `<a class="chip link" href="#/events?open=${esc(id)}" data-link>${esc(store.nameOf("events", id) || "Event")}</a>`).join("")}</div>`) : ""}
            ${
                (r.images || []).length
                    ? section(
                          "Media",
                          `<div class="qv-gallery">${r.images
                              .map(
                                  (img) =>
                                      `<figure><img src="${esc(safeUrl(img.url))}" alt="${esc(img.caption || "")}" data-lightbox="${esc(safeUrl(img.url))}" /><figcaption>${esc(img.caption || "")}</figcaption></figure>`,
                              )
                              .join("")}</div>`,
                      )
                    : ""
            }
        `;
        footer = actions();
    } else if (type === "factions") {
        subtitle = r.tagline || "";
        hero = `<div class="qv-hero faction-hero" style="--fcolor:${esc(r.color || "#d7b878")}">
            <div class="faction-crest lg">${r.logoUrl ? `<img src="${esc(safeUrl(r.logoUrl))}" alt="">` : esc((r.name || "?").charAt(0))}</div>
            <div class="qv-hero-copy">
                <p class="qv-hero-tagline">${esc(r.description || "")}</p>
                <div class="row wrap gap-4">${statusPill(r.status, labelOptions(FACTION_STATUS, r.status))}${canonBadge(r.canon)}${importanceBars(r.importance)}</div>
            </div>
        </div>`;
        body = `
            ${prose("Ideology", r.ideology)}
            ${bullets("Objectives", r.objectives)}
            <div class="qv-facts">
                ${fact("Leader", r.leaderId ? `<a href="#/characters/${esc(r.leaderId)}" class="chip link" data-link>${esc(store.nameOf("characters", r.leaderId) || "")}</a>` : "—")}
                ${fact("Founded", esc(r.founded ? fmtDate(r.founded) : "—"))}
                ${fact("Members", String((r.memberIds || []).length + (r.leaderId ? 1 : 0)))}
                ${fact("Territory", esc(truncate(r.territory || "—", 46)))}
            </div>
            ${r.memberIds?.length ? section("Members", castChips([...(r.leaderId ? [r.leaderId] : []), ...r.memberIds], { limit: 14 })) : ""}
            ${(r.membershipHistory || []).length ? section("Past members", `<div class="chip-list">${r.membershipHistory.map((m) => `<span class="chip">${avatarHtml(store.nameOf("characters", m.characterId) || "?", { username: store.get("characters", m.characterId)?.username, size: "xs" })}${esc(store.nameOf("characters", m.characterId) || "Unknown")}${m.role ? ` · ${esc(m.role)}` : ""}</span>`).join("")}</div>`) : ""}
            ${r.allyIds?.length ? section("Allies", refChips("factions", r.allyIds, { limit: 8 })) : ""}
            ${r.enemyIds?.length ? section("Enemies", refChips("factions", r.enemyIds, { limit: 8 })) : ""}
            ${r.locationIds?.length ? section("Territory", refChips("locations", r.locationIds, { limit: 8 })) : ""}
            ${bullets("History", r.history)}
        `;
        footer = actions();
    } else if (type === "locations") {
        subtitle = `${labelOptions(LOCATION_CONDITION, r.condition)} · ${r.region || ""}`;
        hero = `<div class="qv-hero">
            <div class="location-hero-thumb">${r.imageUrl ? `<img src="${esc(safeUrl(r.imageUrl))}" alt="">` : icon("locations")}</div>
            <div class="qv-hero-copy">
                <p class="qv-hero-tagline">${esc(r.description || "")}</p>
                <div class="row wrap gap-4">${statusPill(r.condition)}${canonBadge(r.canon)}${importanceBars(r.importance)}</div>
            </div>
        </div>`;
        body = `
            <div class="qv-facts">
                ${fact("Coordinates", `<span class="mono">${esc(r.coords || "—")}</span>`)}
                ${fact("Controlled by", r.controllerFactionId ? `<a href="#/factions/${esc(r.controllerFactionId)}" class="chip link" data-link>${esc(store.nameOf("factions", r.controllerFactionId) || "")}</a>` : "—")}
                ${fact("Owner", r.ownerId ? `<a href="#/characters/${esc(r.ownerId)}" class="chip link" data-link>${esc(store.nameOf("characters", r.ownerId) || "")}</a>` : "—")}
                ${fact("Events here", String(store.all("events").filter((e) => e.locationId === r.key).length))}
            </div>
            ${prose("Historical importance", r.historicalImportance)}
            ${(r.ownershipHistory || []).length ? section("Ownership history", `<div class="mini-timeline">${r.ownershipHistory.map((h) => `<div class="mini-tl-row"><span class="dot"></span><div><b>${esc(h.owner || "Unknown")}</b>${h.factionId ? ` · ${esc(store.nameOf("factions", h.factionId) || "")}` : ""}<div class="tiny dim">${esc(h.from ? fmtDateShort(h.from) : "?")} → ${esc(h.to ? fmtDateShort(h.to) : "present")} ${h.note ? `· ${esc(h.note)}` : ""}</div></div></div>`).join("")}</div>`) : ""}
            ${r.characterIds?.length ? section("Characters associated", castChips(r.characterIds, { limit: 10 })) : ""}
            ${r.factionIds?.length ? section("Factions associated", refChips("factions", r.factionIds, { limit: 8 })) : ""}
            ${section("Events here", `<div class="qv-timeline">${store.all("events").filter((e) => e.locationId === r.key).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).slice(-5).map((ev) => `<button class="qv-tl-item" data-view-event="${esc(ev.key)}"><span class="dot" style="background:${CATEGORY_COLORS[ev.category] || "#999"}"></span><span class="d">${esc(fmtDateShort(ev.date))}</span><span class="t">${esc(ev.title)}</span></button>`).join("") || '<span class="dim small">No events recorded here.</span>'}</div>`)}
        `;
        footer = actions();
    } else if (type === "items") {
        subtitle = labelOptions(ITEM_STATUS, r.status);
        hero = `<div class="qv-hero">
            <div class="location-hero-thumb">${r.imageUrl ? `<img src="${esc(safeUrl(r.imageUrl))}" alt="">` : icon("items")}</div>
            <div class="qv-hero-copy">
                <p class="qv-hero-tagline">${esc(r.description || "")}</p>
                <div class="row wrap gap-4">${statusPill(r.status, labelOptions(ITEM_STATUS, r.status))}${canonBadge(r.canon)}${importanceBars(r.importance)}</div>
            </div>
        </div>`;
        body = `
            ${prose("Origin", r.origin)}
            ${prose("Historical significance", r.significance)}
            <div class="qv-facts">
                ${fact("Owner", r.ownerId ? `<a href="#/characters/${esc(r.ownerId)}" class="chip link" data-link>${esc(store.nameOf("characters", r.ownerId) || "")}</a>` : "Unknown")}
                ${fact("Location", r.locationId ? `<a href="#/locations/${esc(r.locationId)}" class="chip link" data-link>${esc(store.nameOf("locations", r.locationId) || "")}</a>` : "—")}
                ${fact("Discovered", esc(r.discovered ? fmtDate(r.discovered) : "—"))}
            </div>
            ${(r.previousOwners || []).length ? section("Ownership history", `<div class="mini-timeline">${r.previousOwners.map((h) => `<div class="mini-tl-row"><span class="dot"></span><div><b>${esc(store.nameOf("characters", h.characterId) || "Unknown")}</b><div class="tiny dim">${esc(h.from ? fmtDateShort(h.from) : "?")} → ${esc(h.to ? fmtDateShort(h.to) : "present")} ${h.note ? `· ${esc(h.note)}` : ""}</div></div></div>`).join("")}</div>`) : ""}
            ${r.eventIds?.length ? section("Associated events", `<div class="chips">${r.eventIds.map((id) => `<a class="chip link" href="#/events?open=${esc(id)}" data-link>${esc(store.nameOf("events", id) || "Event")}</a>`).join("")}</div>`) : ""}
        `;
        footer = actions();
    } else if (type === "mysteries") {
        subtitle = labelOptions(MYSTERY_STATUS, r.status);
        hero = `<div class="qv-hero">
            <div class="location-hero-thumb mystery-thumb">${icon("key")}</div>
            <div class="qv-hero-copy">
                <p class="qv-hero-tagline">${esc(r.description || "")}</p>
                <div class="row wrap gap-4">${statusPill(r.status, labelOptions(MYSTERY_STATUS, r.status))}${canonBadge(r.canon)}${importanceBars(r.importance)}</div>
            </div>
        </div>`;
        body = `
            ${prose("Origin", r.origin)}
            ${bullets("Known clues", r.clues, "search")}
            ${bullets("Suspected explanations", r.theories, "sparkles")}
            ${bullets("Confirmed information", r.confirmed, "check")}
            ${bullets("Unanswered questions", r.questions, "info")}
            ${prose("Planned reveal", r.revealPlan)}
            ${r.characterIds?.length ? section("Characters involved", castChips(r.characterIds, { limit: 10 })) : ""}
            ${r.eventIds?.length ? section("Related events", `<div class="chips">${r.eventIds.map((id) => `<a class="chip link" href="#/events?open=${esc(id)}" data-link>${esc(store.nameOf("events", id) || "Event")}</a>`).join("")}</div>`) : ""}
        `;
        footer = actions();
    } else if (type === "secrets") {
        subtitle = labelOptions(SECRET_STATUS, r.status);
        hero = `<div class="qv-hero">
            <div class="location-hero-thumb mystery-thumb">${icon("lock")}</div>
            <div class="qv-hero-copy">
                <p class="qv-hero-tagline">${esc(r.description || "")}</p>
                <div class="row wrap gap-4">${statusPill(r.status, labelOptions(SECRET_STATUS, r.status))}${canonBadge(r.canon)}${importanceBars(r.importance)}</div>
            </div>
        </div>`;
        body = `
            <div class="secret-truth" data-truth>
                <div class="secret-truth-head"><span>${icon("eyeOff")} The truth</span><button class="btn sm ghost" data-truth-toggle>Reveal</button></div>
                <p class="truth-text">${esc(r.truth || "No truth recorded.")}</p>
            </div>
            <div class="knowledge-grid">
                <div class="knowledge-col knows"><h5>${icon("eye")} Knows</h5>${castChips(r.holderIds, { limit: 10 })}</div>
                <div class="knowledge-col suspects"><h5>${icon("search")} Suspects</h5>${castChips(r.suspectIds, { limit: 10 })}</div>
                <div class="knowledge-col unaware"><h5>${icon("eyeOff")} Unaware</h5>${castChips(r.unawareIds, { limit: 10 })}</div>
            </div>
            ${bullets("Evidence", r.evidence, "paperclip")}
            ${prose("If revealed", r.revealImpact)}
            ${r.relatedEventIds?.length ? section("Related events", `<div class="chips">${r.relatedEventIds.map((id) => `<a class="chip link" href="#/events?open=${esc(id)}" data-link>${esc(store.nameOf("events", id) || "Event")}</a>`).join("")}</div>`) : ""}
        `;
        footer = actions();
    } else if (type === "storylines") {
        subtitle = r.subtitle || "";
        hero = `<div class="qv-hero">
            <div class="location-hero-thumb story-thumb">${icon("storylines")}</div>
            <div class="qv-hero-copy">
                <p class="qv-hero-tagline">${esc(r.premise || "")}</p>
                <div class="row wrap gap-4">${statusPill(r.status, labelOptions(STORYLINE_STATUS, r.status))}${canonBadge(r.canon)}${importanceBars(r.importance)}<span class="chip gold">${esc(labelOptions(PHASES, r.phase))}</span></div>
            </div>
        </div>`;
        const phaseData = storylinePhaseData(r.key);
        body = `
            ${prose("Main conflict", r.mainConflict)}
            ${prose("Current situation", r.currentSituation)}
            ${section(
                "Progression",
                `<div class="phase-strip">${phaseData
                    .map(
                        (p, i) => `<div class="phase-step ${p.events.length ? "has" : ""} ${r.phase === p.value ? "current" : ""}">
                            <span class="phase-index">${i + 1}</span>
                            <div class="phase-name">${esc(p.label)}</div>
                            <div class="phase-count">${p.events.length} event${p.events.length === 1 ? "" : "s"}</div>
                        </div>`,
                    )
                    .join("")}</div>`,
            )}
            ${r.characterIds?.length ? section("Cast", castChips(r.characterIds, { limit: 14 })) : ""}
            ${r.factionIds?.length ? section("Factions", refChips("factions", r.factionIds, { limit: 8 })) : ""}
            ${prose("Potential resolution", r.potentialResolution)}
            ${prose("Expected consequences", r.expectedConsequences)}
        `;
        footer = actions();
    } else if (type === "relationships") {
        const a = nameOfChar(r.aId);
        const b = nameOfChar(r.bId);
        title = `${a?.name || "?"} ↔ ${b?.name || "?"}`;
        const meta = relationMeta(r.type);
        subtitle = meta.label;
        hero = `<div class="qv-hero">
            <div class="rel-hero-avatars">${avatarHtml(a?.name || "?", { username: a?.username, size: "lg" })}<span class="rel-link">${icon("link")}</span>${avatarHtml(b?.name || "?", { username: b?.username, size: "lg" })}</div>
            <div class="qv-hero-copy">
                <p class="qv-hero-tagline">${esc(r.description || "")}</p>
                <div class="row wrap gap-4"><span class="chip" style="color:${meta.color}">${esc(meta.label)}</span>${statusPill(r.status)}${canonBadge(r.canon)}${r.secret ? `<span class="chip violet">${icon("lock")} Secret</span>` : ""}</div>
            </div>
        </div>`;
        body = `
            ${prose("How they met", r.met)}
            ${prose("History together", r.history)}
            <div class="qv-facts">
                ${fact("Status", esc(labelOptions(RELATION_TYPES, r.type)))}
                ${fact("Began", esc(r.startDate ? fmtDate(r.startDate) : "—"))}
                ${fact("Ended", esc(r.endDate ? fmtDate(r.endDate) : "Ongoing"))}
            </div>
            ${(r.evolution || []).length ? section("Relationship history", `<div class="evolution">${r.evolution.map((e) => `<div class="evo-row"><span class="evo-dot" style="background:${relationMeta(e.type).color}"></span><div class="evo-body"><div class="evo-head"><b>${esc(e.label || "Chapter")}</b><span class="chip" style="color:${relationMeta(e.type).color}">${esc(relationMeta(e.type).label)}</span><span class="tiny dim">${esc(e.date ? fmtDateShort(e.date) : "")}</span></div><p>${esc(e.note || "")}</p></div></div>`).join("")}</div>`) : ""}
        `;
        footer = actions(`<button class="btn sm" data-qv-open-record>${icon("external")} Open in relationships</button>`);
    }

    if ((r.canonHistory || []).length) {
        body += section(
            "Canon history · previous versions preserved",
            `<div class="evolution">${[...r.canonHistory]
                .reverse()
                .map(
                    (h) => `<div class="evo-row"><span class="evo-dot" style="background:var(--gold)"></span><div class="evo-body">
                        <div class="evo-head"><b>${esc(labelOptions(CANON, h.from))} → ${esc(labelOptions(CANON, h.to))}</b><span class="tiny dim">${esc(h.at ? fmtDate(h.at) : "")}${h.by ? ` · ${esc(h.by)}` : ""}</span></div>
                        <p>${esc(h.snapshot?.description || h.snapshot?.summary || h.snapshot?.premise || h.snapshot?.truth || "Previous version archived without a text snapshot.")}</p>
                    </div></div>`,
                )
                .join("")}</div>`,
        );
    }

    return { title, subtitle, hero, badges, body, footer };
}

/* Wire generic buttons inside the drawer via delegation */
document.addEventListener("click", (e) => {
    const eventBtn = e.target.closest("[data-view-event]");
    if (eventBtn) {
        e.preventDefault();
        openQuickView("events", eventBtn.dataset.viewEvent);
        return;
    }
    const charBtn = e.target.closest("[data-view-char]");
    if (charBtn && charBtn.dataset.viewChar) {
        e.preventDefault();
        openQuickView("characters", charBtn.dataset.viewChar);
        return;
    }
    const lightbox = e.target.closest("[data-lightbox]");
    if (lightbox) {
        e.preventDefault();
        import("./ui.js").then((m) => m.openLightbox(lightbox.dataset.lightbox));
    }
});
