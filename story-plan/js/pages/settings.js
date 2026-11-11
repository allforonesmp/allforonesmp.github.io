/* Story Planner — Settings: account, sessions, theme, autosave, members,
   export/import, and an honest report of backend capabilities. */

import { el, icon, downloadFile, fmtDateTime, relTime } from "../util.js";
import { docs, prefs, savePrefs, exportPayload, loadCollection, createRecord, updateRecord, deleteRecord, flushPending } from "../store.js";
import { COLLECTIONS, auth, db } from "../api.js";
import { ENTITIES } from "../schema.js";
import { pageHead, card, badge, toast, toastError, confirmDialog, emptyState, openModal, closeModal } from "../components/ui.js";
import { getUser, getMember, isOwner, signOut } from "../auth.js";
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
                    el("div", { class: "sr-label" }, [el("strong", { text: user?.email || "—" }), el("span", { text: `Role: ${member?.role || "member"} · Status: ${member?.status || "active"}` })]),
                    el("div", { class: "sr-control" }, [
                        el("span", {
                            class: `badge ${user?.isVerified === true ? "success" : "warning"}`,
                            text: user?.isVerified === true ? "Email verified" : user?.isVerified === false ? "Email not verified" : "Verification unknown",
                            title: "Unverified accounts cannot open the workspace.",
                        }),
                        user?.isVerified === true
                            ? null
                            : el("button", {
                                  class: "btn btn-ghost btn-sm",
                                  type: "button",
                                  onclick: async () => {
                                      try {
                                          await auth.resendVerification(user.email);
                                          toast("Verification email sent.", "success");
                                      } catch (err) {
                                          toastError(err, "Sending verification");
                                      }
                                  },
                              }, "Resend verification"),
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
                            el("span", { text: [s.ip, s.createdAt ? `started ${fmtDateTime(s.createdAt)}` : null, s.lastActive ? `last active ${relTime(s.lastActive)}` : null].filter(Boolean).join(" · ") || "No details provided" }),
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

    /* ---------------- members ---------------- */
    if (isOwner()) root.appendChild(membersCard());
    else
        root.appendChild(
            card({
                title: "Members",
                iconName: "users",
                body: [el("p", { class: "field-hint", text: "Only the workspace owner can approve or remove members." })],
            })
        );

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
                        capability("Roles / RBAC", "Not provided", "Access is gated by the members collection. Disable open signup in the BreadBackend dashboard — that is the real boundary."),
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

/* ---------------------------------------------------------------- members */

function membersCard() {
    const host = el("div", {});
    const body = el("div", { class: "stack sm" }, [
        el("p", { class: "field-hint", text: "Access needs both conditions: the account must have a verified email address, AND be approved here. Unverified accounts see nothing at all. The first account created is the owner." }),
        host,
        el("button", {
            class: "btn btn-ghost btn-sm",
            type: "button",
            style: { alignSelf: "flex-start" },
            onclick: async () => {
                const email = window.prompt("Email address to approve as an editor");
                if (!email) return;
                try {
                    await createRecord(COLLECTIONS.members, { email: email.trim().toLowerCase(), role: "editor", status: "active", approvedAt: new Date().toISOString() });
                    toast("Member approved.", "success");
                    render();
                } catch (err) {
                    toastError(err, "Approving member");
                }
            },
        }, [icon("plus"), "Approve a member"]),
    ]);

    function render() {
        host.innerHTML = "";
        const members = docs(COLLECTIONS.members);
        if (!members.length) {
            host.appendChild(emptyState({ iconName: "users", title: "No members recorded", message: "Membership records appear once the collection is readable." }));
            return;
        }
        members.forEach((m) => {
            const isMe = String(m.email).toLowerCase() === String(getUser()?.email || "").toLowerCase();
            host.appendChild(
                el("div", { class: "session-item" }, [
                    el("div", { class: "si-main" }, [
                        el("strong", { text: m.email + (isMe ? " (you)" : "") }),
                        el("span", { text: `${m.role || "editor"} · ${m.status || "pending"}` }),
                    ]),
                    m.status === "pending"
                        ? el("button", {
                              class: "btn btn-soft btn-sm",
                              type: "button",
                              onclick: async () => {
                                  try {
                                      await updateRecord(COLLECTIONS.members, m.id, { status: "active", approvedAt: new Date().toISOString() }, { immediate: true });
                                      toast("Approved.", "success");
                                      render();
                                  } catch (err) {
                                      toastError(err, "Approving");
                                  }
                              },
                          }, "Approve")
                        : badge("Active", "success"),
                    m.role === "owner"
                        ? badge("Owner", "gold")
                        : el("button", {
                              class: "icon-btn",
                              type: "button",
                              style: { width: "30px", height: "30px" },
                              title: "Remove member",
                              onclick: async () => {
                                  const ok = await confirmDialog({ title: "Remove member?", message: `${m.email} will lose access to the workspace.`, confirmLabel: "Remove", danger: true });
                                  if (!ok) return;
                                  try {
                                      await deleteRecord(COLLECTIONS.members, m.id);
                                      toast("Member removed.", "success");
                                      render();
                                  } catch (err) {
                                      toastError(err, "Removing member");
                                  }
                              },
                          }, icon("trash")),
                ])
            );
        });
    }
    render();
    return card({ title: "Members", iconName: "users", body: [body] });
}

/* ----------------------------------------------------------------- export */

function exportCard() {
    const categories = Object.keys(ENTITIES);
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
                }, [ENTITIES[c].plural, el("span", { class: "n", text: String(docs(c).length) })])
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
    const modal = openModal({
        title: "Import preview",
        body,
        footer: [
            el("button", { class: "btn btn-ghost", type: "button", onclick: () => closeModal(modal) }, "Cancel"),
            el("button", {
                class: "btn btn-primary",
                type: "button",
                onclick: async () => {
                    let ok = 0;
                    let failed = 0;
                    for (const [collection, list] of Object.entries(payload.collections)) {
                        if (!Array.isArray(list) || !ENTITIES[collection]) continue;
                        for (const record of list) {
                            try {
                                if (docs(collection).some((d) => String(d.id) === String(record.id))) {
                                    const { id, ...rest } = record;
                                    await db.update(collection, id, rest);
                                } else {
                                    await db.create(collection, record, record.id);
                                }
                                ok++;
                            } catch (_) {
                                failed++;
                            }
                        }
                        await loadCollection(collection, { force: true }).catch(() => {});
                    }
                    closeModal(modal);
                    toast(`Import finished — ${ok} applied${failed ? `, ${failed} failed` : ""}.`, failed ? "warning" : "success", 6000);
                },
            }, "Apply import"),
        ],
        wide: true,
    });
}
