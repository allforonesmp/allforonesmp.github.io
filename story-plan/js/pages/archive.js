/* Story Planner — Archive: everything that has been soft-deleted, grouped by
   collection. Archived records stay searchable and can be restored in place. */

import { el, icon, relTime, debounce } from "../util.js";
import { archivedDocs, archiveRecord, deleteRecord, subscribe } from "../store.js";
import { ENTITIES } from "../schema.js";
import { pageHead, card, emptyState, badge, toast, toastError, confirmDialog } from "../components/ui.js";
import { detailPath } from "../router.js";

const ARCHIVABLE = ["seasons", "chapters", "story_arcs", "story_threads", "events", "characters", "lore", "factions", "locations", "storyboards", "notes"];

export function archivePage() {
    const root = el("div", { class: "page" });
    let search = "";

    root.appendChild(
        pageHead("Archive", "Nothing is destroyed by archiving. Archived records keep their links, stay searchable, and can be restored exactly where they were.", [
            el("span", { class: "badge ghost", text: `${ARCHIVABLE.reduce((n, c) => n + archivedDocs(c).length, 0)} archived records` }),
        ])
    );

    const input = el("input", { type: "search", placeholder: "Search the archive…" });
    input.addEventListener("input", debounce(() => { search = input.value.toLowerCase(); render(); }, 160));
    const stage = el("div", {});
    root.append(el("div", { class: "toolbar" }, [el("div", { class: "search-mini grow" }, [icon("search"), input])]), stage);

    function render() {
        stage.innerHTML = "";
        let any = false;
        ARCHIVABLE.forEach((collection) => {
            const list = archivedDocs(collection).filter((d) => {
                if (!search) return true;
                return [ENTITIES[collection].title(d), d.description, d.code].filter(Boolean).join(" ").toLowerCase().includes(search);
            });
            if (!list.length) return;
            any = true;
            const host = el("div", { class: "archive-row", style: { background: "var(--surface-2)", fontWeight: "700" } }, [
                el("span", { class: "li-mark" }, icon(ENTITIES[collection].icon)),
                el("span", { text: ENTITIES[collection].plural }),
                el("span", { class: "badge ghost", text: String(list.length), style: { marginLeft: "auto" } }),
            ]);
            const cardEl = el("div", { class: "card" }, [host]);
            list.forEach((doc) => {
                cardEl.appendChild(
                    el("div", { class: "archive-row" }, [
                        el("div", { class: "ar-main" }, [
                            el("strong", { text: ENTITIES[collection].title(doc) }),
                            el("span", { text: [doc.code, doc.status, doc.archivedAt ? `archived ${relTime(doc.archivedAt)}` : "archived"].filter(Boolean).join(" · ") }),
                        ]),
                        el("div", { class: "row", style: { gap: "0.3rem" } }, [
                            el("a", { class: "btn btn-ghost btn-sm", href: detailPath(collection, doc.id) }, "View"),
                            el("button", {
                                class: "btn btn-soft btn-sm",
                                type: "button",
                                onclick: async () => {
                                    try {
                                        await archiveRecord(collection, doc.id, false);
                                        toast(`"${ENTITIES[collection].title(doc)}" restored.`, "success");
                                    } catch (err) {
                                        toastError(err, "Restoring");
                                    }
                                },
                            }, [icon("restore"), "Restore"]),
                            el("button", {
                                class: "icon-btn",
                                type: "button",
                                style: { width: "30px", height: "30px" },
                                title: "Delete permanently",
                                onclick: async () => {
                                    const ok = await confirmDialog({
                                        title: "Delete permanently?",
                                        message: `"${ENTITIES[collection].title(doc)}" will be removed from BreadBackend. Any record still pointing at it will show a broken reference. This cannot be undone.`,
                                        confirmLabel: "Delete forever",
                                        danger: true,
                                    });
                                    if (!ok) return;
                                    try {
                                        await deleteRecord(collection, doc.id);
                                        toast("Deleted permanently.", "success");
                                    } catch (err) {
                                        toastError(err, "Deleting");
                                    }
                                },
                            }, icon("trash")),
                        ]),
                    ])
                );
            });
            stage.appendChild(cardEl);
        });

        if (!any) {
            stage.appendChild(
                el("div", { class: "card" }, [
                    emptyState({
                        iconName: "archive",
                        title: search ? "Nothing in the archive matches" : "The archive is empty",
                        message: search ? "Try a different search term." : "Archiving an event, character or arc keeps it here — fully intact and restorable.",
                    }),
                ])
            );
        }
    }

    render();
    const unsub = subscribe((ev) => {
        if ((ev.type === "changed" || ev.type === "saved" || ev.type === "loaded") && root.isConnected) {
            clearTimeout(t);
            t = setTimeout(render, 350);
        }
    });
    let t = null;
    root.addEventListener("planner:dispose", () => { unsub(); clearTimeout(t); });
    return root;
}
