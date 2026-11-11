/* Story Planner — Notes & Ideas, including conversion into real entities.
   Converting never discards the note: it is kept and linked. */

import { el, icon, toArray, relTime, debounce } from "../util.js";
import {activeDocs, updateRecord, createRecord, subscribe} from "../store.js";
import {OPTIONS} from "../schema.js";
import { pageHead, card, emptyState, badge, toast, toastError, openModal, closeModal } from "../components/ui.js";
import { createAndEdit, openEditor } from "../components/editor.js";
;
import { renderMarkdown } from "../md.js";

const CONVERT_TARGETS = [
    { collection: "events", label: "Event", icon: "calendar" },
    { collection: "characters", label: "Character", icon: "users" },
    { collection: "lore", label: "Lore entry", icon: "book" },
    { collection: "story_threads", label: "Story thread", icon: "share" },
    { collection: "story_arcs", label: "Story arc", icon: "branch" },
];

export function notesPage(params) {
    const root = el("div", { class: "page" });
    let filterCategory = params.get("category") || "";
    let filterPriority = params.get("priority") || "";
    let search = "";
    let view = "board";

    root.appendChild(
        pageHead("Notes & ideas", "Loose thoughts before they become canon. Anything here can be converted into an event, character, lore entry, thread or arc — the note is always kept.", [
            el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("notes") }, [icon("plus"), "New note"]),
        ])
    );

    const searchInput = el("input", { type: "search", placeholder: "Search notes…" });
    searchInput.addEventListener("input", debounce(() => { search = searchInput.value.toLowerCase(); render(); }, 160));
    const catSelect = el("select", { class: "select-sm" }, [
        el("option", { value: "", text: "All categories" }),
        ...OPTIONS.noteCategory.map((c) => el("option", { value: c, selected: filterCategory === c, text: c })),
    ]);
    catSelect.addEventListener("change", () => { filterCategory = catSelect.value; render(); });
    const priSelect = el("select", { class: "select-sm" }, [
        el("option", { value: "", text: "All priorities" }),
        ...OPTIONS.notePriority.map((c) => el("option", { value: c, selected: filterPriority === c, text: c })),
    ]);
    priSelect.addEventListener("change", () => { filterPriority = priSelect.value; render(); });

    const seg = el("div", { class: "segmented" }, [
        ["board", "Grid"],
        ["list", "List"],
    ].map(([id, label]) =>
        el("button", {
            type: "button",
            class: view === id ? "active" : "",
            onclick: () => {
                view = id;
                Array.from(seg.children).forEach((c) => c.classList.remove("active"));
                seg.querySelectorAll("button")[["board", "list"].indexOf(id)].classList.add("active");
                render();
            },
        }, label)
    ));

    const toolbar = el("div", { class: "toolbar" }, [el("div", { class: "search-mini grow" }, [icon("search"), searchInput]), catSelect, priSelect, seg]);
    const stage = el("div", {});
    root.append(toolbar, stage);

    function filtered() {
        return activeDocs("notes")
            .filter((n) => (filterCategory ? n.category === filterCategory : true))
            .filter((n) => (filterPriority ? n.priority === filterPriority : true))
            .filter((n) => (search ? [n.title, n.content, toArray(n.tags).join(" ")].filter(Boolean).join(" ").toLowerCase().includes(search) : true))
            .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }

    function render() {
        stage.innerHTML = "";
        const notes = filtered();
        if (!activeDocs("notes").length) {
            stage.appendChild(
                el("div", { class: "card" }, [
                    emptyState({
                        iconName: "note",
                        title: "No notes yet",
                        message: "Capture the stray idea before it escapes. You can tag it, link it, and turn it into canon later.",
                        action: el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("notes") }, [icon("plus"), "Add a note"]),
                    }),
                ])
            );
            return;
        }
        if (!notes.length) {
            stage.appendChild(el("div", { class: "card" }, [emptyState({ iconName: "search", title: "No notes match", message: "Try a different search or filter." })]));
            return;
        }

        if (view === "list") {
            const list = el("div", { class: "card" });
            notes.forEach((n) => {
                list.appendChild(
                    el("div", { class: "list-item", style: { cursor: "pointer" }, onclick: () => openEditor("notes", n.id) }, [
                        el("span", { class: "li-mark" }, icon(n.pinned ? "star" : "note")),
                        el("div", { class: "li-main" }, [
                            el("div", { class: "li-title" }, [el("span", { class: "t", text: n.title || "Untitled" }), n.category ? badge(n.category, "ghost") : null, n.priority ? badge(n.priority, priorityVariant(n.priority)) : null]),
                            el("div", { class: "li-meta" }, [el("span", { text: relTime(n.updatedAt) }), toArray(n.tags).length ? el("span", { class: "sep", text: "·" }) : null, el("span", { text: toArray(n.tags).slice(0, 4).join(", ") })]),
                        ]),
                        el("span", { class: "li-side" }, [convertButton(n)]),
                    ])
                );
            });
            stage.appendChild(list);
            return;
        }

        const grid = el("div", { class: "grid cols-3" });
        notes.forEach((n) => {
            grid.appendChild(
                el("div", { class: "card", style: { cursor: "pointer" }, onclick: (e) => { if (!e.target.closest("button")) openEditor("notes", n.id); } }, [
                    el("div", { class: "card-head" }, [
                        el("h2", { style: { fontSize: "0.92rem" }, overflow: "hidden" }, [
                            n.pinned ? icon("star") : null,
                            el("span", { text: n.title || "Untitled" }),
                        ]),
                        el("div", { class: "head-actions" }, [
                            el("button", {
                                class: "icon-btn",
                                type: "button",
                                style: { width: "28px", height: "28px" },
                                title: n.pinned ? "Unpin" : "Pin",
                                onclick: async () => {
                                    try {
                                        await updateRecord("notes", n.id, { pinned: !n.pinned }, { immediate: true });
                                    } catch (err) {
                                        toastError(err, "Pinning note");
                                    }
                                },
                            }, icon("star")),
                        ]),
                    ]),
                    el("div", { class: "card-body stack sm" }, [
                        el("div", { class: "row", style: { gap: "0.3rem" } }, [
                            n.category ? badge(n.category, "ghost") : null,
                            n.priority ? badge(n.priority, priorityVariant(n.priority)) : null,
                            toArray(n.tags).slice(0, 3).map((t) => badge(`#${t}`, "muted")),
                        ]),
                        n.content ? el("div", { class: "prose", style: { fontSize: "0.85rem", maxHeight: "160px", overflow: "hidden" }, html: renderMarkdown(String(n.content).slice(0, 600)) }) : el("p", { class: "field-hint", text: "No content yet." }),
                        el("div", { class: "row between", style: { marginTop: "auto" } }, [
                            el("span", { class: "field-hint", text: relTime(n.updatedAt) }),
                            convertButton(n),
                        ]),
                    ]),
                ])
            );
        });
        stage.appendChild(grid);
    }

    function convertButton(note) {
        return el("button", {
            class: "btn btn-ghost btn-sm",
            type: "button",
            onclick: (e) => {
                e.stopPropagation();
                convertNote(note);
            },
        }, [icon("sparkles"), "Convert"]);
    }

    render();
    const unsub = subscribe((ev) => {
        if ((ev.type === "changed" || ev.type === "saved" || ev.type === "loaded") && root.isConnected && ev.collection === "notes") {
            clearTimeout(t);
            t = setTimeout(render, 400);
        }
    });
    let t = null;
    root.addEventListener("planner:dispose", () => {
        unsub();
        clearTimeout(t);
    });
    return root;
}

function priorityVariant(p) {
    return p === "Urgent" ? "danger" : p === "High" ? "warning" : p === "Low" ? "muted" : "";
}

/** Convert a note into a real entity, keeping and cross-linking the note. */
export function convertNote(note) {
    const body = el("div", { class: "stack sm" }, [
        el("div", { class: "notice" }, [icon("info"), el("span", { text: "The note is not deleted. A new record is created from its text and the note links to it." })]),
        el("div", { class: "quick-actions" }),
    ]);
    const actions = body.querySelector(".quick-actions");
    const modal = openModal({ title: `Convert “${note.title}”`, body, footer: [el("button", { class: "btn btn-ghost", type: "button", onclick: () => closeModal(modal) }, "Cancel")] });

    CONVERT_TARGETS.forEach((target) => {
        actions.appendChild(
            el("button", {
                class: "quick-action",
                type: "button",
                onclick: async () => {
                    try {
                        const preset = buildPreset(target.collection, note);
                        const record = await createRecord(target.collection, preset);
                        const linkField = {
                            events: "eventIds",
                            characters: "characterIds",
                            lore: "loreIds",
                            story_arcs: "arcIds",
                            story_threads: "threadIds",
                        }[target.collection];
                        const patch = { convertedTo: { collection: target.collection, id: record.id }, convertedAt: new Date().toISOString() };
                        if (linkField) patch[linkField] = Array.from(new Set([...toArray(note[linkField]), record.id]));
                        await updateRecord("notes", note.id, patch, { immediate: true });
                        closeModal(modal);
                        toast(`${target.label} created and linked to the note.`, "success");
                        openEditor(target.collection, record.id);
                    } catch (err) {
                        toastError(err, `Converting to ${target.label.toLowerCase()}`);
                    }
                },
            }, [icon(target.icon), el("span", { text: target.label })])
        );
    });
}

function buildPreset(collection, note) {
    const content = String(note.content || "");
    const firstLine = content.split("\n").find((l) => l.trim()) || "";
    const title = note.title || firstLine.slice(0, 60) || "Untitled";
    const common = { notes: `Converted from note “${note.title}”.\n\n---\n\n${content}` };
    switch (collection) {
        case "events":
            return {
                ...common,
                title,
                kind: "Normal Event",
                status: "Idea",
                importance: "Medium",
                description: content,
                tags: toArray(note.tags),
                characterIds: [],
            };
        case "characters":
            return { ...common, name: title, status: "Active", type: "NPC", notes: common.notes };
        case "lore":
            return { ...common, title, category: "Mysteries", knowledge: "Unconfirmed", shortDescription: firstLine.slice(0, 200), fullExplanation: content, tags: toArray(note.tags) };
        case "story_threads":
            return { ...common, title, status: "Active", importance: "Medium", description: content };
        case "story_arcs":
            return { ...common, name: title, status: "Planning", description: content };
        default:
            return { ...common, title };
    }
}
