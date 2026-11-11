/* Story Planner — Storyboards: ordered scenes for events and chapters, with
   drag-to-reorder, dialogue, props and recording notes. */

import {el, icon, toArray, debounce} from "../util.js";
import {docs, activeDocs, byId, createRecord, updateRecord, deleteRecord, subscribe} from "../store.js";
import { OPTIONS } from "../schema.js";
import { pageHead, card, emptyState, statusBadge, toast, toastError, confirmDialog, markdownField, refPicker, imageUploader } from "../components/ui.js";
import { createAndEdit, openEditor } from "../components/editor.js";
import { detailPath } from "../router.js";
import { renderMarkdown } from "../md.js";

export function storyboardsPage(params) {
    const root = el("div", { class: "page" });
    const boardId = params.get("board") || "";
    const boards = activeDocs("storyboards");

    if (boardId) {
        const board = byId("storyboards", boardId);
        if (board) {
            root.appendChild(sceneEditor(board));
            return root;
        }
    }

    root.appendChild(
        pageHead("Storyboards", "Break an event or chapter into ordered scenes: what happens, who is there, what is said, what is needed.", [
            el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("storyboards") }, [icon("plus"), "New storyboard"]),
        ])
    );

    if (!boards.length) {
        root.appendChild(
            el("div", { class: "card" }, [
                emptyState({
                    iconName: "list",
                    title: "No storyboards yet",
                    message: "Create a storyboard for a scripted event and plan it scene by scene.",
                    action: el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit("storyboards") }, [icon("plus"), "Create a storyboard"]),
                }),
            ])
        );
        return root;
    }

    const grid = el("div", { class: "grid cols-3" });
    boards
        .slice()
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .forEach((b) => {
            const scenes = docs("storyboard_scenes").filter((s) => String(s.storyboardId) === String(b.id)).sort((x, y) => (Number(x.order) || 0) - (Number(y.order) || 0));
            const done = scenes.filter((s) => s.status === "Done" || s.status === "Recorded").length;
            const event = byId("events", b.eventId);
            grid.appendChild(
                el("a", { class: "arc-card", href: `#/storyboards?board=${encodeURIComponent(b.id)}`, style: { "--accent": "var(--c-event)" } }, [
                    el("h3", {}, [el("span", { text: b.title || "Untitled storyboard" })]),
                    el("div", { class: "row", style: { gap: "0.3rem" } }, [statusBadge(b.status)]),
                    b.description ? el("p", { text: String(b.description).replace(/[#*`>_~]/g, "").slice(0, 150) }) : null,
                    el("div", { class: "progress sm" }, [el("span", { style: { width: `${scenes.length ? Math.round((done / scenes.length) * 100) : 0}%` } })]),
                    el("div", { class: "arc-foot" }, [
                        el("span", { text: `${scenes.length} scenes` }),
                        el("span", { text: "·" }),
                        el("span", { text: `${done} complete` }),
                        event ? el("span", { text: `· ${event.title}` }) : null,
                    ]),
                ])
            );
        });
    root.appendChild(grid);
    return root;
}

function sceneEditor(board) {
    const root = el("div", { class: "page" });
    const sceneHost = el("div", { class: "stack sm" });
    let dragId = null;

    const head = el("div", { class: "detail-head", style: { "--accent": "var(--c-event)" } }, [
        el("div", { class: "detail-head-main" }, [
            el("button", { class: "link-btn", type: "button", onclick: () => (location.hash = "#/storyboards"), style: { display: "inline-flex", gap: "0.25rem", alignItems: "center" } }, [icon("chevronLeft"), "All storyboards"]),
            el("h1", { text: board.title || "Untitled storyboard" }),
            el("div", { class: "subline" }, [
                statusBadge(board.status),
                board.eventId && byId("events", board.eventId) ? el("a", { href: detailPath("events", board.eventId), text: `Event: ${byId("events", board.eventId).title}` }) : null,
                board.chapterId && byId("chapters", board.chapterId) ? el("a", { href: detailPath("chapters", board.chapterId), text: `Chapter: ${byId("chapters", board.chapterId).title}` }) : null,
            ]),
            board.description ? el("div", { class: "prose", style: { fontSize: "0.88rem" }, html: renderMarkdown(board.description) }) : null,
        ]),
        el("div", { class: "detail-head-side" }, [
            el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => openEditor("storyboards", board.id) }, [icon("edit"), "Board settings"]),
            el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => addScene() }, [icon("plus"), "Add scene"]),
        ]),
    ]);
    root.appendChild(head);

    async function addScene(atIndex) {
        const scenes = currentScenes();
        const order = atIndex != null ? atIndex : scenes.length;
        try {
            await createRecord("storyboard_scenes", {
                storyboardId: board.id,
                title: `Scene ${order + 1}`,
                order: order * 10 + 10,
                status: "Outline",
            });
            await renumber();
            toast("Scene added.", "success", 1600);
        } catch (err) {
            toastError(err, "Adding scene");
        }
    }

    function currentScenes() {
        return docs("storyboard_scenes")
            .filter((s) => String(s.storyboardId) === String(board.id))
            .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    }

    async function renumber() {
        const list = currentScenes();
        for (let i = 0; i < list.length; i++) {
            const want = (i + 1) * 10;
            if (Number(list[i].order) !== want) {
                try {
                    await updateRecord("storyboard_scenes", list[i].id, { order: want }, { immediate: true });
                } catch (_) {
                    /* non-fatal */
                }
            }
        }
        renderScenes();
    }

    function renderScenes() {
        sceneHost.innerHTML = "";
        const scenes = currentScenes();
        const done = scenes.filter((s) => s.status === "Done" || s.status === "Recorded").length;
        sceneHost.appendChild(
            el("div", { class: "row between" }, [
                el("h2", { style: { fontSize: "1rem" }, text: `${scenes.length} scenes · ${done} complete` }),
                el("div", { class: "row", style: { gap: "0.35rem" } }, [
                    el("span", { class: "field-hint", text: "Drag the handle to reorder" }),
                    el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => addScene() }, [icon("plus"), "Add scene"]),
                ]),
            ])
        );

        if (!scenes.length) {
            sceneHost.appendChild(
                el("div", { class: "card" }, [
                    emptyState({
                        iconName: "list",
                        title: "No scenes yet",
                        message: "Add the first scene, then describe the action, dialogue and recording needs.",
                        action: el("button", { class: "btn btn-primary", type: "button", onclick: () => addScene() }, [icon("plus"), "Add first scene"]),
                    }),
                ])
            );
            return;
        }

        scenes.forEach((scene, idx) => {
            const cardEl = el("div", { class: "scene-card" });
            const headEl = el("div", { class: "scene-head" }, [
                el("span", { class: "grip" }, icon("grip")),
                el("span", { class: "scene-num", text: String(idx + 1).padStart(2, "0") }),
                el("h4", { text: scene.title || "Untitled scene" }),
                statusBadge(scene.status),
                el("button", { class: "icon-btn", type: "button", style: { width: "28px", height: "28px" }, title: "Add scene below", onclick: () => addScene(idx + 1) }, icon("plus")),
                el("button", {
                    class: "icon-btn",
                    type: "button",
                    style: { width: "28px", height: "28px" },
                    title: "Delete scene",
                    onclick: async () => {
                        const ok = await confirmDialog({ title: "Delete scene?", message: `"${scene.title}" will be removed from this storyboard.`, confirmLabel: "Delete", danger: true });
                        if (!ok) return;
                        try {
                            await deleteRecord("storyboard_scenes", scene.id);
                            toast("Scene deleted.", "success", 1600);
                        } catch (err) {
                            toastError(err, "Deleting scene");
                        }
                    },
                }, icon("trash")),
            ]);
            headEl.draggable = true;
            headEl.addEventListener("dragstart", (e) => {
                dragId = scene.id;
                cardEl.classList.add("dragging");
                e.dataTransfer.effectAllowed = "move";
            });
            headEl.addEventListener("dragend", () => {
                cardEl.classList.remove("dragging");
                dragId = null;
                sceneHost.querySelectorAll(".drop-target").forEach((n) => n.classList.remove("drop-target"));
            });

            cardEl.addEventListener("dragover", (e) => {
                if (!dragId || dragId === scene.id) return;
                e.preventDefault();
                cardEl.classList.add("drop-target");
            });
            cardEl.addEventListener("dragleave", () => cardEl.classList.remove("drop-target"));
            cardEl.addEventListener("drop", async (e) => {
                e.preventDefault();
                cardEl.classList.remove("drop-target");
                if (!dragId || dragId === scene.id) return;
                const list = currentScenes().filter((s) => s.id !== dragId);
                const insertAt = list.findIndex((s) => s.id === scene.id);
                const moved = byId("storyboard_scenes", dragId);
                list.splice(insertAt, 0, moved);
                for (let i = 0; i < list.length; i++) {
                    try {
                        await updateRecord("storyboard_scenes", list[i].id, { order: (i + 1) * 10 }, { immediate: true });
                    } catch (_) {
                        /* ignore */
                    }
                }
                dragId = null;
                renderScenes();
            });

            const body = el("div", { class: "scene-body" });
            const save = (patch) => {
                try {
                    updateRecord("storyboard_scenes", scene.id, patch);
                } catch (err) {
                    toastError(err, "Saving scene");
                }
            };

            const titleInput = el("input", { type: "text", value: scene.title || "", placeholder: "Scene title" });
            titleInput.addEventListener("input", debounce(() => {
                save({ title: titleInput.value });
                headEl.querySelector("h4").textContent = titleInput.value || "Untitled scene";
            }, 500));

            const statusSelect = el("select", { style: { maxWidth: "170px" } }, [
                el("option", { value: "", text: "Status…" }),
                ...OPTIONS.sceneStatus.map((s) => el("option", { value: s, selected: scene.status === s, text: s })),
            ]);
            statusSelect.addEventListener("change", () => {
                save({ status: statusSelect.value });
                const b = headEl.querySelector(".badge");
                if (b) b.replaceWith(statusBadge(statusSelect.value) || el("span"));
            });

            const descField = markdownField({ value: scene.description || "", onChange: debounce((v) => save({ description: v }), 700) });
            const dialogueField = markdownField({ value: scene.dialogue || "", onChange: debounce((v) => save({ dialogue: v }), 700) });

            const locationPicker = refPicker({ collection: "locations", value: scene.locationId || "", onChange: (v) => save({ locationId: v }) });
            const characterPicker = refPicker({ collection: "characters", value: toArray(scene.characterIds), multiple: true, onChange: (v) => save({ characterIds: v }) });

            const durationInput = el("input", { type: "text", value: scene.duration || "", placeholder: "e.g. 2 min" });
            durationInput.addEventListener("input", debounce(() => save({ duration: durationInput.value }), 600));

            const cameraInput = el("textarea", { value: scene.camera || "", placeholder: "Camera / recording notes", rows: 2 });
            cameraInput.addEventListener("input", debounce(() => save({ camera: cameraInput.value }), 700));

            const propsInput = el("textarea", { value: scene.props || "", placeholder: "Important props", rows: 2 });
            propsInput.addEventListener("input", debounce(() => save({ props: propsInput.value }), 700));

            const purposeInput = el("textarea", { value: scene.purpose || "", placeholder: "Narrative purpose", rows: 2 });
            purposeInput.addEventListener("input", debounce(() => save({ purpose: purposeInput.value }), 700));

            const media = imageUploader({ value: toArray(scene.images), label: "Scene reference images", onChange: (urls) => save({ images: urls }) });

            body.append(
                el("div", { class: "form-grid three" }, [
                    el("label", { class: "field span-2" }, [el("span", { class: "field-label", text: "Title" }), titleInput]),
                    el("label", { class: "field" }, [el("span", { class: "field-label", text: "Status" }), statusSelect]),
                ]),
                el("label", { class: "field" }, [el("span", { class: "field-label", text: "Scene description" }), descField]),
                el("label", { class: "field" }, [el("span", { class: "field-label", text: "Dialogue" }), dialogueField]),
                el("div", { class: "form-grid three" }, [
                    el("label", { class: "field" }, [el("span", { class: "field-label", text: "Location" }), locationPicker]),
                    el("label", { class: "field" }, [el("span", { class: "field-label", text: "Estimated duration" }), durationInput]),
                    el("div", { class: "field" }, [el("span", { class: "field-label", text: "Characters present" }), characterPicker]),
                ]),
                el("div", { class: "form-grid three" }, [
                    el("label", { class: "field" }, [el("span", { class: "field-label", text: "Camera / recording" }), cameraInput]),
                    el("label", { class: "field" }, [el("span", { class: "field-label", text: "Props" }), propsInput]),
                    el("label", { class: "field" }, [el("span", { class: "field-label", text: "Narrative purpose" }), purposeInput]),
                ]),
                el("div", { class: "field" }, [el("span", { class: "field-label", text: "References" }), media])
            );

            cardEl.append(headEl, body);
            sceneHost.appendChild(cardEl);
        });
    }

    renderScenes();
    root.appendChild(sceneHost);

    const unsub = subscribe((ev) => {
        if ((ev.type === "changed" || ev.type === "saved") && ev.collection === "storyboard_scenes" && root.isConnected) {
            clearTimeout(t);
            t = setTimeout(renderScenes, 450);
        }
    });
    let t = null;
    root.addEventListener("planner:dispose", () => {
        unsub();
        clearTimeout(t);
    });
    return root;
}
