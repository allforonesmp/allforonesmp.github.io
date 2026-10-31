/* Analytics: the shape of the story, computed from real records */

import { store } from "../core/store.js";
import { icon } from "../core/icons.js";
import { esc, fmtDateShort, avatarHtml, unique } from "../core/util.js";
import { computeStats, storylineProgress, storylinePhaseData } from "../core/selectors.js";
import { CATEGORY_COLORS, categoryMeta, categoryIcon, statusPill, canonBadge, emptyState } from "../components/cards.js";
import { EVENT_CATEGORIES, PHASES, CANON, RELATION_TYPES, CHARACTER_STATUS } from "../core/schema.js";

export const flush = false;
let range = "all";

export function heading() {
    return "Analytics";
}

export function render() {
    const s = computeStats();
    const events = store.all("events");
    const characters = store.all("characters");
    const relationships = store.all("relationships");
    const canonRows = [...characters, ...events, ...store.all("factions"), ...store.all("storylines"), ...store.all("mysteries")];
    const canonTotal = canonRows.length || 1;
    const canonConfirmed = canonRows.filter((r) => (r.canon || "confirmed") === "confirmed").length;
    const linked = characters.filter((c) => (c.eventIds || []).length || events.some((e) => (e.characterIds || []).includes(c.key))).length;
    const orphanChars = characters.filter((c) => !events.some((e) => (e.characterIds || []).includes(c.key)) && !relationships.some((r) => r.aId === c.key || r.bId === c.key));
    const thinStorylines = store.all("storylines").filter((st) => (st.eventIds || []).length < 2);
    const unknownCanon = canonRows.filter((r) => ["theory", "rumour", "noncanon", "retconned"].includes(r.canon || "")).length;
    const upcoming = events.filter((e) => (e.date || "") > new Date().toISOString().slice(0, 10)).length;

    return `<div class="page analytics-page">
        <div class="page-head">
            <div>
                <div class="eyebrow">The shape of the story</div>
                <h2>Analytics</h2>
                <p>Every number on this page is computed from your records. No placeholder statistics — if the archive is empty, so are the charts.</p>
            </div>
            <div class="actions">
                <select class="filter-sel" data-range>
                    <option value="all">All time</option>
                    <option value="24">Last 24 months</option>
                    <option value="12">Last 12 months</option>
                    <option value="6">Last 6 months</option>
                </select>
                <button class="btn" data-print>${icon("download")} Print report</button>
            </div>
        </div>

        <div class="kpi-grid">
            ${[
                { label: "Characters", value: s.counts.characters, sub: `${linked} appear in events`, ic: "characters", tone: "blue" },
                { label: "Events", value: s.counts.events, sub: `${upcoming} planned ahead`, ic: "events", tone: "gold" },
                { label: "Relationships", value: s.counts.relationships, sub: `${s.counts.conflicts} active conflicts`, ic: "relationships", tone: "rose" },
                { label: "Active storylines", value: s.counts.activeStorylines, sub: `${s.counts.storylines} total arcs`, ic: "storylines", tone: "orange" },
                { label: "Unresolved mysteries", value: s.counts.unresolvedMysteries, sub: `${s.counts.mysteries} recorded`, ic: "mysteries", tone: "violet" },
                { label: "Canon coverage", value: `${Math.round((canonConfirmed / canonTotal) * 100)}%`, sub: `${canonTotal - canonConfirmed} unconfirmed / retconned`, ic: "shield", tone: "green" },
            ]
                .map((k) => `<div class="kpi ${k.tone}"><div class="kpi-ico">${icon(k.ic)}</div><div><span>${k.label}</span><b>${k.value}</b><small>${k.sub}</small></div></div>`)
                .join("")}
        </div>

        <div class="analytics-grid">
            <section class="panel chart-panel span-2">
                <div class="panel-head"><h3>${icon("analytics")} Events over time</h3><span class="sub">recorded events per month</span>
                    <div class="right"><span class="tiny dim">${s.months.length} active months</span></div>
                </div>
                <div class="panel-body">${monthChart(s.months, range)}</div>
            </section>

            <section class="panel chart-panel">
                <div class="panel-head"><h3>${icon("layers")} Events by category</h3></div>
                <div class="panel-body">
                    ${donut(EVENT_CATEGORIES.map((c) => ({ label: c.label, value: (s.byCategory[c.value] || []).length, color: CATEGORY_COLORS[c.value] })).filter((x) => x.value), "events")}
                </div>
            </section>

            <section class="panel chart-panel">
                <div class="panel-head"><h3>${icon("user")} Character status</h3></div>
                <div class="panel-body">
                    ${donut(CHARACTER_STATUS.map((c) => ({ label: c.label, value: characters.filter((x) => (x.status || "unknown") === c.value).length, color: statusColour(c.value) })).filter((x) => x.value), "characters")}
                </div>
            </section>

            <section class="panel chart-panel span-2">
                <div class="panel-head"><h3>${icon("crown")} Most involved characters</h3><span class="sub">events ×2 + relationships</span></div>
                <div class="panel-body">
                    ${s.mostInvolved.slice(0, 10).map((c) => `<div class="rank-row">
                        <span class="rank-avatar">${avatarHtml(c.name, { username: c.username, image: c.portraitUrl, size: "sm" })}</span>
                        <span class="rank-name"><a href="#/characters/${esc(c.key)}">${esc(c.name)}</a><span class="tiny dim">${c.eventCount} events · ${c.relCount} relationships</span></span>
                        <span class="rank-bar"><i style="width:${Math.round((c.score / Math.max(1, s.mostInvolved[0].score)) * 100)}%"></i></span>
                        <b class="rank-score">${c.score}</b>
                    </div>`).join("") || `<div class="quiet">No characters yet.</div>`}
                </div>
            </section>

            <section class="panel chart-panel">
                <div class="panel-head"><h3>${icon("flag")} Faction weight</h3></div>
                <div class="panel-body">
                    ${s.factionStats.slice(0, 7).map((f) => `<div class="mini-bar-row"><span class="mb-label"><a href="#/factions/${esc(f.key)}">${esc(f.name)}</a></span><span class="mini-bar"><i style="width:${Math.round((((f.memberIds || []).length + 1) / Math.max(1, s.factionStats[0].memberCount || 1)) * 100)}%;background:${esc(f.color || "var(--gold)")}"></i></span><b class="tiny">${f.memberCount}</b></div>`).join("") || `<div class="quiet">No factions yet.</div>`}
                    <div class="chart-foot">Bar = current members. Hover a name for detail.</div>
                </div>
            </section>

            <section class="panel chart-panel">
                <div class="panel-head"><h3>${icon("relationships")} Relationship mix</h3></div>
                <div class="panel-body">
                    ${RELATION_TYPES.map((t) => ({ ...t, n: relationships.filter((r) => r.type === t.value).length })).filter((t) => t.n).sort((a, b) => b.n - a.n).slice(0, 8).map((t) => `<div class="mini-bar-row"><span class="mb-label" style="color:${t.color}">${esc(t.label)}</span><span class="mini-bar"><i style="width:${Math.round((t.n / relationships.length) * 100)}%;background:${t.color}"></i></span><b class="tiny">${t.n}</b></div>`).join("") || `<div class="quiet">No relationships recorded.</div>`}
                </div>
            </section>

            <section class="panel chart-panel span-2">
                <div class="panel-head"><h3>${icon("storylines")} Storyline progress</h3><span class="sub">phase coverage, not auto-complete</span></div>
                <div class="panel-body">
                    ${store.all("storylines").slice(0, 8).map((st) => {
                        const prog = storylineProgress(st);
                        const buckets = storylinePhaseData(st.key);
                        return `<div class="story-progress-row">
                            <span class="spr-name"><a href="#/storylines/${esc(st.key)}">${esc(st.name)}</a>${statusPill(st.status)}</span>
                            <span class="phase-mini">${PHASES.map((p) => `<i class="${(buckets.find((b) => b.value === p.value)?.events || []).length ? "filled" : ""}" title="${p.label}"></i>`).join("")}</span>
                            <b class="tiny">${prog}%</b>
                        </div>`;
                    }).join("") || `<div class="quiet">No storylines yet.</div>`}
                </div>
            </section>

            <section class="panel chart-panel">
                <div class="panel-head"><h3>${icon("shield")} Canon mix</h3></div>
                <div class="panel-body">
                    <div class="canon-stack">${CANON.map((c) => {
                        const n = (s.canonMix[c.value] || []).length;
                        if (!n) return "";
                        return `<span style="width:${(n / canonTotal) * 100}%;background:${canonColour(c.value)}" title="${esc(c.label)}: ${n}"></span>`;
                    }).join("")}</div>
                    <div class="canon-legend">${CANON.map((c) => {
                        const n = (s.canonMix[c.value] || []).length;
                        return `<span><i style="background:${canonColour(c.value)}"></i>${esc(c.label)} <b>${n}</b></span>`;
                    }).join("")}</div>
                    <div class="chart-foot">Unconfirmed canon: <b>${unknownCanon}</b> records. Retcons keep their previous version.</div>
                </div>
            </section>

            <section class="panel chart-panel span-2">
                <div class="panel-head"><h3>${icon("pin")} Busiest locations</h3></div>
                <div class="panel-body">
                    ${s.locationStats.slice(0, 8).map((l) => `<div class="mini-bar-row"><span class="mb-label"><a href="#/locations/${esc(l.key)}">${esc(l.name)}</a></span><span class="mini-bar"><i style="width:${Math.round((l.eventCount / Math.max(1, s.locationStats[0].eventCount)) * 100)}%;background:var(--n-location)"></i></span><b class="tiny">${l.eventCount}</b></div>`).join("") || `<div class="quiet">No locations recorded.</div>`}
                </div>
            </section>

            <section class="panel chart-panel">
                <div class="panel-head"><h3>${icon("alert")} Story health</h3></div>
                <div class="panel-body">
                    <div class="health-list">
                        <div class="${orphanChars.length ? "warn" : "ok"}"><b>${orphanChars.length}</b><span>characters with no events or relationships</span></div>
                        <div class="${thinStorylines.length ? "warn" : "ok"}"><b>${thinStorylines.length}</b><span>storylines with fewer than 2 events</span></div>
                        <div class="${s.counts.unresolvedMysteries ? "" : "ok"}"><b>${s.counts.unresolvedMysteries}</b><span>unresolved mysteries awaiting a reveal</span></div>
                        <div class="${s.counts.upcomingEvents ? "" : "ok"}"><b>${s.counts.upcomingEvents}</b><span>planned events not yet canon</span></div>
                        <div><b>${s.totalConsequences}</b><span>linked consequences across all events</span></div>
                        <div><b>${Math.round((s.counts.events / Math.max(1, s.counts.characters)) * 10) / 10}</b><span>events per character on average</span></div>
                    </div>
                    <div class="chart-foot">Gaps are prompts, not errors — a quiet character can simply be waiting.</div>
                </div>
            </section>
        </div>
    </div>`;
}

export function mount(root, ctx) {
    const sel = root.querySelector("[data-range]");
    sel.value = range;
    sel.addEventListener("change", () => { range = sel.value; ctx.refresh(); });
    root.querySelector("[data-print]")?.addEventListener("click", () => window.print());
}

/* --------------------------------------------------------------- charts */

function monthChart(months, rangeKey) {
    if (!months.length) return emptyState({ icon: "analytics", title: "No dated events", text: "Add dates to events to grow this chart." });
    let rows = months;
    if (rangeKey !== "all") {
        const n = Number(rangeKey);
        const last = new Date();
        const cutoff = new Date(last.getFullYear(), last.getMonth() - n + 1, 1);
        const key = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
        rows = rows.filter(([m]) => m >= key);
    }
    if (!rows.length) return `<div class="quiet">No events in this range.</div>`;
    const max = Math.max(...rows.map(([, n]) => n), 1);
    const groups = [];
    for (const [m, n] of rows) {
        const [y, mo] = m.split("-");
        groups.push({ label: `${mo}/${y.slice(2)}`, value: n, year: y });
    }
    const width = Math.max(560, groups.length * 34);
    const height = 210;
    const pad = { l: 30, r: 8, t: 12, b: 26 };
    const bw = (width - pad.l - pad.r) / groups.length;
    const barW = Math.max(6, bw * 0.55);
    const y = (v) => height - pad.b - (v / max) * (height - pad.t - pad.b);
    const bars = groups.map((g, i) => {
        const x = pad.l + i * bw + (bw - barW) / 2;
        return `<g class="chart-bar" data-tip="${g.label}: ${g.value} events">
            <rect x="${x}" y="${pad.t}" width="${barW}" height="${height - pad.t - pad.b}" rx="3" class="chart-bar-hit" />
            <rect x="${x}" y="${y(g.value)}" width="${barW}" height="${height - pad.b - y(g.value)}" rx="3" class="chart-bar-fill" />
            ${groups.length <= 26 || i % Math.ceil(groups.length / 14) === 0 ? `<text x="${x + barW / 2}" y="${height - 8}" text-anchor="middle" class="chart-label">${esc(g.label)}</text>` : ""}
            <text x="${x + barW / 2}" y="${y(g.value) - 5}" text-anchor="middle" class="chart-value">${g.value}</text>
        </g>`;
    });
    const grid = [0.25, 0.5, 0.75, 1].map((f) => `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y(max * f)}" y2="${y(max * f)}" class="chart-grid" /><text x="${pad.l - 6}" y="${y(max * f) + 3}" text-anchor="end" class="chart-axis">${Math.round(max * f)}</text>`).join("");
    return `<div class="chart-scroll"><svg viewBox="0 0 ${width} ${height}" class="chart-svg" style="min-width:${Math.min(width, 900)}px;height:${height}px" preserveAspectRatio="none">
        ${grid}${bars.join("")}
        <line x1="${pad.l}" x2="${width - pad.r}" y1="${height - pad.b}" y2="${height - pad.b}" class="chart-axis-line" />
    </svg></div>`;
}

function donut(items, noun) {
    const total = items.reduce((n, x) => n + x.value, 0);
    if (!total) return `<div class="quiet">No ${noun} recorded.</div>`;
    const R = 52;
    const C = 2 * Math.PI * R;
    let offset = 0;
    const segments = items.map((it) => {
        const frac = it.value / total;
        const len = frac * C;
        const seg = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${it.color}" stroke-width="20" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)" />`;
        offset += len;
        return seg;
    });
    return `<div class="donut-wrap">
        <div class="donut"><svg viewBox="0 0 140 140">${segments}<text x="70" y="68" text-anchor="middle" class="donut-total">${total}</text><text x="70" y="84" text-anchor="middle" class="donut-sub">${esc(noun)}</text></svg></div>
        <div class="donut-legend">${items.map((it) => `<div class="dl-row"><i style="background:${it.color}"></i><span>${esc(it.label)}</span><b>${it.value}</b><span class="tiny dim">${Math.round((it.value / total) * 100)}%</span></div>`).join("")}</div>
    </div>`;
}

function statusColour(v) {
    return { alive: "#77d29a", dead: "#8b93a0", missing: "#d7b878", undead: "#b295ff", unknown: "#5f96e8" }[v] || "#7c8794";
}

function canonColour(v) {
    return { confirmed: "#77d29a", planned: "#7ea6ff", rumour: "#e9a05a", theory: "#b295ff", noncanon: "#7c8794", retconned: "#e05d52" }[v] || "#7c8794";
}
