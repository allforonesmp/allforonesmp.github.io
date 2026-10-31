/* Settings: appearance, access, backups and demonstration data */

import { store, COLLECTIONS } from "../core/store.js";
import { bus } from "../core/util.js";
import { icon } from "../core/icons.js";
import { esc, fmtDate, downloadFile, readFileAsText, debounce } from "../core/util.js";
import { EDGE_KINDS } from "../core/schema.js";
import { buildDemo, DEMO_TOTALS } from "../core/demo.js";
import { openModal, confirmDialog, toast } from "../components/ui.js";

export const flush = false;

export function heading() {
    return "Settings";
}

export function render() {
    const p = store.prefs();
    const st = store.state;
    const user = st.user || {};
    const sync = st.sync || {};
    const access = st.data.access || [];
    const counts = COLLECTIONS.filter((c) => c !== "activity" && c !== "access").map((c) => ({ key: c, n: (st.data[c] || []).length }));
    const total = counts.reduce((n, c) => n + c.n, 0);

    return `<div class="page settings-page">
        <div class="page-head">
            <div>
                <div class="eyebrow">Control room</div>
                <h2>Settings</h2>
                <p>Appearance, access, backups and the demonstration archive. Everything here writes to this project only.</p>
            </div>
            <div class="actions"><button class="btn" data-export>${icon("download")} Backup everything</button></div>
        </div>

        <div class="settings-grid">
            <section class="panel">
                <div class="panel-head"><h3>${icon("user")} Account</h3></div>
                <div class="panel-body">
                    <div class="account-card">
                        <div class="account-avatar">${esc((user.email || "?").slice(0, 2).toUpperCase())}</div>
                        <div><b>${esc(user.email || "Local session")}</b><span class="tiny dim">${esc(user.role || "author")} · ${st.driverKind === "local" ? "offline cache" : "connected to BreadBackend"}</span></div>
                    </div>
                    <div class="meta-list" style="margin-top:12px">
                        <div><span>Project</span><b class="mono">allforone-story-plan</b></div>
                        <div><span>Sync</span><b class="status-inline ${esc(sync.status || "idle")}">${esc(sync.status || "idle")}${sync.pending ? ` · ${sync.pending} queued` : ""}</b></div>
                        <div><span>Last synced</span><b>${esc(sync.lastSync ? fmtDate(sync.lastSync) : "never")}</b></div>
                        <div><span>Records</span><b>${total}</b></div>
                    </div>
                    ${sync.error ? `<div class="inline-warn">${icon("alert")} ${esc(sync.error)} <button class="btn xs" data-retry>Retry</button></div>` : ""}
                    <div class="row gap-6" style="margin-top:14px">
                        <button class="btn sm" data-retry>${icon("refresh")} Sync now</button>
                        <button class="btn sm ghost" data-signout>${icon("logout")} Sign out</button>
                    </div>
                </div>
            </section>

            <section class="panel">
                <div class="panel-head"><h3>${icon("sliders")} Appearance</h3></div>
                <div class="panel-body">
                    <div class="setting-row"><div><b>Interface density</b><span class="tiny dim">Comfortable is roomier; compact fits more on screen.</span></div>
                        <div class="segmented"><button class="seg ${p.density !== "compact" ? "active" : ""}" data-density="comfortable">Comfortable</button><button class="seg ${p.density === "compact" ? "active" : ""}" data-density="compact">Compact</button></div>
                    </div>
                    <div class="setting-row"><div><b>Collapse sidebar by default</b><span class="tiny dim">More room for the story map.</span></div>
                        <label class="switch"><input type="checkbox" data-pref="sidebarCollapsed" ${p.sidebarCollapsed ? "checked" : ""} /><span></span></label>
                    </div>
                    <div class="setting-row"><div><b>Connection labels</b><span class="tiny dim">Show relationship type on graph edges.</span></div>
                        <label class="switch"><input type="checkbox" data-pref="showEdgeLabels" ${p.showEdgeLabels ? "checked" : ""} /><span></span></label>
                    </div>
                    <div class="setting-row"><div><b>Node labels</b><span class="tiny dim">Show names under graph nodes.</span></div>
                        <label class="switch"><input type="checkbox" data-pref="showNodeLabels" ${p.showNodeLabels ? "checked" : ""} /><span></span></label>
                    </div>
                    <div class="setting-sub"><b>Connection colours</b><span class="tiny dim">Applies to every map and diagram.</span></div>
                    <div class="edge-colour-grid">
                        ${EDGE_KINDS.map((k) => `<label class="edge-colour"><input type="color" data-edge-colour="${k.value}" value="${esc(p.edgeColors[k.value] || k.color)}" /><span>${esc(k.label)}</span></label>`).join("")}
                    </div>
                    <button class="btn sm ghost" data-reset-prefs>${icon("refresh")} Restore default appearance</button>
                </div>
            </section>

            <section class="panel">
                <div class="panel-head"><h3>${icon("lock")} Access</h3><span class="sub">who can open this story plan</span></div>
                <div class="panel-body">
                    <p class="small dim">Add the email of anyone allowed in. They create their own password on the sign-in screen — you never share one.</p>
                    ${st.accessSupported ? `
                    <div class="access-list">
                        ${access.length ? access.map((a) => `<div class="access-row ${a.active === false ? "revoked" : ""}">
                            <div class="access-who"><b>${esc(a.email)}</b><span class="tiny dim">${esc(a.role || "editor")}${a.active === false ? " · revoked" : ""}</span></div>
                            <div class="row gap-4">
                                ${a.active === false ? `<button class="btn xs" data-access-restore="${esc(a.key)}">Restore</button>` : `<button class="btn xs ghost" data-access-revoke="${esc(a.key)}">Revoke</button>`}
                                <button class="icon-btn" data-access-remove="${esc(a.key)}" title="Remove">${icon("trash")}</button>
                            </div>
                        </div>`).join("") : `<div class="quiet">No access entries yet. The first account that signs in becomes the owner.</div>`}
                    </div>
                    <div class="row gap-6" style="margin-top:10px">
                        <input class="input grow" data-access-email placeholder="writer@example.com" />
                        <select class="input" style="max-width:130px" data-access-role><option value="editor">Editor</option><option value="viewer">Viewer</option><option value="owner">Owner</option></select>
                        <button class="btn primary" data-access-add>${icon("plus")} Allow</button>
                    </div>` : `<div class="inline-warn">${icon("info")} This backend does not expose an access collection, so entry is controlled by the backend itself.</div>`}
                </div>
            </section>

            <section class="panel">
                <div class="panel-head"><h3>${icon("database")} Data & backups</h3></div>
                <div class="panel-body">
                    <div class="data-count-grid">${counts.map((c) => `<div><b>${c.n}</b><span>${esc(c.key)}</span></div>`).join("")}</div>
                    <div class="setting-row"><div><b>Export a full backup</b><span class="tiny dim">JSON with every record, canon history and preference.</span></div><button class="btn sm" data-export>${icon("download")} Export</button></div>
                    <div class="setting-row"><div><b>Restore from a backup</b><span class="tiny dim">Merge adds to what exists; replace swaps everything.</span></div>
                        <div class="row gap-4"><button class="btn sm" data-import-merge>${icon("upload")} Merge</button><button class="btn sm ghost" data-import-replace>${icon("upload")} Replace</button></div>
                        <input type="file" accept="application/json,.json" data-import-file hidden />
                    </div>
                    <div class="setting-row"><div><b>Demonstration archive</b><span class="tiny dim">${DEMO_TOTALS.characters} characters, ${DEMO_TOTALS.events} events and ${DEMO_TOTALS.storylines} storylines marked <code>demo</code>, removable in one click.</span></div>
                        ${st.demoPresent ? `<button class="btn sm danger ghost" data-remove-demo>${icon("trash")} Remove demo data</button>` : `<button class="btn sm" data-seed-demo>${icon("sparkles")} Load demo world</button>`}
                    </div>
                    <div class="setting-row"><div><b>Clear cache</b><span class="tiny dim">Forget the local copy and reload from the backend.</span></div><button class="btn sm ghost" data-clear-cache>${icon("refresh")} Clear cache</button></div>
                    <div class="danger-zone">
                        <div><b>${icon("alert")} Delete all story data</b><span class="tiny dim">Characters, events, maps, links and history. Account and access entries are kept.</span></div>
                        <button class="btn sm danger" data-wipe>Delete everything</button>
                    </div>
                </div>
            </section>

            <section class="panel settings-about">
                <div class="panel-head"><h3>${icon("info")} About</h3></div>
                <div class="panel-body prose">
                    <p><b>AllForOne Story Plan</b> — a living canon bible for a Minecraft SMP. Built as a static site on GitHub Pages, with data persisted through BreadBackend so every writer sees the same world.</p>
                    <div class="meta-list">
                        <div><span>Version</span><b>2.0 · static build</b></div>
                        <div><span>Storage</span><b>BreadBackend · allforone-story-plan</b></div>
                        <div><span>Offline behaviour</span><b>Changes queue locally and retry automatically</b></div>
                        <div><span>Keyboard</span><b><kbd>⌘K</kbd> search · <kbd>G</kbd> then <kbd>M</kbd> map</b></div>
                    </div>
                    <p class="tiny dim">Canon changes never overwrite the previous version — retcons and relationship evolutions are appended, not replaced.</p>
                </div>
            </section>
        </div>
    </div>`;
}

export function mount(root, ctx) {
    const st = store.state;

    root.querySelector("[data-export]")?.addEventListener("click", () => {
        const payload = store.exportData();
        downloadFile(`allforone-story-plan-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
        toast("Backup downloaded.", "success");
    });

    root.querySelectorAll("[data-retry]").forEach((b) => b.addEventListener("click", () => { toast("Retrying connection…"); store.retry(); }));
    root.querySelector("[data-signout]")?.addEventListener("click", () =>
        confirmDialog({
            title: "Sign out?",
            message: "Your local cache stays on this device, but you will need your email and password to return.",
            confirmLabel: "Sign out",
            danger: false,
            onConfirm: () => store.signOut(),
        }),
    );

    root.querySelectorAll("[data-density]").forEach((btn) =>
        btn.addEventListener("click", () => {
            store.setPref("density", btn.dataset.density);
            document.documentElement.dataset.density = btn.dataset.density;
            root.querySelectorAll("[data-density]").forEach((b) => b.classList.toggle("active", b === btn));
        }),
    );
    root.querySelectorAll("[data-pref]").forEach((input) =>
        input.addEventListener("change", () => {
            store.setPref(input.dataset.pref, input.checked);
            if (input.dataset.pref === "sidebarCollapsed") document.getElementById("app")?.classList.toggle("collapsed", input.checked);
            if (input.dataset.pref === "showEdgeLabels" || input.dataset.pref === "showNodeLabels") bus.emit("change", { type: "*", action: "labels" });
        }),
    );
    root.querySelectorAll("[data-edge-colour]").forEach((input) =>
        input.addEventListener("input", debounce(() => {
            store.setEdgeColor(input.dataset.edgeColour, input.value);
            bus.emit("change", { type: "*", action: "edge-colors" });
        }, 160)),
    );
    root.querySelector("[data-reset-prefs]")?.addEventListener("click", () => {
        store.resetPrefs();
        document.documentElement.dataset.density = store.prefs().density || "comfortable";
        toast("Appearance restored.", "success");
        ctx.refresh();
    });

    /* access */
    root.querySelector("[data-access-add]")?.addEventListener("click", async () => {
        const email = root.querySelector("[data-access-email]").value.trim();
        const role = root.querySelector("[data-access-role]").value;
        if (!email) return toast("Enter an email address.", "error");
        try {
            await store.grantAccess(email, role);
            toast(`${email} allowed as ${role}.`, "success");
            ctx.refresh();
        } catch (err) {
            toast(err.message || "Could not update access.", "error");
        }
    });
    root.querySelectorAll("[data-access-revoke]").forEach((b) =>
        b.addEventListener("click", async () => {
            await store.revokeAccess(b.dataset.accessRevoke);
            toast("Access revoked.", "success");
            ctx.refresh();
        }),
    );
    root.querySelectorAll("[data-access-restore]").forEach((b) =>
        b.addEventListener("click", async () => {
            const row = store.get("access", b.dataset.accessRestore);
            if (row) await store.save("access", { ...row, active: true });
            toast("Access restored.", "success");
            ctx.refresh();
        }),
    );
    root.querySelectorAll("[data-access-remove]").forEach((b) =>
        b.addEventListener("click", () => {
            const row = store.get("access", b.dataset.accessRemove);
            if (!row) return;
            confirmDialog({
                title: "Remove this access entry?",
                message: `Remove <b>${esc(row.email)}</b> from the access list? They can be re-added at any time.`,
                confirmLabel: "Remove",
                onConfirm: async () => { await store.removeAccess(row.key); toast("Entry removed.", "success"); ctx.refresh(); },
            });
        }),
    );

    /* import */
    let importMode = "merge";
    const fileInput = root.querySelector("[data-import-file]");
    root.querySelector("[data-import-merge]")?.addEventListener("click", () => { importMode = "merge"; fileInput.click(); });
    root.querySelector("[data-import-replace]")?.addEventListener("click", () => {
        confirmDialog({
            title: "Replace all data?",
            message: "Importing in replace mode deletes every existing record before restoring the backup. Export a backup first.",
            confirmLabel: "Choose backup file",
            onConfirm: () => { importMode = "replace"; fileInput.click(); },
        });
    });
    fileInput?.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        fileInput.value = "";
        if (!file) return;
        try {
            const payload = JSON.parse(await readFileAsText(file));
            await store.importData(payload, { mode: importMode });
            toast(`Backup imported (${importMode}).`, "success");
            ctx.refresh();
        } catch (err) {
            toast(err.message || "That file could not be imported.", "error");
        }
    });

    /* demo + danger */
    root.querySelector("[data-seed-demo]")?.addEventListener("click", () =>
        confirmDialog({
            title: "Load the demonstration world?",
            message: `This adds ${DEMO_TOTALS.characters} characters, ${DEMO_TOTALS.events} events and ${DEMO_TOTALS.storylines} storylines, each clearly marked as demo data. You can remove them all again in one click.`,
            confirmLabel: "Load demo data",
            danger: false,
            onConfirm: async () => {
                try {
                    const n = await store.seedDemo(buildDemo);
                    toast(`Demo world loaded — ${n} records.`, "success");
                    ctx.refresh();
                } catch (err) {
                    toast(err.message || "Could not load demo data.", "error");
                }
            },
        }),
    );
    root.querySelector("[data-remove-demo]")?.addEventListener("click", () =>
        confirmDialog({
            title: "Remove all demo data?",
            message: "Every record tagged as demonstration content is deleted. Your own records are untouched.",
            confirmLabel: "Remove demo data",
            onConfirm: async () => {
                const n = await store.removeDemo();
                toast(`Removed ${n} demo records.`, "success");
                ctx.refresh();
            },
        }),
    );
    root.querySelector("[data-clear-cache]")?.addEventListener("click", () =>
        confirmDialog({
            title: "Clear local cache?",
            message: "This device will reload every record from the backend. Unsaved offline edits may be lost — sync first.",
            confirmLabel: "Clear cache",
            onConfirm: async () => {
                localStorage.removeItem("afo_story_plan_cache_v2");
                await store.pull({ initial: true });
                toast("Cache cleared and reloaded.", "success");
                ctx.refresh();
            },
        }),
    );
    root.querySelector("[data-wipe]")?.addEventListener("click", () =>
        confirmDialog({
            title: "Delete all story data?",
            message: "This permanently deletes every character, event, storyline, relationship, secret, location, item and saved map in this project. Access entries are kept.",
            detail: "Export a backup first if there is any chance you will want this world back.",
            confirmLabel: "Delete everything",
            requireText: "DELETE",
            onConfirm: async () => {
                await store.clearAll();
                toast("All story data deleted.", "success");
                ctx.refresh();
            },
        }),
    );
}
