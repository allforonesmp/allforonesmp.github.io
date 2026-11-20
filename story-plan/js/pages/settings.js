/* Story Planner — Settings: account, sessions, theme, autosave, members,
   export/import, and an honest report of backend capabilities. */

import { el, icon, downloadFile, fmtDateTime, relTime } from "../util.js";
import { docs, state, prefs, savePrefs, exportPayload, loadCollection, flushPending, EXPORT_EXTRA } from "../store.js";
import { COLLECTIONS, auth, db } from "../api.js";
import { ENTITIES } from "../schema.js";
import { pageHead, card, badge, toast, toastError, confirmDialog, emptyState, openModal, closeModal } from "../components/ui.js";
import { getUser, getMember, signOut, isApprover } from "../auth.js";
import { listRequests, decide, removeRequest, approvedEmails, rulesFor, OWNER_EMAIL } from "../access.js";
import { openWorkspaceSettings } from "./dashboard.js";

export function settingsPage() {
    const root = el("div", { class: "page" });
    const user = getUser();
    const member = getMember();

    root.appendChild(pageHead("Settings", "Account, sessions, appearance, saving behaviour, members and data export."));

    /* ---------------- account ---------------- */
    root.appendChild(
        card({
            title: "Account",
            iconName: "user",
            body: [
                el("div", { class: "settings-row" }, [
                    el("div", { class: "sr-label" }, [el("strong", { text: user?.email || "—" }), el("span", { text: `Role: ${member?.role || "editor"} · Status: ${member?.status || "active"}` })]),
                    el("div", { class: "sr-control" }, [
                        el("span", {
                            class: "badge success",
                            text: isApprover() ? "Owner — approves access" : "Approved",
                            title: "The owner approves every account and every new sign-in location.",
                        }),
                    ]),
                ]),
                el("div", { class: "settings-row" }, [
                    el("div", { class: "sr-label" }, [el("strong", { text: "Sign out" }), el("span", { text: "Ends this session on this device." })]),
                    el("div", { class: "sr-control" }, [
                        el("button", {
                            class: "btn btn-danger-ghost btn-sm",
                            type: "button",
                            onclick: async () => {
                                await flushPending();
                                await signOut();
                            },
                        }, [icon("logout"), "Sign out"]),
                    ]),
                ]),
            ],
        })
    );

    /* ---------------- access approvals (owner only) ---------------- */
    if (isApprover()) root.appendChild(approvalsCard());

    /* ---------------- sessions ---------------- */
    const sessionHost = el("div", {}, [el("p", { class: "field-hint", text: "Loading sessions…" })]);
    root.appendChild(
        card({
            title: "Active sessions",
            iconName: "lock",
            body: [sessionHost],
            actions: [
                el("button", {
                    class: "btn btn-ghost btn-sm",
                    type: "button",
                    onclick: async () => {
                        const ok = await confirmDialog({ title: "Sign out other devices?", message: "Every other session for this account will be revoked. This device stays signed in.", confirmLabel: "Revoke others" });
                        if (!ok) return;
                        try {
                            await auth.revokeOtherSessions();
                            toast("Other sessions revoked.", "success");
                            loadSessions();
                        } catch (err) {
                            toastError(err, "Revoking sessions");
                        }
                    },
                }, "Revoke other sessions"),
            ],
        })
    );

    async function loadSessions() {
        try {
            const sessions = await auth.listSessions();
            sessionHost.innerHTML = "";
            if (!sessions.length) {
                sessionHost.appendChild(el("p", { class: "field-hint", text: "The backend did not report any sessions." }));
                return;
            }
            sessions.forEach((s, i) => {
                const id = s.id || s.sessionId || s._id;
                sessionHost.appendChild(
                    el("div", { class: "session-item" }, [
                        el("div", { class: "si-main" }, [
                            el("strong", { text: s.device || s.userAgent || `Session ${i + 1}` }),
                            el("span", { text: [s.ipAddress || s.ip, s.createdAt ? `started ${fmtDateTime(s.createdAt)}` : null, s.lastActive ? `last active ${relTime(s.lastActive)}` : null].filter(Boolean).join(" · ") || "No details provided" }),
                        ]),
                        s.current ? badge("This device", "success") : null,
                        !s.current && id
                            ? el("button", {
                                  class: "btn btn-ghost btn-sm",
                                  type: "button",
                                  onclick: async () => {
                                      try {
                                          await auth.revokeSession(id);
                                          toast("Session revoked.", "success");
                                          loadSessions();
                                      } catch (err) {
                                          toastError(err, "Revoking session");
                                      }
                                  },
                              }, "Revoke")
                            : null,
                    ])
                );
            });
        } catch (err) {
            sessionHost.innerHTML = "";
            sessionHost.appendChild(
                el("div", { class: "error-panel" }, [icon("alert"), el("div", {}, [el("strong", { text: "Session list unavailable" }), el("p", { text: err?.message || "The backend did not return session data." })])])
            );
        }
    }
    loadSessions();

    /* ---------------- appearance & behaviour ---------------- */
    root.appendChild(
        card({
            title: "Appearance & behaviour",
            iconName: "settings",
            body: [
                el("div", { class: "settings-row" }, [
                    el("div", { class: "sr-label" }, [el("strong", { text: "Theme" }), el("span", { text: "Matches the rest of the AllForOne site." })]),
                    el("div", { class: "sr-control" }, [
                        (() => {
                            const seg = el("div", { class: "segmented" });
                            const set = (theme) => {
                                window.__setTheme(theme);
                                savePrefs({ theme });
                                Array.from(seg.children).forEach((c) => c.classList.toggle("active", c.dataset.theme === theme));
                            };
                            ["light", "dark"].forEach((theme) => {
                                seg.appendChild(el("button", { type: "button", class: document.documentElement.dataset.theme === theme ? "active" : "", dataset: { theme }, onclick: () => set(theme) }, theme === "light" ? "Light" : "Dark"));
                            });
                            return seg;
                        })(),
                    ]),
                ]),
                el("div", { class: "settings-row" }, [
                    el("div", { class: "sr-label" }, [el("strong", { text: "Autosave" }), el("span", { text: "Save edits automatically after a short pause. Turn off to require the Save now button in editors." })]),
                    el("div", { class: "sr-control" }, [
                        (() => {
                            const input = el("input", { type: "checkbox", checked: prefs.autosave });
                            input.addEventListener("change", () => {
                                savePrefs({ autosave: input.checked });
                                toast(input.checked ? "Autosave on." : "Autosave off — use Save now.", "info", 2200);
                            });
                            return el("label", { class: "switch" }, [input, prefs.autosave ? "On" : "Off"]);
                        })(),
                    ]),
                ]),
                el("div", { class: "settings-row" }, [
                    el("div", { class: "sr-label" }, [el("strong", { text: "Autosave delay" }), el("span", { text: "How long to wait after you stop typing before saving." })]),
                    el("div", { class: "sr-control" }, [
                        (() => {
                            const select = el("select", {}, [500, 1200, 2500, 5000].map((ms) => el("option", { value: ms, selected: prefs.autosaveDelay === ms, text: ms < 1000 ? `${ms} ms` : `${ms / 1000} s` })));
                            select.addEventListener("change", () => savePrefs({ autosaveDelay: Number(select.value) }));
                            return select;
                        })(),
                    ]),
                ]),
                el("div", { class: "settings-row" }, [
                    el("div", { class: "sr-label" }, [el("strong", { text: "Default timeline view" }), el("span", { text: "What the timeline opens with." })]),
                    el("div", { class: "sr-control" }, [
                        (() => {
                            const select = el("select", {}, [["detail", "Detailed"], ["month", "Month"], ["year", "Year"]].map(([v, l]) => el("option", { value: v, selected: prefs.defaultTimelineView === v, text: l })));
                            select.addEventListener("change", () => savePrefs({ defaultTimelineView: select.value }));
                            return select;
                        })(),
                    ]),
                ]),
                el("div", { class: "settings-row" }, [
                    el("div", { class: "sr-label" }, [el("strong", { text: "Current story state" }), el("span", { text: "Season, arc, chapter, status and overall completion shown on the dashboard." })]),
                    el("div", { class: "sr-control" }, [
                        el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => openWorkspaceSettings(() => toast("Saved.", "success", 1500)) }, [icon("edit"), "Edit"]),
                    ]),
                ]),
            ],
        })
    );

    /* ---------------- access list (read-only) ---------------- */
    root.appendChild(membersCard());

    /* ---------------- export / import ---------------- */
    root.appendChild(exportCard());

    /* ---------------- backend capabilities ---------------- */
    root.appendChild(
        card({
            title: "Backend capabilities & limits",
            iconName: "info",
            body: [
                el("div", { class: "stack sm" }, [
                    el("p", { class: "field-hint", text: "The app only uses methods the supplied BreadBackend SDK actually exposes. Where a feature is not supported, this is how it is handled:" }),
                    el("div", { class: "defs" }, [
                        capability("Authentication", "Supported", "BreadBackend auth — signup, login, refresh, sessions, logout."),
                        capability("Per-collection queries", "Limited", "The SDK supports limit / orderBy only, so the app loads each collection once and filters client-side."),
                        capability("Roles / RBAC", "Not provided", "The owner approves each account and each sign-in location here in Settings. Approved emails must also be listed in the BreadBackend project rules — that is the real server-side boundary; location checks happen in the app."),
                        capability("Realtime", "SSE subscribe", "Used where the backend streams; falls back to the local cache when unavailable."),
                        capability("File uploads", "bread.files.upload", "Images and attachments are uploaded to BreadBackend and referenced by URL — never stored as base64."),
                        capability("Version history", "App-level", "Snapshots are written to the change_history collection on every save."),
                        capability("Server-side validation", "Not provided", "All validation happens before writes; project rules enforce collection access."),
                    ]),
                ]),
            ],
        })
    );

    return root;
}

function capability(name, level, detail) {
    return el("div", { class: "def" }, [
        el("span", { class: "def-label", text: name }),
        el("div", { class: "def-value" }, [
            badge(level, level === "Supported" ? "success" : level === "Not provided" ? "warning" : level === "Limited" ? "warning" : "ghost"),
            el("div", { class: "field-hint", style: { marginTop: "0.25rem" }, text: detail }),
        ]),
    ]);
}

/* -------------------------------------------------------- access approvals */

const RULES_SEEN_KEY = "afo_storyplan_rules_emails";

function approvalsCard() {
    const host = el("div", { class: "stack sm" }, [el("p", { class: "field-hint", text: "Loading requests…" })]);
    const refreshBtn = el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => load() }, [icon("refresh"), "Refresh"]);
    let timer = null;
    let latest = [];
    const pendingLocationsOf = (r) => latest.filter((x) => x.kind === "location" && x.status === "pending" && String(x.uid) === String(r.uid));

    const fmtWho = (r) => r.email || r.uid || "(unknown account)";
    const shortAgent = (ua) => {
        const s = String(ua || "");
        const browser = /Edg\//.test(s) ? "Edge" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "";
        const os = /Windows/.test(s) ? "Windows" : /iPhone|iPad/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Mac OS/.test(s) ? "Mac" : /Linux/.test(s) ? "Linux" : "";
        return [browser, os].filter(Boolean).join(" on ");
    };

    async function act(r, status) {
        try {
            await decide(r.id, status, getUser()?.email);
            // Approving a new account also approves the location(s) it's waiting from.
            const alsoLocations = r.kind === "account" && status === "approved" ? pendingLocationsOf(r) : [];
            for (const loc of alsoLocations) await decide(loc.id, "approved", getUser()?.email);
            const where = alsoLocations.length ? ` and location ${alsoLocations.map((l) => l.ip).join(", ")}` : r.ip ? ` · ${r.ip}` : "";
            toast(
                `${r.kind === "account" ? "Account" : "Location"} ${status === "approved" ? "approved" : status === "denied" ? "refused" : "updated"}: ${fmtWho(r)}${where}.` +
                    (r.kind === "account" ? " Now copy the backend rules below into the dashboard so they can load the story." : ""),
                "success",
                r.kind === "account" ? 9000 : 3500
            );
            load();
        } catch (err) {
            toastError(err, "Updating access");
        }
    }

    async function forget(r) {
        const ok = await confirmDialog({
            title: "Remove this request?",
            message: "The record is deleted. If this person signs in again from there, a fresh request appears for you to approve.",
            confirmLabel: "Remove",
            danger: true,
        });
        if (!ok) return;
        try {
            await removeRequest(r.id);
            load();
        } catch (err) {
            toastError(err, "Removing request");
        }
    }

    function row(r) {
        const pending = r.status === "pending";
        const approved = r.status === "approved";
        const waitingFrom = r.kind === "account" && pending ? pendingLocationsOf(r).map((l) => l.ip) : [];
        const detail =
            r.kind === "account"
                ? `New account${waitingFrom.length ? ` · signing in from ${waitingFrom.join(", ")}` : ""} · requested ${r.requestedAt ? relTime(r.requestedAt) : r.createdAt ? relTime(r.createdAt) : ""}`
                : `Location ${r.ip || "?"}${shortAgent(r.userAgent) ? ` · ${shortAgent(r.userAgent)}` : ""} · ${r.requestedAt ? relTime(r.requestedAt) : ""}`;
        return el("div", { class: "session-item" }, [
            el("div", { class: "si-main" }, [el("strong", { text: fmtWho(r) }), el("span", { text: detail })]),
            badge(r.kind === "account" ? "Account" : "Location", "ghost"),
            badge(r.status || "pending", approved ? "success" : pending ? "warning" : "muted"),
            !approved
                ? el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => act(r, "approved") }, waitingFrom.length ? "Approve + location" : "Approve")
                : null,
            pending || approved ? el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => act(r, "denied") }, approved ? "Revoke" : "Refuse") : null,
            el("button", { class: "icon-btn", type: "button", title: "Remove request", "aria-label": "Remove request", onclick: () => forget(r) }, icon("trash")),
        ]);
    }

    function rulesBlock(requests) {
        const emails = approvedEmails(requests);
        const json = JSON.stringify(rulesFor(emails), null, 2);
        let seen = "";
        try {
            seen = localStorage.getItem(RULES_SEEN_KEY) || "";
        } catch (_) {}
        const changed = seen !== emails.join(",");
        const area = el("textarea", { rows: 8, readonly: true, value: json, style: { fontFamily: "monospace", fontSize: "0.75rem", width: "100%" } });
        return el("div", { class: "stack sm" }, [
            el("div", { class: `notice ${changed ? "danger" : ""}` }, [
                icon(changed ? "alert" : "check"),
                el("div", {}, [
                    el("strong", { text: changed ? "Backend rules need updating" : "Backend rules are up to date (on this device)" }),
                    el("p", {
                        style: { margin: "0.2rem 0 0" },
                        text: changed
                            ? "The approved accounts changed. Copy these rules, then in the BreadBackend dashboard open project allforone-story-planner → Rules, replace everything and save. Until then, newly approved people get errors loading data, and revoked people can still reach it directly through the API."
                            : `Approved accounts in the rules: ${emails.join(", ")}`,
                    }),
                ]),
            ]),
            area,
            el("div", { class: "row", style: { gap: "0.4rem" } }, [
                el("button", {
                    class: "btn btn-primary btn-sm",
                    type: "button",
                    onclick: async () => {
                        try {
                            await navigator.clipboard.writeText(json);
                        } catch (_) {
                            area.select();
                            document.execCommand("copy");
                        }
                        toast("Rules copied — paste them into the dashboard's Rules tab.", "success", 4000);
                    },
                }, [icon("copy"), "Copy rules"]),
                el("button", {
                    class: "btn btn-ghost btn-sm",
                    type: "button",
                    onclick: () => {
                        try {
                            localStorage.setItem(RULES_SEEN_KEY, emails.join(","));
                        } catch (_) {}
                        load();
                    },
                }, "I've pasted them"),
            ]),
        ]);
    }

    async function load() {
        try {
            const requests = await listRequests();
            latest = requests;
            host.innerHTML = "";
            const pending = requests.filter((r) => r.status === "pending");
            const others = requests.filter((r) => r.status !== "pending");
            host.appendChild(el("h3", { style: { fontSize: "0.9rem", margin: "0" }, text: pending.length ? `Waiting for you (${pending.length})` : "Nothing waiting" }));
            if (!pending.length) host.appendChild(el("p", { class: "field-hint", text: "New accounts and new sign-in locations appear here. The person's screen lets them in within about 20 seconds of you approving." }));
            pending.forEach((r) => host.appendChild(row(r)));
            if (others.length) {
                host.appendChild(el("h3", { style: { fontSize: "0.9rem", margin: "0.6rem 0 0" }, text: "Decided" }));
                others.forEach((r) => host.appendChild(row(r)));
            }
            host.appendChild(el("h3", { style: { fontSize: "0.9rem", margin: "0.6rem 0 0" }, text: "Backend rules" }));
            host.appendChild(rulesBlock(requests));
        } catch (err) {
            host.innerHTML = "";
            host.appendChild(
                el("div", { class: "error-panel" }, [
                    icon("alert"),
                    el("div", {}, [
                        el("strong", { text: "Couldn't load access requests" }),
                        el("p", { text: `${err?.message || err}. If this is a 403, the backend rules haven't been updated yet — paste the rules below into the dashboard.` }),
                    ]),
                ])
            );
            host.appendChild(rulesBlock([]));
        }
    }

    load();
    // keep the list fresh while Settings is open
    timer = setInterval(() => {
        if (!host.isConnected) return clearInterval(timer);
        if (!document.hidden) load();
    }, 30000);

    return card({
        title: "Access approvals",
        iconName: "lock",
        actions: [refreshBtn],
        body: [
            el("p", { class: "field-hint", text: `Only you (${OWNER_EMAIL}) see this. Approve each new account once, and each new location (IP address) they sign in from.` }),
            host,
        ],
    });
}

/* ---------------------------------------------------------------- members */

function membersCard() {
    const host = el("div", {});
    const body = el("div", { class: "stack sm" }, [
        el("p", {
            class: "field-hint",
            text: "Access itself is granted by the owner under Access approvals. This list only adjusts roles.",
        }),
        el("p", {
            class: "field-hint",
            text: "Member records are optional. An approved account with no record is an editor. Add { email, role } to change a role, or { email, status: \"revoked\" } to block an account.",
        }),
        host,
    ]);

    function render() {
        host.innerHTML = "";
        const members = docs(COLLECTIONS.members);
        if (!members.length) {
            host.appendChild(
                emptyState({
                    iconName: "users",
                    title: "No one is listed",
                    message: "Every approved account enters as an editor. Add member records only to give someone a different role or to block them.",
                })
            );
            return;
        }
        members.forEach((m) => {
            const isMe = String(m.email).toLowerCase() === String(getUser()?.email || "").toLowerCase();
            const active = ["active", "approved"].includes(String(m.status || "active").toLowerCase());
            host.appendChild(
                el("div", { class: "session-item" }, [
                    el("div", { class: "si-main" }, [
                        el("strong", { text: m.email + (isMe ? " (you)" : "") }),
                        el("span", { text: `${m.role || "editor"} · ${m.status || "pending"}` }),
                    ]),
                    active ? badge("Active", "success") : badge("Not active", "warning"),
                    m.role === "owner" ? badge("Owner", "gold") : null,
                ])
            );
        });
    }
    render();
    return card({ title: "Members", iconName: "users", body: [body] });
}

/* ----------------------------------------------------------------- export */

function exportCard() {
    const categories = [...Object.keys(ENTITIES), ...Object.keys(EXPORT_EXTRA)];
    const labelFor = (c) => ENTITIES[c]?.plural || EXPORT_EXTRA[c] || c;
    const chosen = new Set(categories);
    const chips = el("div", { class: "chip-row" });

    const renderChips = () => {
        chips.innerHTML = "";
        categories.forEach((c) => {
            const on = chosen.has(c);
            chips.appendChild(
                el("button", {
                    class: `chip-button${on ? " on" : ""}`,
                    type: "button",
                    onclick: () => {
                        if (on) chosen.delete(c);
                        else chosen.add(c);
                        renderChips();
                    },
                }, [labelFor(c), el("span", { class: "n", text: String(docs(c).length) })])
            );
        });
    };
    renderChips();

    const doExport = (collection) => {
        const payload = collection ? { app: "allforone-story-planner", exportedAt: new Date().toISOString(), collections: { [collection]: exportPayload([collection]).collections[collection] || [] } } : exportPayload(Array.from(chosen));
        const name = collection ? `${collection}-${new Date().toISOString().slice(0, 10)}.json` : `allforone-story-plan-${new Date().toISOString().slice(0, 10)}.json`;
        downloadFile(name, JSON.stringify(payload, null, 2));
        toast("Export downloaded.", "success");
    };

    return card({
        title: "Export & backup",
        iconName: "download",
        body: [
            el("div", { class: "stack sm" }, [
                el("p", { class: "field-hint", text: "Exports keep record IDs and every cross-reference field, so a backup can be reconstructed or re-imported faithfully." }),
                chips,
                el("div", { class: "row" }, [
                    el("button", { class: "btn btn-primary", type: "button", onclick: () => doExport(null) }, [icon("download"), "Export selected"]),
                    el("button", { class: "btn btn-ghost", type: "button", onclick: () => doExport("events") }, "Events only"),
                    el("button", { class: "btn btn-ghost", type: "button", onclick: () => doExport("characters") }, "Characters only"),
                    el("button", { class: "btn btn-ghost", type: "button", onclick: () => doExport("lore") }, "Lore only"),
                ]),
                el("div", { class: "settings-row" }, [
                    el("div", { class: "sr-label" }, [el("strong", { text: "Import a backup" }), el("span", { text: "Validated first, with a preview of what would be written before anything changes." })]),
                    el("div", { class: "sr-control" }, [
                        (() => {
                            const input = el("input", { type: "file", accept: "application/json" });
                            input.addEventListener("change", async () => {
                                const file = input.files?.[0];
                                if (!file) return;
                                try {
                                    const text = await file.text();
                                    const parsed = JSON.parse(text);
                                    previewImport(parsed);
                                } catch (err) {
                                    toast("That file is not valid JSON.", "error");
                                }
                                input.value = "";
                            });
                            return input;
                        })(),
                    ]),
                ]),
            ]),
        ],
    });
}

function previewImport(payload) {
    if (!payload || payload.app !== "allforone-story-planner" || !payload.collections) {
        toast("This is not a Story Planner export file.", "error");
        return;
    }
    const counts = Object.entries(payload.collections).map(([c, list]) => [c, Array.isArray(list) ? list.length : 0]);
    const body = el("div", { class: "stack sm" }, [
        el("div", { class: "notice" }, [icon("alert"), el("span", { text: "Importing creates or overwrites records with matching IDs. Existing records that are not in the file are left alone." })]),
        el("div", { class: "defs" }, counts.map(([c, n]) => el("div", { class: "def" }, [el("span", { class: "def-label", text: c }), el("span", { class: "def-value", text: String(n) })]))),
    ]);
    const progress = el("p", { class: "field-hint", text: "" });
    body.appendChild(progress);
    const cancelBtn = el("button", { class: "btn btn-ghost", type: "button", onclick: () => closeModal(modal) }, "Cancel");
    const applyBtn = el("button", {
        class: "btn btn-primary",
        type: "button",
        onclick: async () => {
            if (importRunning) return; // a second click must never start a parallel import
            importRunning = true;
            applyBtn.disabled = true;
            cancelBtn.disabled = true;
            applyBtn.textContent = "Importing…";
            try {
                const result = await runImport(payload, (done, total, note) => {
                    progress.textContent = `Imported ${done} of ${total}${note ? ` — ${note}` : ""}. Keep this tab open.`;
                });
                closeModal(modal);
                if (result.failed.length) {
                    console.warn("[story-plan] import failures", result.failed);
                    toast(
                        `Import finished — ${result.ok} applied, ${result.failed.length} failed (${result.failed.slice(0, 4).map((f) => f.id).join(", ")}${result.failed.length > 4 ? "…" : ""}). Importing the same file again is safe and retries only what's needed.`,
                        "warning",
                        12000
                    );
                } else {
                    toast(`Import finished — ${result.ok} records applied.`, "success", 6000);
                }
            } catch (err) {
                progress.textContent = "";
                toastError(err, "Importing");
            } finally {
                importRunning = false;
                applyBtn.disabled = false;
                cancelBtn.disabled = false;
                applyBtn.textContent = "Apply import";
            }
        },
    }, "Apply import");
    const modal = openModal({
        title: "Import preview",
        body,
        footer: [
            cancelBtn,
            applyBtn,
        ],
        wide: true,
    });
}

/* ------------------------------------------------------------------ import */

let importRunning = false;
const IMPORT_GAP_MS = 250; // pace writes so the backend's rate limit is never hit

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Writes an export file into the backend one record at a time.
 * - Loads each target collection first, so existing IDs are updated rather
 *   than re-created (a create for an existing ID falls back to update).
 * - Pauses realtime refetches for the duration, then reloads each touched
 *   collection exactly once at the end.
 * - Rate-limit (429) errors are retried with long back-off inside db.*.
 */
async function runImport(payload, onProgress) {
    const targets = Object.entries(payload.collections).filter(
        ([collection, list]) => Array.isArray(list) && (ENTITIES[collection] || EXPORT_EXTRA[collection])
    );
    const total = targets.reduce((n, [, list]) => n + list.length, 0);
    let done = 0;
    let ok = 0;
    const failed = [];

    state.bulk = true;
    try {
        for (const [collection] of targets) {
            onProgress(done, total, `checking existing ${collection}`);
            try {
                await loadCollection(collection);
            } catch (err) {
                // Without the current list we can't tell create from update, so stop
                // before writing anything rather than risk duplicates.
                throw new Error(`Couldn't load the existing ${collection} (${err?.message || err}). Nothing was imported — wait a minute and try again.`);
            }
            await sleepMs(IMPORT_GAP_MS);
        }
        for (const [collection, list] of targets) {
            const existing = new Set(docs(collection).map((d) => String(d.id)));
            for (const record of list) {
                onProgress(done, total, collection);
                const { id, ...rest } = record;
                try {
                    if (id && existing.has(String(id))) {
                        await db.update(collection, id, rest);
                    } else {
                        try {
                            await db.create(collection, record, id);
                        } catch (err) {
                            if (err?.status !== 409 || !id) throw err;
                            await db.update(collection, id, rest);
                        }
                        if (id) existing.add(String(id));
                    }
                    ok++;
                } catch (err) {
                    failed.push({ collection, id, error: err?.message || String(err) });
                }
                done++;
                await sleepMs(IMPORT_GAP_MS);
            }
        }
    } finally {
        state.bulk = false;
    }
    for (const [collection] of targets) {
        onProgress(done, total, `reloading ${collection}`);
        await loadCollection(collection, { force: true }).catch(() => {});
        await sleepMs(IMPORT_GAP_MS);
    }
    return { ok, failed };
}
