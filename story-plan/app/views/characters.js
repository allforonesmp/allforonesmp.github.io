/* Character directory and profile */

import { store, state } from "../core/store.js";
import { icon } from "../core/icons.js";
import { esc, fmtDate, fmtDateShort, debounce, avatarHtml, truncate, capitalize, initials, mcHead, safeUrl } from "../core/util.js";
import { CHARACTER_STATUS, RELATION_TYPES, DEFAULT_ATTRIBUTES, PHASES, CANON, STORYLINE_STATUS, MYSTERY_STATUS } from "../core/schema.js";
import { computeStats, eventsFor, relationshipsOf, storylinesForCharacter, itemsOwnedBy, secretsKnownBy, secretsSuspectedBy, secretsUnknownTo, mysteriesInvolving, consequencesFor } from "../core/selectors.js";
import { characterCard, canonBadge, statusPill, importanceBars, castChips, storylineCard, relationMeta, categoryMeta, categoryIcon, CATEGORY_COLORS, emptyState, avatarFor, panel } from "../components/cards.js";
import { openQuickView } from "../components/details.js";
import { openEntityForm, openModal, confirmDialog, toast, promptDialog } from "../components/ui.js";

export const flush = false;
let listState = { query: "", status: "", faction: "", sort: "name", view: "grid" };

export function heading(ctx) {
    if (ctx.params.id) {
        const c = store.get("characters", ctx.params.id);
        return c ? c.name : "Character";
    }
    return "Characters";
}

export function eyebrow(ctx) {
    return ctx.params.id ? "Character profile" : "Who they are";
}

export function render(ctx) {
    return ctx.params.id ? renderProfile(ctx) : renderDirectory(ctx);
}

/* -------------------------------------------------------------------------
   Directory
   ------------------------------------------------------------------------- */
function renderDirectory(ctx) {
    const chars = store.all("characters");
    return `<div class="page">
        <div class="page-head">
            <div>
                <div class="eyebrow">Cast</div>
                <h2>The people of AllForOne</h2>
                <p>${chars.length} characters · ${computeStats().counts.relationships} recorded relationships. Open a profile for their full history, relationships and journey.</p>
            </div>
            <div class="actions">
                <a class="btn" href="#/relationships">${icon("relationships")} Relationship graph</a>
                <button class="btn primary" data-new-character>${icon("plus")} New character</button>
            </div>
        </div>
        <div class="toolbar">
            <div class="filter-input">${icon("search")}<input placeholder="Search characters, usernames, traits…" data-char-search value="${esc(listState.query)}" /></div>
            <select class="filter-sel" data-char-status>
                <option value="">Any status</option>
                ${CHARACTER_STATUS.map((s) => `<option value="${s.value}">${s.label}</option>`).join("")}
            </select>
            <select class="filter-sel" data-char-faction>
                <option value="">Any faction</option>
                ${store.all("factions").map((f) => `<option value="${esc(f.key)}">${esc(f.name)}</option>`).join("")}
            </select>
            <select class="filter-sel" data-char-sort>
                <option value="name">Sort: name</option>
                <option value="events">Sort: most events</option>
                <option value="relationships">Sort: most connected</option>
                <option value="recent">Sort: recently updated</option>
            </select>
            <div class="segmented" style="margin-left:auto">
                <button class="seg ${listState.view === "grid" ? "active" : ""}" data-view="grid">${icon("grid")}</button>
                <button class="seg ${listState.view === "list" ? "active" : ""}" data-view="list">${icon("list")}</button>
            </div>
            <span class="result-count" data-char-count></span>
        </div>
        <div data-char-results></div>
    </div>`;
}

function renderDirectoryResults() {
    const q = listState.query.trim().toLowerCase();
    let rows = store.all("characters").filter((c) => {
        if (listState.status && c.status !== listState.status) return false;
        if (listState.faction && c.factionId !== listState.faction) return false;
        if (!q) return true;
        const hay = [c.name, c.username, c.tagline, c.description, c.occupation, ...(c.nicknames || []), ...(((c.personality || {}).positive) || [])].join(" ").toLowerCase();
        return hay.includes(q);
    });
    const evCount = (c) => store.all("events").filter((e) => (e.characterIds || []).includes(c.key)).length;
    const relCount = (c) => relationshipsOf(c.key).length;
    if (listState.sort === "events") rows = rows.sort((a, b) => evCount(b) - evCount(a));
    else if (listState.sort === "relationships") rows = rows.sort((a, b) => relCount(b) - relCount(a));
    else if (listState.sort === "recent") rows = rows.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    else rows = rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const countEl = document.querySelector("[data-char-count]");
    if (countEl) countEl.textContent = `${rows.length} of ${store.all("characters").length}`;

    if (!rows.length) {
        return emptyState({
            icon: "characters",
            title: store.all("characters").length ? "No characters match" : "The cast is empty",
            text: store.all("characters").length ? "Try a different search or clear the filters." : "Add your first character to start building the story.",
            action: `<button class="btn primary sm" data-new-character>${icon("plus")} New character</button>`,
        });
    }
    if (listState.view === "list") {
        return `<div class="char-list">${rows
            .map(
                (c) => `<a class="char-list-row" href="#/characters/${esc(c.key)}">
                    ${avatarHtml(c.name, { username: c.username, image: c.portraitUrl, size: "md" })}
                    <span class="clr-name"><b>${esc(c.name)}</b><span class="tiny dim">@${esc(c.username || "unknown")} · ${esc(c.occupation || "role unknown")}</span></span>
                    ${statusPill(c.status)}
                    <span class="chip">${esc(store.nameOf("factions", c.factionId) || "Unaffiliated")}</span>
                    <span class="tiny dim mono">${relCount(c)} rel · ${evCount(c)} ev</span>
                    ${icon("chevronRight")}
                </a>`,
            )
            .join("")}</div>`;
    }
    return `<div class="char-grid">${rows.map((c) => characterCard(c)).join("")}</div>`;
}

/* -------------------------------------------------------------------------
   Profile
   ------------------------------------------------------------------------- */
function renderProfile(ctx) {
    const c = store.get("characters", ctx.params.id);
    if (!c) {
        return `<div class="page">${emptyState({
            icon: "characters",
            title: "Character not found",
            text: "This record may have been deleted or archived.",
            action: `<a class="btn" href="#/characters">Back to directory</a>`,
        })}</div>`;
    }
    const faction = store.get("factions", c.factionId);
    const location = store.get("locations", c.locationId);
    const events = eventsFor(c.key);
    const rels = relationshipsOf(c.key);
    const stories = storylinesForCharacter(c.key);
    const items = itemsOwnedBy(c.key);
    const knows = secretsKnownBy(c.key);
    const suspects = secretsSuspectedBy(c.key);
    const unaware = secretsUnknownTo(c.key);
    const mysteries = mysteriesInvolving(c.key);
    const journey = c.journey || [];
    const stats = [
        { label: "Events", value: events.length, icon: "events" },
        { label: "Relationships", value: rels.length, icon: "relationships" },
        { label: "Storylines", value: stories.length, icon: "storylines" },
        { label: "Secrets known", value: knows.length + suspects.length, icon: "lock" },
        { label: "Journey stages", value: journey.length, icon: "branch" },
    ];

    return `<div class="page char-profile">
        <div class="char-hero" style="--accent:#7ea6ff">
            <div class="char-hero-glow"></div>
            <a class="btn ghost sm char-back" href="#/characters">${icon("arrowLeft")} Cast</a>
            <div class="char-hero-main">
                <div class="char-portrait-wrap">
                    ${avatarHtml(c.name, { username: c.username, image: c.portraitUrl, size: "hero" })}
                    <div class="char-portrait-ring"></div>
                    <span class="char-portrait-status ${esc(c.status)}"></span>
                </div>
                <div class="char-hero-copy">
                    <div class="row wrap gap-8" style="margin-bottom:8px">
                        ${statusPill(c.status)}
                        ${canonBadge(c.canon)}
                        ${importanceBars(c.importance || 0)}
                        ${(c.nicknames || []).slice(0, 2).map((n) => `<span class="chip gold">“${esc(n)}”</span>`).join("")}
                    </div>
                    <h2 class="char-name display">${esc(c.name)}</h2>
                    <div class="char-username mono">@${esc(c.username || "unknown")}${c.age ? ` · age ${esc(c.age)}` : ""}${c.occupation ? ` · ${esc(c.occupation)}` : ""}</div>
                    <p class="char-tagline">${esc(c.tagline || "No one-line description yet.")}</p>
                    <div class="row wrap gap-6 char-hero-chips">
                        ${faction ? `<a class="chip link" href="#/factions/${esc(faction.key)}" style="border-color:${esc(faction.color)}55"><i class="faction-dot" style="background:${esc(faction.color)}"></i>${esc(faction.name)}</a>` : `<span class="chip">Unaffiliated</span>`}
                        ${location ? `<a class="chip link" href="#/locations/${esc(location.key)}">${icon("pin")} ${esc(location.name)}</a>` : ""}
                        ${c.firstAppearance ? `<span class="chip">${icon("clock")} First seen ${esc(fmtDateShort(c.firstAppearance))}</span>` : ""}
                    </div>
                </div>
                <div class="char-hero-actions">
                    <button class="btn primary sm" data-edit-char>${icon("edit")} Edit profile</button>
                    <button class="btn sm" data-add-rel>${icon("relationships")} Add relationship</button>
                    <button class="btn sm" data-add-event>${icon("events")} Add event</button>
                    <button class="icon-btn" data-char-menu aria-label="More actions">${icon("more")}</button>
                </div>
            </div>
            <div class="char-hero-stats">
                ${stats.map((s) => `<div class="char-stat"><span>${icon(s.icon)}</span><b>${s.value}</b><span>${esc(s.label)}</span></div>`).join("")}
            </div>
        </div>

        <div class="profile-layout">
            <div class="profile-main">
                <div class="tabs" data-char-tabs>
                    <button class="tab active" data-tab="overview">Overview</button>
                    <button class="tab" data-tab="history">History <span class="count">${events.length}</span></button>
                    <button class="tab" data-tab="development">Development & journey <span class="count">${journey.length}</span></button>
                    <button class="tab" data-tab="relationships">Relationships <span class="count">${rels.length}</span></button>
                    <button class="tab" data-tab="knowledge">Knowledge <span class="count">${knows.length + suspects.length}</span></button>
                    <button class="tab" data-tab="world">Storylines & items</button>
                </div>

                <div class="tab-panel active" data-panel="overview">
                    ${overviewPanel(c)}
                </div>
                <div class="tab-panel" data-panel="history">
                    ${historyPanel(c, events)}
                </div>
                <div class="tab-panel" data-panel="development">
                    ${developmentPanel(c, journey)}
                </div>
                <div class="tab-panel" data-panel="relationships">
                    ${relationshipsPanel(c, rels)}
                </div>
                <div class="tab-panel" data-panel="knowledge">
                    ${knowledgePanel(c, knows, suspects, unaware, mysteries)}
                </div>
                <div class="tab-panel" data-panel="world">
                    ${worldPanel(c, stories, items, faction, location)}
                </div>
            </div>

            <aside class="profile-side">
                <section class="panel">
                    <div class="panel-head"><h3>${icon("zap")} Attributes</h3><span class="sub">Writer reference</span></div>
                    <div class="panel-body">${attributeRadar(c.attributes || {}, c.name)}</div>
                </section>
                <section class="panel">
                    <div class="panel-head"><h3>${icon("network")} Relationship diagram</h3></div>
                    <div class="panel-body">${miniRelationshipGraph(c, rels)}</div>
                </section>
                <section class="panel">
                    <div class="panel-head"><h3>${icon("info")} Quick facts</h3></div>
                    <div class="panel-body">
                        <div class="fact-stack">
                            <div class="fact"><span class="fact-label">Faction</span><span class="fact-value">${esc(faction?.name || "Unaffiliated")}</span></div>
                            <div class="fact"><span class="fact-label">Location</span><span class="fact-value">${esc(location?.name || "Unknown")}</span></div>
                            <div class="fact"><span class="fact-label">Age</span><span class="fact-value">${esc(c.age || "—")}</span></div>
                            <div class="fact"><span class="fact-label">Occupation</span><span class="fact-value">${esc(c.occupation || "—")}</span></div>
                            <div class="fact"><span class="fact-label">First appearance</span><span class="fact-value">${esc(c.firstAppearance ? fmtDate(c.firstAppearance) : "—")}</span></div>
                        </div>
                    </div>
                </section>
                <section class="panel">
                    <div class="panel-head"><h3>${icon("lock")} Secrets</h3><span class="sub">${knows.length} known</span></div>
                    <div class="panel-body tight">
                        ${knows.length || suspects.length
                            ? `<div class="stack-list">${[...knows.map((s) => ({ s, mode: "knows" })), ...suspects.map((s) => ({ s, mode: "suspects" }))].map(({ s, mode }) => `<button class="stack-item" data-open-secret="${esc(s.key)}"><span class="stack-icon ${mode}">${icon(mode === "knows" ? "eye" : "search")}</span><span style="min-width:0"><b class="truncate">${esc(s.title)}</b><span class="tiny dim">${mode === "knows" ? "Knows the truth" : "Suspects something"}</span></span></button>`).join("")}</div>`
                            : `<div class="quiet">No recorded knowledge. Add a secret and mark this character as a holder.</div>`}
                    </div>
                </section>
                <section class="panel">
                    <div class="panel-head"><h3>${icon("quote")} Key line</h3></div>
                    <div class="panel-body">
                        <blockquote class="char-quote">${esc(c.motivations?.quote || c.tagline || "No signature line recorded.")}</blockquote>
                    </div>
                </section>
            </aside>
        </div>
    </div>`;
}

function overviewPanel(c) {
    const p = c.personality || {};
    const b = c.backstory || {};
    const s = c.strengths || {};
    const w = c.weaknesses || {};
    const m = c.motivations || {};
    const pList = (title, items, cls = "") =>
        items && items.length
            ? `<div class="trait-block ${cls}"><div class="trait-title">${esc(title)}</div><ul class="dot-list">${items.map((i) => `<li>${icon("chevronRight")}<span>${esc(i)}</span></li>`).join("")}</ul></div>`
            : "";
    return `<div class="profile-sections">
        <section class="panel">
            <div class="panel-head"><h3>${icon("user")} Character overview</h3></div>
            <div class="panel-body">
                <p class="lede">${esc(c.description || "No overview written yet.")}</p>
                ${p.overview ? `<div class="divider"></div><div class="trait-title">Personality</div><p class="prose">${esc(p.overview)}</p>` : ""}
                <div class="trait-columns">
                    ${pList("Positive traits", p.positive, "pos")}
                    ${pList("Negative traits", p.negative, "neg")}
                </div>
                ${(p.habits || p.fears || p.desires || p.beliefs || p.moralCode) ? `<div class="divider"></div><div class="trait-columns">${pList("Habits", p.habits)}${pList("Biggest fears", p.fears)}${pList("Greatest desires", p.desires)}${pList("Beliefs", p.beliefs)}</div>${p.moralCode ? `<div class="inset-block"><b>Moral code</b><p>${esc(p.moralCode)}</p></div>` : ""}` : ""}
            </div>
        </section>

        ${m.objective || m.personal || (m.secondary || []).length ? `<section class="panel">
            <div class="panel-head"><h3>${icon("target")} Motivations</h3></div>
            <div class="panel-body">
                ${m.objective ? `<div class="goal-block"><span class="eyebrow plain">Main objective</span><p>${esc(m.objective)}</p></div>` : ""}
                <div class="trait-columns">
                    ${pList("Secondary objectives", m.secondary)}
                    ${pList("Willing to sacrifice", m.sacrifice)}
                </div>
                ${m.personal ? `<div class="inset-block"><b>Personal motivation</b><p>${esc(m.personal)}</p></div>` : ""}
                <div class="trait-columns">
                    ${m.ambition ? `<div class="trait-block"><div class="trait-title">Biggest ambition</div><p class="prose">${esc(m.ambition)}</p></div>` : ""}
                    ${m.fearOfLosing ? `<div class="trait-block"><div class="trait-title">What they fear losing</div><p class="prose">${esc(m.fearOfLosing)}</p></div>` : ""}
                </div>
            </div>
        </section>` : ""}

        ${
            b.childhood || b.family || b.origin || b.experiences || b.arrival || b.shaping
                ? `<section class="panel">
                    <div class="panel-head"><h3>${icon("book")} Backstory</h3></div>
                    <div class="panel-body">
                        <div class="prose-split">
                            ${b.origin ? `<div><h5>Origin</h5><p>${esc(b.origin)}</p></div>` : ""}
                            ${b.childhood ? `<div><h5>Childhood</h5><p>${esc(b.childhood)}</p></div>` : ""}
                            ${b.family ? `<div><h5>Family background</h5><p>${esc(b.family)}</p></div>` : ""}
                            ${b.arrival ? `<div><h5>Arrival on the SMP</h5><p>${esc(b.arrival)}</p></div>` : ""}
                            ${b.experiences ? `<div><h5>Previous experiences</h5><p>${esc(b.experiences)}</p></div>` : ""}
                            ${b.shaping ? `<div><h5>What shaped them</h5><p>${esc(b.shaping)}</p></div>` : ""}
                        </div>
                    </div>
                </section>`
                : ""
        }

        <section class="panel">
            <div class="panel-head"><h3>${icon("scale")} Strengths & weaknesses</h3></div>
            <div class="panel-body">
                <div class="strength-grid">
                    <div class="strength-col">
                        <div class="strength-head">${icon("shield")} Strengths</div>
                        ${pList("Physical", s.physical)}
                        ${pList("Combat", s.combat)}
                        ${pList("Social", s.social)}
                        ${pList("Intelligence", s.intelligence)}
                        ${pList("Emotional", s.emotional)}
                    </div>
                    <div class="strength-col weak">
                        <div class="strength-head">${icon("alert")} Weaknesses</div>
                        ${pList("Physical", w.physical)}
                        ${pList("Emotional", w.emotional)}
                        ${pList("Limitations", w.limits)}
                    </div>
                </div>
            </div>
        </section>
    </div>`;
}

function historyPanel(c, events) {
    const consequences = consequencesFor("characters", c.key);
    return `<section class="panel">
        <div class="panel-head"><h3>${icon("timeline")} Personal history</h3><span class="sub">${events.length} events</span>
            <div class="right"><button class="btn sm ghost" data-add-event>${icon("plus")} Link event</button></div>
        </div>
        <div class="panel-body">
            ${
                events.length
                    ? `<div class="personal-timeline">${events
                          .map(
                              (ev) => `<button class="pt-row" data-view-event="${esc(ev.key)}">
                                  <span class="pt-date mono">${esc(fmtDate(ev.date))}</span>
                                  <span class="pt-line"><i style="background:${CATEGORY_COLORS[ev.category] || "#999"}">${icon(categoryIcon(ev.category))}</i></span>
                                  <span class="pt-body">
                                      <span class="row wrap gap-6"><span class="cat-label">${esc(categoryMeta(ev.category).label)}</span>${importanceBars(ev.importance)}${canonBadge(ev.canon)}</span>
                                      <b>${esc(ev.title)}</b>
                                      <span class="clamp-2">${esc(ev.summary || ev.description || "")}</span>
                                      ${(ev.storylineIds || []).length ? `<span class="chips" style="margin-top:6px">${ev.storylineIds.map((id) => `<span class="chip orange">${esc(store.nameOf("storylines", id) || "")}</span>`).join("")}</span>` : ""}
                                  </span>
                              </button>`,
                          )
                          .join("")}</div>`
                    : emptyState({ icon: "timeline", title: "No events yet", text: "Link this character to an event and it will appear in their personal history automatically." })
            }
        </div>
    </section>
    ${
        consequences.length
            ? `<section class="panel">
                <div class="panel-head"><h3>${icon("zap")} Consequences that touched them</h3></div>
                <div class="panel-body">
                    <div class="consequence-list">${consequences
                        .map(
                            (x) => `<button class="consequence as-button" data-view-event="${esc(x.event.key)}">${icon("arrowRight")}<span><b>${esc(x.consequence.text)}</b><span class="tiny dim">${esc(x.event.title)} · ${esc(fmtDateShort(x.event.date))}</span></span></button>`,
                        )
                        .join("")}</div>
                </div>
            </section>`
            : ""
    }`;
}

function developmentPanel(c, journey) {
    const d = c.development || {};
    return `<section class="panel">
        <div class="panel-head"><h3>${icon("sparkles")} Character development</h3><span class="sub">how they changed</span></div>
        <div class="panel-body">
            <div class="before-after">
                <div class="ba-col"><span class="eyebrow plain">Originally</span><p>${esc(d.original || "Not recorded yet.")}</p></div>
                <div class="ba-arrow">${icon("arrowRight")}</div>
                <div class="ba-col now"><span class="eyebrow plain">Currently</span><p>${esc(d.current || "Not recorded yet.")}</p></div>
            </div>
            <div class="divider"></div>
            <div class="prose-split">
                ${d.changes ? `<div><h5>How they changed</h5><p>${esc(d.changes)}</p></div>` : ""}
                ${d.internalConflict ? `<div><h5>Current internal conflict</h5><p>${esc(d.internalConflict)}</p></div>` : ""}
                ${d.future ? `<div><h5>Possible future</h5><p>${esc(d.future)}</p></div>` : ""}
            </div>
            ${(d.lessons || []).length ? `<div class="trait-block" style="margin-top:14px"><div class="trait-title">Lessons learned</div><ul class="dot-list">${d.lessons.map((l) => `<li>${icon("check")}<span>${esc(l)}</span></li>`).join("")}</ul></div>` : ""}
        </div>
    </section>
    <section class="panel">
        <div class="panel-head"><h3>${icon("branch")} Character journey</h3><span class="sub">${journey.length} milestones</span>
            <div class="right"><button class="btn sm" data-add-milestone>${icon("plus")} Add milestone</button></div>
        </div>
        <div class="panel-body">
            ${
                journey.length
                    ? `<div class="journey">${journey
                          .map(
                              (m, i) => `<div class="journey-step">
                                  <div class="journey-node"><span class="mono">${String(i + 1).padStart(2, "0")}</span></div>
                                  <div class="journey-copy">
                                      <div class="journey-label">${esc(m.label || "Milestone")}</div>
                                      <div class="tiny dim mono">${esc(m.date ? fmtDate(m.date) : "Undated")}</div>
                                      <p>${esc(m.note || "")}</p>
                                  </div>
                                  <button class="icon-btn journey-del" data-del-milestone="${i}" title="Remove milestone">${icon("x")}</button>
                              </div>${i < journey.length - 1 ? `<div class="journey-arrow">${icon("arrowRight")}</div>` : ""}`,
                          )
                          .join("")}</div>
                          <div class="journey-note">${icon("info")} Milestones can also be edited from the Development tab in the edit form.</div>`
                    : emptyState({ icon: "branch", title: "No journey recorded", text: "Map how this character has changed: arrival → alliance → betrayal → revenge → redemption.", action: `<button class="btn sm primary" data-add-milestone>${icon("plus")} Add first milestone</button>` })
            }
        </div>
    </section>`;
}

function relationshipsPanel(c, rels) {
    return `<section class="panel">
        <div class="panel-head"><h3>${icon("relationships")} Relationships</h3><span class="sub">${rels.length} connections</span>
            <div class="right"><button class="btn sm" data-add-rel>${icon("plus")} Add relationship</button></div>
        </div>
        <div class="panel-body">
            ${
                rels.length
                    ? `<div class="rel-cards">${rels
                          .map((rel) => {
                              const other = store.get("characters", rel.aId === c.key ? rel.bId : rel.aId);
                              const meta = relationMeta(rel.type);
                              return `<button class="rel-card" data-open-rel="${esc(rel.key)}">
                                  <div class="rel-card-top">
                                      ${avatarHtml(other?.name || "?", { username: other?.username, image: other?.portraitUrl, size: "md" })}
                                      <div class="rel-card-copy"><b>${esc(other?.name || "Unknown")}</b><span class="chip" style="color:${meta.color}">${esc(meta.label)}</span></div>
                                      <span class="status ${esc(rel.status || "")}">${esc((rel.status || "active").replace(/_/g, " "))}</span>
                                  </div>
                                  <p class="clamp-2">${esc(rel.description || "")}</p>
                                  ${(rel.evolution || []).length ? `<div class="rel-evo-line">${rel.evolution.slice(-3).map((e) => `<span class="evo-chip" style="border-color:${relationMeta(e.type).color}66"><i style="background:${relationMeta(e.type).color}"></i>${esc(e.label || e.type)}</span>`).join("")}</div>` : ""}
                                  <span class="rel-card-foot">${icon("clock")} ${esc(rel.startDate ? fmtDate(rel.startDate) : "Undated")} → ${esc(rel.endDate ? fmtDate(rel.endDate) : "ongoing")} ${icon("arrowRight")}</span>
                              </button>`;
                          })
                          .join("")}</div>`
                    : emptyState({ icon: "relationships", title: "No relationships yet", text: "Relationships appear here and in the relationship graph automatically.", action: `<button class="btn sm primary" data-add-rel>${icon("plus")} Add relationship</button>` })
            }
        </div>
    </section>`;
}

function knowledgePanel(c, knows, suspects, unaware, mysteries) {
    const col = (title, rows, mode, ic) => `<div class="knowledge-col ${mode}">
        <h5>${icon(ic)} ${title} <span class="count">${rows.length}</span></h5>
        ${rows.length
            ? rows.map((s) => `<button class="stack-item" data-open-secret="${esc(s.key)}"><span style="min-width:0"><b class="truncate">${esc(s.title)}</b><span class="tiny dim">${esc(truncate(s.description || "", 70))}</span></span>${icon("chevronRight")}</button>`).join("")
            : `<div class="quiet tiny">Nothing recorded.</div>`}
    </div>`;
    return `<section class="panel">
        <div class="panel-head"><h3>${icon("lock")} Knowledge tracking</h3><span class="sub">what this character knows</span></div>
        <div class="panel-body">
            <div class="knowledge-grid three">${col("Knows the truth", knows, "knows", "eye")}${col("Suspects something", suspects, "suspects", "search")}${col("Completely unaware", unaware, "unaware", "eyeOff")}</div>
        </div>
    </section>
    <section class="panel">
        <div class="panel-head"><h3>${icon("key")} Mysteries they are part of</h3><span class="sub">${mysteries.length}</span></div>
        <div class="panel-body">
            ${
                mysteries.length
                    ? `<div class="stack-list">${mysteries
                          .map(
                              (m) => `<button class="stack-item" data-open-mystery="${esc(m.key)}"><span class="stack-icon">${icon("key")}</span><span style="min-width:0"><b>${esc(m.title)}</b><span class="tiny dim">${esc((MYSTERY_STATUS.find((x) => x.value === m.status) || {}).label)} · ${(m.clues || []).length} clues</span></span>${importanceBars(m.importance)}</button>`,
                          )
                          .join("")}</div>`
                    : `<div class="quiet">Not involved in any recorded mystery.</div>`
            }
        </div>
    </section>`;
}

function worldPanel(c, stories, items, faction, location) {
    return `<section class="panel">
        <div class="panel-head"><h3>${icon("storylines")} Active storylines</h3></div>
        <div class="panel-body">
            ${stories.length ? `<div class="story-grid">${stories.map(storylineCard).join("")}</div>` : `<div class="quiet">This character is not attached to a storyline yet.</div>`}
        </div>
    </section>
    <div class="two-col">
        <section class="panel">
            <div class="panel-head"><h3>${icon("items")} Items</h3></div>
            <div class="panel-body tight">
                ${items.length
                    ? `<div class="stack-list">${items.map((it) => `<a class="stack-item" href="#/items/${esc(it.key)}"><span class="stack-icon">${icon("items")}</span><span><b>${esc(it.name)}</b><span class="tiny dim">${esc(it.type)}</span></span>${icon("chevronRight")}</a>`).join("")}</div>`
                    : `<div class="quiet">No items held.</div>`}
            </div>
        </section>
        <section class="panel">
            <div class="panel-head"><h3>${icon("factions")} Affiliation</h3></div>
            <div class="panel-body">
                ${faction ? `<a class="faction-mini" href="#/factions/${esc(faction.key)}"><span class="fm-dot" style="background:${esc(faction.color)}"></span><span class="fm-body"><b>${esc(faction.name)}</b><span class="tiny dim">${esc(faction.tagline || "")}</span></span>${icon("chevronRight")}</a>` : `<div class="quiet">Unaffiliated.</div>`}
                ${location ? `<a class="faction-mini" style="margin-top:8px" href="#/locations/${esc(location.key)}"><span class="fm-dot" style="background:#5fd0c2"></span><span class="fm-body"><b>${esc(location.name)}</b><span class="tiny dim">Current location</span></span>${icon("chevronRight")}</a>` : ""}
            </div>
        </section>
    </div>`;
}

function attributeRadar(attrs, name) {
    const keys = DEFAULT_ATTRIBUTES.map((a) => a.key);
    const values = keys.map((k) => Number(attrs[k] ?? 0));
    const max = 10;
    const size = 210;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 74;
    const points = values.map((v, i) => {
        const a = (i / keys.length) * Math.PI * 2 - Math.PI / 2;
        const rr = (v / max) * radius;
        return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
    });
    const rings = [2, 4, 6, 8, 10].map((level) => {
        const pts = keys.map((_, i) => {
            const a = (i / keys.length) * Math.PI * 2 - Math.PI / 2;
            const rr = (level / max) * radius;
            return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
        });
        return `<polygon points="${pts.join(" ")}" fill="none" stroke="rgba(255,255,255,0.055)" />`;
    });
    return `<div class="attr-radar">
        <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Attributes for ${esc(name)}">
            ${rings.join("")}
            ${keys.map((k, i) => {
                const a = (i / keys.length) * Math.PI * 2 - Math.PI / 2;
                return `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * radius).toFixed(1)}" y2="${(cy + Math.sin(a) * radius).toFixed(1)}" stroke="rgba(255,255,255,0.055)"/>`;
            }).join("")}
            <polygon points="${points.join(" ")}" fill="rgba(215,184,120,0.16)" stroke="rgba(215,184,120,0.75)" stroke-width="1.5"/>
            ${keys.map((k, i) => {
                const a = (i / keys.length) * Math.PI * 2 - Math.PI / 2;
                const lx = cx + Math.cos(a) * (radius + 18);
                const ly = cy + Math.sin(a) * (radius + 18);
                return `<text x="${lx}" y="${ly + 3}" text-anchor="middle" font-size="8.5" fill="#8b93a0" font-family="DM Sans">${esc(DEFAULT_ATTRIBUTES[i].label)}</text>
                 <text x="${lx}" y="${ly + 14}" text-anchor="middle" font-size="7.5" fill="#626a76" font-family="IBM Plex Mono">${values[i]}</text>`;
            }).join("")}
        </svg>
    </div>`;
}

function miniRelationshipGraph(c, rels) {
    const others = rels
        .map((r) => ({ rel: r, other: store.get("characters", r.aId === c.key ? r.bId : r.aId) }))
        .filter((x) => x.other)
        .slice(0, 9);
    const w = 250;
    const h = 230;
    const cx = w / 2;
    const cy = h / 2;
    if (!others.length) return `<div class="quiet" style="text-align:center;padding:16px">No relationships to map yet.</div>`;
    return `<svg viewBox="0 0 ${w} ${h}" class="mini-rel-graph" style="width:100%">
        ${others.map((o, i) => {
            const a = (i / others.length) * Math.PI * 2 - Math.PI / 2;
            const x = cx + Math.cos(a) * 82;
            const y = cy + Math.sin(a) * 82;
            const meta = relationMeta(o.rel.type);
            o._x = x;
            o._y = y;
            return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${meta.color}" stroke-width="1.4" opacity="0.65"/>`;
        }).join("")}
        <g transform="translate(${cx},${cy})">
            <circle r="25" fill="#151a21" stroke="rgba(215,184,120,0.6)"/>
            <text y="4" text-anchor="middle" font-size="9.5" fill="#e9ebef" font-family="DM Sans">${esc(initials(c.name))}</text>
        </g>
        ${others.map((o) => `<g class="snap-node" data-snap-char="${esc(o.other.key)}" transform="translate(${o._x},${o._y})">
            <circle r="16" fill="#12161c" stroke="${relationMeta(o.rel.type).color}" stroke-width="1.2"/>
            <text y="3.5" text-anchor="middle" font-size="8" fill="#d8dde5" font-family="DM Sans">${esc(initials(o.other.name))}</text>
            <text y="27" text-anchor="middle" font-size="7.5" fill="#8b93a0" font-family="DM Sans">${esc(o.other.name.split(" ")[0])}</text>
        </g>`).join("")}
    </svg>`;
}

/* -------------------------------------------------------------------------
   Mount
   ------------------------------------------------------------------------- */
export function mount(root, ctx) {
    root.addEventListener("click", (e) => {
        if (e.target.closest("[data-new-character]")) {
            openEntityForm({ type: "characters", onSaved: (rec) => { location.hash = `#/characters/${rec.key}`; ctx.refresh(); } });
            return;
        }
        const viewBtn = e.target.closest("[data-view]");
        if (viewBtn) {
            listState.view = viewBtn.dataset.view;
            root.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b === viewBtn));
            renderList();
            return;
        }
        const snap = e.target.closest("[data-snap-char]");
        if (snap) location.hash = `#/characters/${snap.dataset.snapChar}`;
    });

    if (!ctx.params.id) {
        const search = root.querySelector("[data-char-search]");
        const status = root.querySelector("[data-char-status]");
        const faction = root.querySelector("[data-char-faction]");
        const sort = root.querySelector("[data-char-sort]");
        const renderList = () => {
            const results = root.querySelector("[data-char-results]");
            if (results) results.innerHTML = renderDirectoryResults();
        };
        search?.addEventListener("input", debounce((ev) => { listState.query = ev.target.value; renderList(); }, 150));
        status?.addEventListener("change", (ev) => { listState.status = ev.target.value; renderList(); });
        faction?.addEventListener("change", (ev) => { listState.faction = ev.target.value; renderList(); });
        sort?.addEventListener("change", (ev) => { listState.sort = ev.target.value; renderList(); });
        if (status) status.value = listState.status;
        if (faction) faction.value = listState.faction;
        if (sort) sort.value = listState.sort;
        renderList();
        return;
    }

    const character = store.get("characters", ctx.params.id);
    if (!character) return;

    root.querySelectorAll("[data-tab]").forEach((btn) =>
        btn.addEventListener("click", () => {
            root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b === btn));
            root.querySelectorAll("[data-panel]").forEach((p) => p.classList.toggle("active", p.dataset.panel === btn.dataset.tab));
        }),
    );

    root.addEventListener("click", (e) => {
        if (e.target.closest("[data-edit-char]")) {
            openEntityForm({ type: "characters", record: store.get("characters", character.key), onSaved: () => ctx.refresh(), onDeleted: () => { location.hash = "#/characters"; } });
            return;
        }
        if (e.target.closest("[data-add-rel]")) {
            openEntityForm({
                type: "relationships",
                defaults: { aId: character.key, description: "", evolution: [] },
                title: `Relationship with ${character.name}`,
                onSaved: () => ctx.refresh(),
            });
            return;
        }
        if (e.target.closest("[data-add-event]")) {
            openEntityForm({
                type: "events",
                defaults: { characterIds: [character.key], date: new Date().toISOString().slice(0, 10) },
                title: `Event involving ${character.name}`,
                onSaved: () => ctx.refresh(),
            });
            return;
        }
        const relBtn = e.target.closest("[data-open-rel]");
        if (relBtn) {
            openQuickView("relationships", relBtn.dataset.openRel);
            return;
        }
        const secret = e.target.closest("[data-open-secret]");
        if (secret) {
            openQuickView("secrets", secret.dataset.openSecret);
            return;
        }
        const mystery = e.target.closest("[data-open-mystery]");
        if (mystery) {
            openQuickView("mysteries", mystery.dataset.openMystery);
            return;
        }
        if (e.target.closest("[data-add-milestone]")) {
            addMilestone(character, ctx);
            return;
        }
        const del = e.target.closest("[data-del-milestone]");
        if (del) {
            const idx = Number(del.dataset.delMilestone);
            const next = [...(store.get("characters", character.key).journey || [])];
            next.splice(idx, 1);
            store.save("characters", { ...store.get("characters", character.key), journey: next });
            toast("Milestone removed.", "success");
            ctx.refresh();
            return;
        }
        if (e.target.closest("[data-char-menu]")) {
            const btn = e.target.closest("[data-char-menu]");
            import("../components/ui.js").then(({ openPopover }) => {
                openPopover(
                    btn,
                    `<button class="pop-item" data-menu-archive>${icon("archive")} ${character.archived ? "Restore" : "Archive character"}</button>
                     <button class="pop-item" data-menu-duplicate>${icon("copy")} Duplicate</button>
                     <div class="pop-sep"></div>
                     <button class="pop-item danger" data-menu-delete>${icon("trash")} Delete character</button>`,
                    {
                        width: 210,
                        align: "right",
                        onMount: (pop) => {
                            pop.addEventListener("click", async (ev) => {
                                const { closePopover } = await import("../components/ui.js");
                                if (ev.target.closest("[data-menu-archive]")) {
                                    closePopover();
                                    store.archive("characters", character.key, !character.archived);
                                    toast(character.archived ? "Character restored." : "Character archived.", "success");
                                    ctx.refresh();
                                } else if (ev.target.closest("[data-menu-duplicate]")) {
                                    closePopover();
                                    const copy = store.duplicate("characters", character.key);
                                    if (copy) {
                                        toast("Character duplicated.", "success");
                                        location.hash = `#/characters/${copy.key}`;
                                    }
                                } else if (ev.target.closest("[data-menu-delete]")) {
                                    closePopover();
                                    confirmDialog({
                                        title: "Delete character?",
                                        message: `Permanently delete <b>${esc(character.name)}</b>? Relationships involving them will be removed and every other reference cleaned up.`,
                                        requireText: character.name,
                                        confirmLabel: "Delete permanently",
                                        onConfirm: () => {
                                            store.remove("characters", { key: character.key });
                                            toast("Character deleted.", "success");
                                            location.hash = "#/characters";
                                        },
                                    });
                                }
                            });
                        },
                    },
                );
            });
        }
    });
}

function addMilestone(character, ctx) {
    const fresh = store.get("characters", character.key);
    const body = `<div class="field"><label>Milestone</label><input class="input" data-ms-label placeholder="e.g. First alliance" autofocus /></div>
        <div class="grid-2">
            <div class="field"><label>Story date</label><input class="input" type="date" data-ms-date /></div>
            <div class="field"><label>Order</label><select class="select" data-ms-order><option value="end">At the end of the journey</option><option value="start">At the beginning</option></select></div>
        </div>
        <div class="field"><label>What changed?</label><textarea class="textarea" rows="3" data-ms-note placeholder="How did this moment change them?"></textarea></div>`;
    openModal({
        title: "Add a journey milestone",
        subtitle: character.name,
        body,
        size: "narrow",
        foot: `<button class="btn" data-cancel>Cancel</button><span class="spacer"></span><button class="btn primary" data-save>${icon("plus")} Add milestone</button>`,
        onMount: (modal, close) => {
            modal.querySelector("[data-cancel]").addEventListener("click", close);
            modal.querySelector("[data-save]").addEventListener("click", () => {
                const label = modal.querySelector("[data-ms-label]").value.trim();
                if (!label) {
                    toast("Give the milestone a name.", "error");
                    return;
                }
                const journey = [...(fresh.journey || [])];
                const item = {
                    label,
                    date: modal.querySelector("[data-ms-date]").value,
                    note: modal.querySelector("[data-ms-note]").value.trim(),
                };
                if (modal.querySelector("[data-ms-order]").value === "start") journey.unshift(item);
                else journey.push(item);
                store.save("characters", { ...fresh, journey });
                toast("Milestone added to the journey.", "success");
                close();
                ctx.refresh();
            });
        },
    });
}
