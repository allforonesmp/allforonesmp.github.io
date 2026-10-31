/* Dashboard — the situation report */

import { store, state } from "../core/store.js";
import { icon } from "../core/icons.js";
import { esc, fmtDate, timeAgo, truncate, fmtDateShort, avatarHtml, capitalize } from "../core/util.js";
import { PHASES, RELATION_TYPES, STORYLINE_STATUS, MYSTERY_STATUS, FACTION_STATUS } from "../core/schema.js";
import { computeStats, dashboardSnapshot } from "../core/selectors.js";
import {
    statTile,
    castChips,
    importanceBars,
    canonBadge,
    statusPill,
    storylineCard,
    relationMeta,
    categoryMeta,
    categoryIcon,
    CATEGORY_COLORS,
    emptyState,
    avatarFor,
} from "../components/cards.js";
import { openQuickView } from "../components/details.js";
import { toast } from "../components/ui.js";
import { openEntityForm } from "../components/ui.js";

export const flush = false;

export function render(ctx) {
    const snap = dashboardSnapshot();
    const { stats, currentStorylines, liveConflicts, openMysteries, recentEvents, upcoming, featuredChars, latestActivity } = snap;
    const featured = currentStorylines[0] || null;
    const latestEvent = recentEvents[0] || null;
    const hasData = stats.counts.characters + stats.counts.events > 0;

    if (!hasData) return onboarding();

    const phaseWord = {
        introduction: "begins",
        development: "is still developing",
        escalation: "is escalating",
        climax: "has reached its climax",
        resolution: "is approaching resolution",
    }[featured?.phase || ""] || "is unfolding";

    const narrative =
        featured?.currentSituation ||
        latestEvent?.summary ||
        "The archive has records but no active storyline. Create a storyline to give the world a direction.";

    const lastUpdated = latestActivity?.[0]?.createdAt || new Date().toISOString();

    return `<div class="page dash">
        <section class="dash-hero">
            <div class="dash-hero-bg"></div>
            <div class="dash-hero-main">
                <div class="row wrap gap-8" style="margin-bottom:14px">
                    <span class="live-pill"><i></i> CURRENT SITUATION</span>
                    <span class="tiny dim mono">${esc(fmtDate(new Date(), { weekday: "long" }))} · updated ${esc(timeAgo(lastUpdated))}</span>
                </div>
                <h2 class="dash-headline">${esc(featured ? `${featured.name} ${phaseWord}.` : "The world is waiting for its next move.")}</h2>
                <p class="dash-narrative">${esc(truncate(narrative, 300))}</p>
                <div class="row wrap gap-8" style="margin-top:18px">
                    <a class="btn primary" href="#/map">${icon("map")} Open story map</a>
                    <a class="btn" href="#/timeline">${icon("timeline")} Read the timeline</a>
                    ${featured ? `<a class="btn ghost" href="#/storylines/${esc(featured.key)}">${icon("storylines")} ${esc(truncate(featured.name, 30))} ${icon("arrowRight")}</a>` : ""}
                </div>
                <div class="dash-hero-stats">
                    <div><b>${stats.counts.activeStorylines}</b><span>active arcs</span></div>
                    <div><b>${stats.counts.conflicts}</b><span>live conflicts</span></div>
                    <div><b>${stats.counts.unresolvedMysteries}</b><span>open mysteries</span></div>
                    <div><b>${stats.counts.upcomingEvents}</b><span>planned beats</span></div>
                </div>
            </div>
            <div class="dash-hero-side">
                <div class="eyebrow plain">Latest entry</div>
                ${
                    latestEvent
                        ? `<button class="latest-card" data-view-event="${esc(latestEvent.key)}">
                            <div class="latest-marker" style="--cat:${CATEGORY_COLORS[latestEvent.category] || "#999"}">${icon(categoryIcon(latestEvent.category))}</div>
                            <div class="latest-body">
                                <div class="row gap-6 wrap"><span class="cat-label">${esc(categoryMeta(latestEvent.category).label)}</span><span class="tiny dim mono">${esc(fmtDateShort(latestEvent.date))}</span>${canonBadge(latestEvent.canon)}</div>
                                <h4>${esc(latestEvent.title)}</h4>
                                <p class="clamp-2">${esc(latestEvent.summary || latestEvent.description || "")}</p>
                                <div class="row gap-6" style="margin-top:8px">${castChips(latestEvent.characterIds, { limit: 3 })}</div>
                            </div>
                        </button>`
                        : `<div class="empty" style="padding:24px"><p>No events recorded yet.</p></div>`
                }
                <div class="hero-mini-row">
                    <div><span class="tiny dim">World era</span><b>${esc(featured?.theme ? truncate(featured.theme, 34) : "Unwritten")}</b></div>
                    <div><span class="tiny dim">Records</span><b>${stats.counts.events + stats.counts.characters + stats.counts.factions + stats.counts.locations + stats.counts.items}</b></div>
                </div>
            </div>
        </section>

        <div class="stat-strip">
            ${statTile({ label: "Characters", value: stats.counts.characters, icon: "characters", href: "/characters", accent: "blue", sub: `${stats.byStatus.get("alive")?.length || 0} alive` })}
            ${statTile({ label: "Recorded events", value: stats.counts.events, icon: "events", href: "/events", accent: "gold", sub: `${stats.counts.upcomingEvents} planned` })}
            ${statTile({ label: "Active storylines", value: stats.counts.activeStorylines, icon: "storylines", href: "/storylines", accent: "orange", sub: `${stats.counts.upcomingStorylines} upcoming` })}
            ${statTile({ label: "Active factions", value: stats.counts.activeFactions, icon: "factions", href: "/factions", accent: "green", sub: `${stats.counts.factions} total` })}
            ${statTile({ label: "Unresolved mysteries", value: stats.counts.unresolvedMysteries, icon: "secrets", href: "/secrets", accent: "violet", sub: `${stats.counts.secrets} secrets tracked` })}
            ${statTile({ label: "Current conflicts", value: stats.counts.conflicts, icon: "swords", href: "/relationships", accent: "red", sub: "enemies & rivalries" })}
            ${statTile({ label: "Upcoming events", value: stats.counts.upcomingEvents, icon: "clock", href: "/timeline", accent: "gold", sub: "planned canon" })}
        </div>

        <div class="dash-grid">
            <div class="dash-main">
                <section class="panel">
                    <div class="panel-head">
                        <h3>${icon("storylines")} Featured storylines</h3>
                        <span class="sub">${currentStorylines.length} in motion</span>
                        <div class="right"><a class="btn sm ghost" href="#/storylines">All storylines ${icon("arrowRight")}</a></div>
                    </div>
                    <div class="panel-body">
                        ${
                            currentStorylines.length
                                ? `<div class="story-grid">${currentStorylines.slice(0, 4).map(storylineCard).join("")}</div>`
                                : emptyState({ icon: "storylines", title: "No active storylines", text: "Storylines give events a direction. Create one to track its phases.", action: `<button class="btn sm" onclick="document.querySelector('[data-create-storyline]')?.click()">Create storyline</button>` })
                        }
                    </div>
                </section>

                <div class="dash-split">
                    <section class="panel">
                        <div class="panel-head">
                            <h3>${icon("swords")} Developing conflicts</h3>
                            <span class="sub">${liveConflicts.length}</span>
                            <div class="right"><a class="btn sm ghost" href="#/relationships">Relationships ${icon("arrowRight")}</a></div>
                        </div>
                        <div class="panel-body tight">
                            <div class="conflict-list">
                                ${
                                    liveConflicts.length
                                        ? liveConflicts
                                              .slice(0, 4)
                                              .map((rel) => {
                                                  const a = store.get("characters", rel.aId);
                                                  const b = store.get("characters", rel.bId);
                                                  const meta = relationMeta(rel.type);
                                                  return `<button class="conflict-row" data-qv-rel="${esc(rel.key)}">
                                                      <span class="conflict-avatars">${avatarHtml(a?.name || "?", { username: a?.username, size: "sm" })}${avatarHtml(b?.name || "?", { username: b?.username, size: "sm" })}</span>
                                                      <span class="conflict-body"><b>${esc(a?.name || "?")} & ${esc(b?.name || "?")}</b><span class="tiny" style="color:${meta.color}">${esc(meta.label)} · ${esc(rel.status)}</span></span>
                                                      <span class="tiny dim clamp-2" style="max-width:180px">${esc(truncate(rel.description || "", 70))}</span>
                                                  </button>`;
                                              })
                                              .join("")
                                        : `<div class="quiet">No active conflict recorded. <a href="#/relationships">Map a rivalry</a>.</div>`
                                }
                            </div>
                        </div>
                    </section>

                    <section class="panel">
                        <div class="panel-head">
                            <h3>${icon("secrets")} Major unresolved</h3>
                            <span class="sub">${openMysteries.length}</span>
                            <div class="right"><a class="btn sm ghost" href="#/secrets">All ${icon("arrowRight")}</a></div>
                        </div>
                        <div class="panel-body tight">
                            <div class="mystery-mini-list">
                                ${
                                    openMysteries.length
                                        ? openMysteries
                                              .slice(0, 4)
                                              .map(
                                                  (m) => `<button class="mystery-mini" data-qv-mystery="${esc(m.key)}">
                                                      <span class="mm-icon">${icon("key")}</span>
                                                      <span style="min-width:0"><b class="truncate">${esc(m.title)}</b><span class="tiny dim">${esc((MYSTERY_STATUS.find((x) => x.value === m.status) || {}).label)} · ${(m.clues || []).length} clues</span></span>
                                                      ${importanceBars(m.importance)}
                                                  </button>`,
                                              )
                                              .join("")
                                        : `<div class="quiet">Every mystery is resolved — or none have been written yet.</div>`
                                }
                            </div>
                        </div>
                    </section>
                </div>

                <section class="panel">
                    <div class="panel-head">
                        <h3>${icon("bell")} Recent activity</h3>
                        <span class="sub">${latestActivity.length} recent changes</span>
                        <div class="right"><button class="btn sm ghost" data-open-activity>Full log ${icon("arrowRight")}</button></div>
                    </div>
                    <div class="panel-body tight">
                        <div class="activity-feed compact">
                            ${
                                latestActivity.length
                                    ? latestActivity
                                          .slice(0, 8)
                                          .map(
                                              (a) => `<div class="activity-row">
                                                  <span class="activity-dot ${esc(a.action || "")}"></span>
                                                  <div class="activity-body"><div class="activity-text">${esc(a.message || `${capitalize(a.action || "updated")} ${a.entityType || "record"}`)}</div>
                                                  <div class="tiny dim">${esc(a.email || "")} · ${esc(timeAgo(a.createdAt))}</div></div>
                                              </div>`,
                                          )
                                          .join("")
                                    : `<div class="quiet">Changes will appear here as the archive is edited.</div>`
                            }
                        </div>
                    </div>
                </section>
            </div>

            <aside class="dash-side">
                <section class="panel">
                    <div class="panel-head"><h3>${icon("characters")} Key characters</h3><span class="sub">by involvement</span></div>
                    <div class="panel-body tight">
                        <div class="key-char-list">
                            ${featuredChars
                                .map(
                                    (c) => `<a class="key-char" href="#/characters/${esc(c.key)}">
                                        ${avatarHtml(c.name, { username: c.username, image: c.portraitUrl, size: "md" })}
                                        <span class="kc-body"><b>${esc(c.name)}</b><span class="tiny dim">${esc(store.nameOf("factions", c.factionId) || c.occupation || "Unaffiliated")}</span></span>
                                        <span class="kc-stat mono" title="Events · Relationships">${c.eventCount}·${c.relCount}</span>
                                    </a>`,
                                )
                                .join("")}
                        </div>
                        <a class="btn sm ghost full" href="#/characters" style="margin-top:8px">Character directory ${icon("arrowRight")}</a>
                    </div>
                </section>

                <section class="panel">
                    <div class="panel-head"><h3>${icon("factions")} Faction situation</h3></div>
                    <div class="panel-body tight">
                        <div class="faction-mini-list">
                            ${stats.factionStats
                                .slice(0, 5)
                                .map((f) => {
                                    const statusLabel = (FACTION_STATUS.find((x) => x.value === f.status) || {}).label || f.status;
                                    return `<a class="faction-mini" href="#/factions/${esc(f.key)}">
                                        <span class="fm-dot" style="background:${esc(f.color || "#999")}"></span>
                                        <span class="fm-body"><b>${esc(f.name)}</b><span class="tiny dim">${esc(statusLabel)} · ${f.memberCount} members</span></span>
                                        <span class="tiny dim mono">${f.eventCount}e</span>
                                    </a>`;
                                })
                                .join("")}
                        </div>
                    </div>
                </section>

                <section class="panel">
                    <div class="panel-head"><h3>${icon("clock")} Planned next</h3><span class="sub">${upcoming.length}</span></div>
                    <div class="panel-body tight">
                        <div class="upcoming-list">
                            ${
                                upcoming.length
                                    ? upcoming
                                          .map(
                                              (ev) => `<button class="upcoming-row" data-view-event="${esc(ev.key)}">
                                                  <span class="up-date mono">${esc(ev.date ? fmtDateShort(ev.date) : "TBD")}</span>
                                                  <span style="min-width:0"><b class="truncate">${esc(ev.title)}</b><span class="tiny dim">${esc(categoryMeta(ev.category).label)}</span></span>
                                                  ${canonBadge(ev.canon)}
                                              </button>`,
                                          )
                                          .join("")
                                    : `<div class="quiet">No planned events. <a href="#/timeline">Plan a beat</a>.</div>`
                            }
                        </div>
                    </div>
                </section>

                <section class="panel network-panel">
                    <div class="panel-head"><h3>${icon("network")} Relationship pulse</h3><span class="sub">top 8</span></div>
                    <div class="panel-body">
                        ${networkSnapshot(stats)}
                        <a class="btn sm ghost full" href="#/relationships" style="margin-top:10px">Open relationship map ${icon("arrowRight")}</a>
                    </div>
                </section>

                <section class="panel">
                    <div class="panel-head"><h3>${icon("map")} Recent beats</h3></div>
                    <div class="panel-body tight">
                        <div class="mini-timeline">
                            ${recentEvents
                                .slice(0, 5)
                                .map(
                                    (ev) => `<button class="mini-tl-row as-button" data-view-event="${esc(ev.key)}">
                                        <span class="dot" style="background:${CATEGORY_COLORS[ev.category] || "#999"}"></span>
                                        <div><b>${esc(truncate(ev.title, 42))}</b><div class="tiny dim">${esc(fmtDateShort(ev.date))} · ${esc(categoryMeta(ev.category).label)}</div></div>
                                    </button>`,
                                )
                                .join("")}
                        </div>
                    </div>
                </section>
            </aside>
        </div>
    </div>`;
}

function networkSnapshot(stats) {
    const chars = stats.mostInvolved.slice(0, 8);
    if (chars.length < 2) return emptyState({ icon: "network", title: "Not enough characters", text: "Add at least two characters to see relationships." });
    const w = 300;
    const h = 260;
    const cx = w / 2;
    const cy = h / 2;
    const radius = 92;
    const positions = chars.map((c, i) => {
        const a = (i / chars.length) * Math.PI * 2 - Math.PI / 2;
        return { ...c, x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
    });
    const byKey = new Map(positions.map((p) => [p.key, p]));
    const rels = store.all("relationships").filter((r) => byKey.has(r.aId) && byKey.has(r.bId));
    return `<svg viewBox="0 0 ${w} ${h}" class="network-snap" role="img" aria-label="Relationship snapshot">
        <circle cx="${cx}" cy="${cy}" r="${radius + 30}" fill="none" stroke="rgba(255,255,255,0.05)"/>
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2 6"/>
        ${rels
            .map((r) => {
                const a = byKey.get(r.aId);
                const b = byKey.get(r.bId);
                const color = relationMeta(r.type).color;
                return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color}" stroke-width="1.2" opacity="0.55"/>`;
            })
            .join("")}
        ${positions
            .map(
                (p) => `<g class="snap-node" data-snap-char="${esc(p.key)}" transform="translate(${p.x},${p.y})">
                    <circle r="18" fill="#12161c" stroke="rgba(255,255,255,0.15)"/>
                    <text y="4" text-anchor="middle" font-size="9" fill="#d8dde5" font-family="DM Sans">${esc(p.name.split(" ").map((n) => n[0]).join("").slice(0, 2))}</text>
                    <text y="30" text-anchor="middle" font-size="8" fill="#8b93a0" font-family="DM Sans">${esc(p.name.split(" ")[0])}</text>
                </g>`,
            )
            .join("")}
    </svg>`;
}

function onboarding() {
    return `<div class="page">
        <div class="onboard">
            <div class="onboard-glow"></div>
            <div class="eyebrow">The archive is empty</div>
            <h2 class="dash-headline" style="margin-top:12px">Every world starts as a blank page.</h2>
            <p class="dash-narrative" style="max-width:640px">This is the central archive for the AllForOne SMP: characters, factions, events, mysteries and the threads between them. You can begin with your own records, or load a fully interconnected demonstration archive to explore how everything works — and remove it in one click afterwards.</p>
            <div class="onboard-actions">
                <button class="btn primary lg" data-load-demo>${icon("sparkles")} Load demonstration archive</button>
                <button class="btn lg" data-start-blank>${icon("plus")} Start from scratch</button>
            </div>
            <div class="onboard-grid">
                <div><span>${icon("map")}</span><b>Story map</b><p>Drag characters, events and factions onto an infinite canvas and connect them.</p></div>
                <div><span>${icon("timeline")}</span><b>Parallel timeline</b><p>Watch multiple arcs develop side by side, then zoom into the night everything changed.</p></div>
                <div><span>${icon("relationships")}</span><b>Living relationships</b><p>Friendships become betrayals become alliances — every chapter preserved.</p></div>
                <div><span>${icon("secrets")}</span><b>Knowledge tracking</b><p>Record who knows, who suspects and who is about to find out.</p></div>
            </div>
            <div class="onboard-foot">Demo records are clearly flagged and can be removed at any time from Settings → Database.</div>
        </div>
    </div>`;
}

export function mount(root, ctx) {
    root.addEventListener("click", (e) => {
        const rel = e.target.closest("[data-qv-rel]");
        if (rel) {
            openQuickView("relationships", rel.dataset.qvRel);
            return;
        }
        const mystery = e.target.closest("[data-qv-mystery]");
        if (mystery) {
            openQuickView("mysteries", mystery.dataset.qvMystery);
            return;
        }
        const snap = e.target.closest("[data-snap-char]");
        if (snap) {
            location.hash = `#/characters/${snap.dataset.snapChar}`;
            return;
        }
        if (e.target.closest("[data-open-activity]")) {
            import("../components/search.js").then(({ openActivityPanel }) => {
                import("../components/ui.js").then(({ openDrawer }) => openDrawer(openActivityPanel()));
            });
            return;
        }
        if (e.target.closest("[data-load-demo]")) loadDemo(ctx);
        if (e.target.closest("[data-start-blank]")) {
            openEntityForm({ type: "characters", onSaved: () => ctx.refresh() });
        }
    });
}

async function loadDemo(ctx) {
    const { buildDemo } = await import("../core/demo.js");
    toast("Loading the demonstration archive…", "info", { timeout: 2500 });
    try {
        const n = await store.seedDemo(buildDemo);
        toast(`Demonstration archive loaded — ${n} interconnected records.`, "success", { timeout: 5000 });
        ctx.refresh();
    } catch (err) {
        toast(err.message || "Could not load the demonstration archive.", "error");
    }
}
