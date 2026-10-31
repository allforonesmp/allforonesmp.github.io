/* Secrets & mysteries: knowledge tracking, investigation boards and reveals */

import { store } from "../core/store.js";
import { icon } from "../core/icons.js";
import { esc, fmtDate, fmtDateShort, avatarHtml, truncate, debounce } from "../core/util.js";
import { MYSTERY_STATUS, SECRET_STATUS, CANON } from "../core/schema.js";
import { mysteryCard, statusPill, canonBadge, importanceBars, refChips, castChips, emptyState, categoryMeta, CATEGORY_COLORS, categoryIcon } from "../components/cards.js";
import { openDrawer, openEntityForm, openModal, confirmDialog, toast, openLightbox } from "../components/ui.js";
import { openQuickView } from "../components/details.js";
import { secretsKnownBy, secretsSuspectedBy, mysteriesInvolving } from "../core/selectors.js";

export const flush = false;
let tab = "secrets";
let state = { query: "", status: "", canon: "", view: "grid" };
let redrawHook = null;

export function heading() {
    return "Secrets & Mysteries";
}

export function render() {
    return `<div class="page secrets-page">
        <div class="page-head">
            <div>
                <div class="eyebrow">What is hidden and what is hunted</div>
                <h2>Secrets & mysteries</h2>
                <p>Every secret tracks who truly knows, who only suspects, and who is still in the dark. Mysteries keep their clues, theories and unanswered questions until the table is ready.</p>
            </div>
            <div class="actions">
                <button class="btn primary" data-new-record>${icon("plus")} <span data-new-label>New secret</span></button>
            </div>
        </div>

        <div class="segmented-tabs">
            <button class="tab ${tab === "secrets" ? "active" : ""}" data-tab="secrets">${icon("lock")} Secrets <span class="count">${store.all("secrets").length}</span></button>
            <button class="tab ${tab === "mysteries" ? "active" : ""}" data-tab="mysteries">${icon("mysteries")} Mysteries <span class="count">${store.all("mysteries").length}</span></button>
        </div>

        <div class="toolbar">
            <div class="filter-input">${icon("search")}<input data-sec-search placeholder="Search titles, truth, clues…" value="${esc(state.query)}" /></div>
            <select class="filter-sel" data-sec-status><option value="">Any status</option></select>
            <select class="filter-sel" data-sec-canon><option value="">Any canon</option>${CANON.map((c) => `<option value="${c.value}">${c.label}</option>`).join("")}</select>
            <span class="spacer"></span>
            <span class="result-count" data-sec-count></span>
        </div>

        <div data-sec-grid></div>
    </div>`;
}

const statusOptions = () => (tab === "secrets" ? SECRET_STATUS : MYSTERY_STATUS);
const currentRecords = () => store.all(tab).filter((r) => !r.archived);

export function mount(root, ctx) {
    const grid = root.querySelector("[data-sec-grid]");
    const statusSel = root.querySelector("[data-sec-status]");

    const fillStatus = () => {
        statusSel.innerHTML = `<option value="">Any status</option>${statusOptions().map((s) => `<option value="${s.value}">${s.label}</option>`).join("")}`;
        statusSel.value = state.status;
    };

    const draw = () => {
        fillStatus();
        root.querySelector("[data-new-label]").textContent = tab === "secrets" ? "New secret" : "New mystery";
        let list = currentRecords();
        const q = state.query.trim().toLowerCase();
        if (state.status) list = list.filter((r) => r.status === state.status);
        if (state.canon) list = list.filter((r) => (r.canon || "confirmed") === state.canon);
        if (q) {
            list = list.filter((r) => {
                const hay = tab === "secrets"
                    ? `${r.title} ${r.description || ""} ${r.truth || ""} ${(r.evidence || []).map((e) => e.text || e).join(" ")}`
                    : `${r.title} ${r.description || ""} ${(r.clues || []).map((e) => e.text || e).join(" ")} ${(r.theories || []).map((e) => e.text || e).join(" ")}`;
                return hay.toLowerCase().includes(q);
            });
        }
        list.sort((a, b) => (b.importance || 0) - (a.importance || 0) || a.title.localeCompare(b.title));
        root.querySelector("[data-sec-count]").textContent = `${list.length} of ${currentRecords().length}`;
        if (!list.length) {
            grid.innerHTML = emptyState({
                icon: tab === "secrets" ? "lock" : "mysteries",
                title: `No ${tab} match`,
                text: "Adjust filters or record something new.",
                action: `<button class="btn sm primary" data-new-record>${icon("plus")} New ${tab === "secrets" ? "secret" : "mystery"}</button>`,
            });
            return;
        }
        grid.innerHTML = tab === "secrets" ? `<div class="secret-grid">${list.map(secretCard).join("")}</div>` : `<div class="mystery-grid">${list.map((m) => mysteryCard(m)).join("")}</div>`;
    };

    const refresh = () => {
        draw();
        if (redrawHook) redrawHook();
    };
    redrawHook = refresh;

    root.querySelectorAll("[data-tab]").forEach((btn) =>
        btn.addEventListener("click", () => {
            tab = btn.dataset.tab;
            state.status = "";
            root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
            draw();
        }),
    );
    root.querySelector("[data-sec-search]").addEventListener("input", debounce((e) => { state.query = e.target.value; draw(); }, 150));
    statusSel.addEventListener("change", (e) => { state.status = e.target.value; draw(); });
    root.querySelector("[data-sec-canon]").addEventListener("change", (e) => { state.canon = e.target.value; draw(); });

    root.addEventListener("click", (e) => {
        if (e.target.closest("[data-new-record]")) {
            openEntityForm({ type: tab, onSaved: () => { draw(); ctx.refresh(); } });
            return;
        }
        const secret = e.target.closest("[data-secret]");
        if (secret) { openSecret(secret.dataset.secret, refresh, ctx); return; }
        const mystery = e.target.closest("[data-mystery]");
        if (mystery) { e.preventDefault(); openMystery(mystery.dataset.mystery, refresh, ctx); return; }
        const ev = e.target.closest("[data-mystery-event]");
        if (ev) { openQuickView("events", ev.dataset.mysteryEvent); return; }
    });

    draw();
    if (ctx.query.open) {
        const rec = store.get("secrets", ctx.query.open) || store.get("mysteries", ctx.query.open);
        if (rec) {
            tab = store.get("secrets", ctx.query.open) ? "secrets" : "mysteries";
            draw();
            setTimeout(() => (tab === "secrets" ? openSecret(rec.key, refresh, ctx) : openMystery(rec.key, refresh, ctx)), 200);
        }
    }

    return () => {
        redrawHook = null;
    };
}

/* ------------------------------------------------------------------ cards */

function secretCard(s) {
    const holders = (s.holderIds || []).length;
    const suspects = (s.suspectIds || []).length;
    const total = Math.max(1, store.all("characters").length);
    const statusColor = s.status === "revealed" ? "var(--r-ally)" : s.status === "partial" ? "var(--gold)" : "var(--n-secret)";
    return `<button class="secret-card" data-secret="${esc(s.key)}" style="--sc:${statusColor}">
        <div class="secret-card-top">
            <span class="secret-lock">${icon(s.status === "revealed" ? "eye" : "lock")}</span>
            <span class="row gap-4">${statusPill(s.status)}${canonBadge(s.canon)}</span>
            ${importanceBars(s.importance)}
        </div>
        <h4>${esc(s.title)}</h4>
        <p class="clamp-2">${esc(s.description || "No public-facing description yet.")}</p>
        <div class="secret-knowledge-bar" title="${holders} know, ${suspects} suspect">
            <span style="width:${Math.round((holders / total) * 100)}%" class="skb-known"></span>
            <span style="width:${Math.round((suspects / total) * 100)}%" class="skb-suspect"></span>
        </div>
        <div class="secret-meta">
            <span>${icon("eye")} ${holders} know</span>
            <span>${icon("help")} ${suspects} suspect</span>
            <span class="dim">${icon("clock")} ${s.updatedAt ? fmtDateShort(s.updatedAt) : fmtDateShort(s.createdAt || "")}</span>
        </div>
    </button>`;
}

/* --------------------------------------------------------------- drawers */

function openSecret(key, refresh, ctx) {
    const s = store.get("secrets", key);
    if (!s) return;
    const holders = (s.holderIds || []).map((id) => store.get("characters", id)).filter(Boolean);
    const suspects = (s.suspectIds || []).map((id) => store.get("characters", id)).filter(Boolean);
    const unaware = (s.unawareIds || []).map((id) => store.get("characters", id)).filter(Boolean);
    const log = (s.knowledgeLog || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const relatedEvents = (s.relatedEventIds || []).map((id) => store.get("events", id)).filter(Boolean);
    const relatedMysteries = (s.relatedMysteryIds || []).map((id) => store.get("mysteries", id)).filter(Boolean);

    openDrawer({
        title: s.title,
        subtitle: `Secret · ${(SECRET_STATUS.find((x) => x.value === s.status) || {}).label || s.status}`,
        width: "min(680px, 96vw)",
        body: `<div class="drawer-record">
            <div class="row wrap gap-6">${statusPill(s.status)}${canonBadge(s.canon)}${importanceBars(s.importance, "lg")}<span class="chip">${icon("clock")} Updated ${esc(s.updatedAt ? fmtDate(s.updatedAt) : "—")}</span></div>

            <section class="dr-section">
                <h5>${icon("book")} Public-facing version</h5>
                <p>${esc(s.description || "No description written.")}</p>
            </section>

            <section class="dr-section truth-section" data-truth-section>
                <div class="row between"><h5>${icon("key")} The truth</h5><button class="btn xs ghost" data-toggle-truth>${icon("eyeOff")} <span>Reveal</span></button></div>
                <div class="truth-body" data-truth-body><p>${esc(s.truth || "The truth has not been written yet.")}</p></div>
            </section>

            <section class="dr-section">
                <div class="row between"><h5>${icon("users")} Knowledge matrix</h5><button class="btn xs ghost" data-add-knower>${icon("plus")} Record change</button></div>
                <div class="knowledge-cols">
                    <div class="knowledge-col"><div class="kc-head known">${icon("eye")} Knows <span>${holders.length}</span></div>
                        ${holders.map((c) => `<a class="kc-person" href="#/characters/${esc(c.key)}">${avatarHtml(c.name, { username: c.username, size: "xs" })}<span>${esc(c.name)}</span></a>`).join("") || `<div class="tiny dim">Nobody confirmed.</div>`}
                    </div>
                    <div class="knowledge-col"><div class="kc-head suspected">${icon("help")} Suspects <span>${suspects.length}</span></div>
                        ${suspects.map((c) => `<a class="kc-person" href="#/characters/${esc(c.key)}">${avatarHtml(c.name, { username: c.username, size: "xs" })}<span>${esc(c.name)}</span></a>`).join("") || `<div class="tiny dim">Nobody suspects yet.</div>`}
                    </div>
                    <div class="knowledge-col"><div class="kc-head unaware">${icon("eyeOff")} Unaware <span>${unaware.length}</span></div>
                        ${unaware.slice(0, 8).map((c) => `<a class="kc-person" href="#/characters/${esc(c.key)}">${avatarHtml(c.name, { username: c.username, size: "xs" })}<span>${esc(c.name)}</span></a>`).join("") || `<div class="tiny dim">Nobody marked unaware.</div>`}
                        ${unaware.length > 8 ? `<div class="tiny dim">+${unaware.length - 8} more</div>` : ""}
                    </div>
                </div>
            </section>

            ${log.length ? `<section class="dr-section"><h5>${icon("history")} Knowledge history</h5><div class="knowledge-log">${log.map((l) => `<div class="kl-row"><span class="kl-state ${esc(l.state)}">${esc(l.state === "confirmed" ? "Learned" : l.state === "suspected" ? "Suspected" : "Unaware")}</span><b>${esc(store.nameOf("characters", l.characterId) || "Unknown")}</b><span class="tiny dim">${esc(l.date ? fmtDate(l.date) : "")}</span><span class="tiny dim grow">${esc(l.note || "")}</span></div>`).join("")}</div></section>` : ""}

            ${(s.evidence || []).length ? `<section class="dr-section"><h5>${icon("search")} Existing evidence</h5><ul class="clean-list">${s.evidence.map((e) => `<li>${esc(typeof e === "string" ? e : e.text || "")}</li>`).join("")}</ul></section>` : ""}

            ${s.revealImpact ? `<section class="dr-section"><h5>${icon("alert")} If this is revealed</h5><p>${esc(s.revealImpact)}</p>${s.revealDate ? `<div class="tiny dim">${icon("clock")} Planned reveal ${esc(fmtDate(s.revealDate))}</div>` : ""}</section>` : ""}

            ${relatedEvents.length || relatedMysteries.length ? `<section class="dr-section"><h5>${icon("links")} Connected threads</h5>
                <div class="stack gap-4">
                    ${relatedEvents.map((e) => `<button class="list-line" data-open-event="${esc(e.key)}">${icon("events")}<span>${esc(e.title)}</span><span class="tiny dim">${esc(e.date ? fmtDateShort(e.date) : "")}</span></button>`).join("")}
                    ${relatedMysteries.map((m) => `<button class="list-line" data-open-mystery="${esc(m.key)}">${icon("mysteries")}<span>${esc(m.title)}</span>${statusPill(m.status)}</button>`).join("")}
                </div>
               </section>` : ""}
        </div>`,
        foot: `<button class="btn ghost" data-sec-edit>${icon("edit")} Edit</button><span class="spacer"></span><button class="btn danger ghost" data-sec-delete>${icon("trash")} Delete</button>`,
        onMount: (el, close) => {
            el.querySelector("[data-toggle-truth]").onclick = (e) => {
                const body = el.querySelector("[data-truth-body]");
                const hidden = body.classList.toggle("is-hidden");
                e.currentTarget.querySelector("span").textContent = hidden ? "Reveal" : "Hide";
                e.currentTarget.innerHTML = `${icon(hidden ? "eyeOff" : "eye")} <span>${hidden ? "Reveal" : "Hide"}</span>`;
            };
            el.querySelector("[data-add-knower]").onclick = () => {
                close();
                openKnowledgeForm(s, refresh, ctx);
            };
            el.querySelector("[data-sec-edit]").onclick = () => {
                close();
                openEntityForm({ type: "secrets", record: store.get("secrets", s.key), onSaved: () => { refresh(); ctx.refresh(); } });
            };
            el.querySelector("[data-sec-delete]").onclick = () => {
                confirmDialog({
                    title: "Delete this secret?",
                    message: `Delete <b>${esc(s.title)}</b> and its knowledge history? This cannot be undone.`,
                    confirmLabel: "Delete secret",
                    onConfirm: () => {
                        store.remove("secrets", { key: s.key });
                        close();
                        refresh();
                        toast("Secret deleted.", "success");
                    },
                });
            };
            el.querySelectorAll("[data-open-event]").forEach((b) => (b.onclick = () => { close(); openQuickView("events", b.dataset.openEvent); }));
            el.querySelectorAll("[data-open-mystery]").forEach((b) => (b.onclick = () => { close(); openMystery(b.dataset.openMystery, refresh, ctx); }));
            el.querySelectorAll("a[href^='#/characters/']").forEach((a) => a.addEventListener("click", () => close()));
        },
    });
}

function openKnowledgeForm(s, refresh, ctx) {
    const characters = store.all("characters").sort((a, b) => a.name.localeCompare(b.name));
    openModal({
        title: "Record a knowledge change",
        subtitle: "This updates the knowledge matrix and preserves the change in the secret's history.",
        body: `<div class="field"><label>Character</label><select class="input" data-k-char><option value="">Select…</option>${characters.map((c) => `<option value="${esc(c.key)}">${esc(c.name)}</option>`).join("")}</select></div>
               <div class="field"><label>What do they know?</label><select class="input" data-k-state><option value="confirmed">Knows the truth (confirmed)</option><option value="suspected">Suspects something</option><option value="unaware">Is completely unaware</option></select></div>
               <div class="field"><label>Date</label><input class="input" type="date" data-k-date /></div>
               <div class="field"><label>How did they learn it?</label><input class="input" data-k-note placeholder="Overheard a conversation, found a letter…" /></div>`,
        foot: `<button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-save>Record change</button>`,
        onMount: (modal, close) => {
            modal.querySelector("[data-cancel]").onclick = close;
            modal.querySelector("[data-save]").onclick = () => {
                const id = modal.querySelector("[data-k-char]").value;
                if (!id) return toast("Choose a character.", "error");
                const st = modal.querySelector("[data-k-state]").value;
                const date = modal.querySelector("[data-k-date]").value;
                const note = modal.querySelector("[data-k-note]").value.trim();
                const known = new Set(s.holderIds || []);
                const sus = new Set(s.suspectIds || []);
                const un = new Set(s.unawareIds || []);
                known.delete(id); sus.delete(id); un.delete(id);
                if (st === "confirmed") known.add(id);
                else if (st === "suspected") sus.add(id);
                else un.add(id);
                store.save("secrets", {
                    ...s,
                    holderIds: [...known],
                    suspectIds: [...sus],
                    unawareIds: [...un],
                    knowledgeLog: [...(s.knowledgeLog || []), { characterId: id, state: st, date, note }],
                });
                close();
                toast("Knowledge updated.", "success");
                refresh();
                setTimeout(() => openSecret(s.key, refresh, ctx), 120);
            };
        },
    });
}

function openMystery(key, refresh, ctx) {
    const m = store.get("mysteries", key);
    if (!m) return;
    const involved = (m.characterIds || []).map((id) => store.get("characters", id)).filter(Boolean);
    const events = (m.eventIds || []).map((id) => store.get("events", id)).filter(Boolean);
    const locations = (m.locationIds || []).map((id) => store.get("locations", id)).filter(Boolean);
    const list = (arr) => (arr || []).length ? `<ul class="clean-list">${arr.map((x) => `<li>${esc(typeof x === "string" ? x : x.text || "")}</li>`).join("")}</ul>` : `<div class="tiny dim">Nothing recorded.</div>`;

    openDrawer({
        title: m.title,
        subtitle: `Mystery · ${(MYSTERY_STATUS.find((x) => x.value === m.status) || {}).label || m.status}`,
        width: "min(660px, 96vw)",
        body: `<div class="drawer-record">
            <div class="row wrap gap-6">${statusPill(m.status)}${canonBadge(m.canon)}${importanceBars(m.importance, "lg")}${m.origin ? `<span class="chip">${icon("compass")} ${esc(m.origin)}</span>` : ""}</div>
            <section class="dr-section"><h5>${icon("book")} The question</h5><p>${esc(m.description || "No description written.")}</p></section>
            <section class="dr-section"><h5>${icon("search")} Known clues</h5>${list(m.clues)}</section>
            <section class="dr-section"><h5>${icon("sparkles")} Theories at the table</h5>${list(m.theories)}</section>
            <section class="dr-section"><h5>${icon("check")} Confirmed information</h5>${list(m.confirmed)}</section>
            <section class="dr-section"><h5>${icon("help")} Unanswered questions</h5>${list(m.questions)}</section>
            ${m.revealPlan ? `<section class="dr-section"><h5>${icon("flag")} Planned reveal</h5><p>${esc(m.revealPlan)}</p></section>` : ""}
            ${involved.length ? `<section class="dr-section"><h5>${icon("characters")} Characters involved</h5><div class="row wrap gap-4">${involved.map((c) => `<a class="chip" href="#/characters/${esc(c.key)}">${avatarHtml(c.name, { username: c.username, size: "xs" })}${esc(c.name)}</a>`).join("")}</div></section>` : ""}
            ${events.length ? `<section class="dr-section"><h5>${icon("events")} Related events</h5><div class="stack gap-4">${events.map((e) => `<button class="list-line" data-open-event="${esc(e.key)}">${icon(categoryIcon(e.category))}<span>${esc(e.title)}</span><span class="tiny dim mono">${esc(e.date ? fmtDateShort(e.date) : "")}</span></button>`).join("")}</div></section>` : ""}
            ${locations.length ? `<section class="dr-section"><h5>${icon("pin")} Related locations</h5><div class="row wrap gap-4">${locations.map((l) => `<a class="chip" href="#/locations/${esc(l.key)}">${esc(l.name)}</a>`).join("")}</div></section>` : ""}
            <section class="dr-section"><h5>${icon("flag")} Move the investigation</h5><div class="row wrap gap-4">${MYSTERY_STATUS.map((st) => `<button class="btn xs ${m.status === st.value ? "primary" : ""}" data-set-mystery-status="${st.value}">${st.label}</button>`).join("")}</div></section>
        </div>`,
        foot: `<button class="btn ghost" data-mys-edit>${icon("edit")} Edit</button><span class="spacer"></span><button class="btn primary" data-mys-clue>${icon("plus")} Add clue</button><button class="btn danger ghost" data-mys-delete>${icon("trash")} Delete</button>`,
        onMount: (el, close) => {
            el.querySelector("[data-mys-edit]").onclick = () => { close(); openEntityForm({ type: "mysteries", record: store.get("mysteries", m.key), onSaved: () => { refresh(); ctx.refresh(); } }); };
            el.querySelector("[data-mys-clue]").onclick = () => {
                close();
                openModal({
                    title: "Add a clue",
                    body: `<div class="field"><label>Clue discovered</label><textarea class="input" rows="3" data-clue-text></textarea></div>`,
                    foot: `<button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-save>Add clue</button>`,
                    onMount: (modal, closeModal) => {
                        modal.querySelector("[data-cancel]").onclick = closeModal;
                        modal.querySelector("[data-save]").onclick = () => {
                            const text = modal.querySelector("[data-clue-text]").value.trim();
                            if (!text) return toast("Write the clue first.", "error");
                            store.save("mysteries", { ...m, clues: [...(m.clues || []), text] });
                            closeModal();
                            toast("Clue added.", "success");
                            refresh();
                            setTimeout(() => openMystery(m.key, refresh, ctx), 120);
                        };
                    },
                });
            };
            el.querySelector("[data-mys-delete]").onclick = () => {
                confirmDialog({
                    title: "Delete this mystery?",
                    message: `Delete <b>${esc(m.title)}</b> and everything recorded about it?`,
                    confirmLabel: "Delete mystery",
                    onConfirm: () => { store.remove("mysteries", { key: m.key }); close(); refresh(); toast("Mystery deleted.", "success"); },
                });
            };
            el.querySelectorAll("[data-set-mystery-status]").forEach((btn) => {
                btn.onclick = () => {
                    store.save("mysteries", { ...m, status: btn.dataset.setMysteryStatus });
                    el.querySelectorAll("[data-set-mystery-status]").forEach((b) => b.classList.toggle("primary", b === btn));
                    toast(`Mystery marked ${btn.textContent.trim()}.`, "success");
                    refresh();
                };
            });
            el.querySelectorAll("[data-open-event]").forEach((b) => (b.onclick = () => { close(); openQuickView("events", b.dataset.openEvent); }));
            el.querySelectorAll("a[href^='#/characters/'], a[href^='#/locations/']").forEach((a) => a.addEventListener("click", () => close()));
        },
    });
}
