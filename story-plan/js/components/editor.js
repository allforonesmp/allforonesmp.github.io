/* AllForOne Story Planner — schema-driven record editor.
 *
 * Renders a slide-over panel from ENTITIES[collection]. Groups with no data and
 * no requirement are collapsed so large entities (characters, events) stay
 * usable. All edits go through store.updateRecord, which autosaves.
 */

import { el, clear, icon, toArray, debounce } from "../util.js";
import {ENTITIES} from "../schema.js";
import {byId, createRecord, updateRecord, flushDoc, nextNumber, generateCode} from "../store.js";
import {markdownField, refPicker, imageUploader, tagsInput, toast, toastError, confirmDialog} from "./ui.js";

let activePanel = null;

const CODE_PREFIX = {
    events: "EVT",
    characters: "CHR",
    lore: "LOR",
    locations: "LOC",
};

export function isEditorOpen() {
    return Boolean(activePanel);
}

export function closeEditor() {
    if (!activePanel) return;
    activePanel.backdrop.remove();
    activePanel.panel.remove();
    const previous = activePanel;
    activePanel = null;
    document.body.style.overflow = previous.hadModal ? "hidden" : "";
    if (previous.onClose) previous.onClose();
}

/** Create a record, then open its editor. */
export async function createAndEdit(collection, preset = {}, onSaved) {
    const ent = ENTITIES[collection];
    if (!ent) return null;
    const data = { ...preset };
    if (collection === "characters" && !data.status) data.status = "Active";
    if (collection === "events" && !data.status) data.status = "Idea";
    if (collection === "events" && !data.kind) data.kind = "Normal Event";
    if (collection === "seasons" || collection === "chapters") {
        data.number = data.number ?? nextNumber(collection);
        if (!data.status) data.status = "Planning";
    }
    if (CODE_PREFIX[collection] && !data.code) data.code = generateCode(collection, CODE_PREFIX[collection]);
    if (!ent.title(data)) {
        const titleField = ent.groups[0].fields.find((f) => f.key === "title" || f.key === "name");
        if (titleField) data[titleField.key] = `New ${ent.label.toLowerCase()}`;
    }
    let record = null;
    try {
        record = await createRecord(collection, data);
        toast(`${ent.label} created.`, "success", 2200);
    } catch (err) {
        // The record exists locally with the write queued for retry, so the
        // editor still opens — the user never loses what they typed.
        toastError(err, `Creating ${ent.label.toLowerCase()} (kept locally, will retry)`);
        record = byId(collection, data.id) || { ...data };
    }
    if (onSaved) onSaved(record);
    openEditor(collection, record.id);
    return record;
}

export function openEditor(collection, id) {
    const doc = byId(collection, id);
    if (!doc) {
        toast("That record no longer exists.", "error");
        return;
    }
    closeEditor();
    const ent = ENTITIES[collection];

    const hadModal = document.body.style.overflow === "hidden";
    const backdrop = el("div", { class: "editor-backdrop" });
    const panel = el("div", { class: "editor-panel", role: "dialog", "aria-modal": "true", "aria-label": `${ent.label} editor` });

    const titleNode = el("h2", { text: ent.title(doc) });
    const statusNode = el("span", { class: "field-hint", text: "All changes save automatically" });

    const head = el("div", { class: "editor-head" }, [
        el("div", { style: { flex: "1", minWidth: "0" } }, [
            el("span", { class: "eyebrow", text: `Editing ${ent.label}` }),
            titleNode,
            statusNode,
        ]),
        el("button", { class: "icon-btn", type: "button", "aria-label": "Close editor", onclick: closeEditor }, icon("x")),
    ]);

    const body = el("div", { class: "editor-body" });

    const nameField = ent.groups[0].fields.find((f) => f.key === "title" || f.key === "name");
    const onTitleChange = debounce((value) => {
        titleNode.textContent = value || `Untitled ${ent.label.toLowerCase()}`;
        save(nameField.key, value);
    }, 300);

    const save = (key, value) => {
        try {
            updateRecord(collection, id, { [key]: value });
        } catch (err) {
            toastError(err, "Saving");
        }
    };

    ent.groups.forEach((group, groupIndex) => {
        const hasData = group.fields.some((f) => {
            const v = doc[f.key];
            return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "" && v !== false;
        });
        const required = group.fields.some((f) => f.required);
        const section = el("section", { class: "editor-section" });
        const fieldsHost = el("div", { class: "form-grid" });

        const toggle = el(
            "button",
            {
                type: "button",
                class: "link-btn",
                style: { marginLeft: "auto", textTransform: "none", letterSpacing: "0" },
                onclick: () => {
                    const collapsed = fieldsHost.hidden;
                    fieldsHost.hidden = !collapsed;
                    toggle.textContent = collapsed ? "Collapse" : "Expand";
                },
            },
            hasData || groupIndex === 0 || required ? "Collapse" : "Expand"
        );

        section.appendChild(
            el("h3", {}, [group.title, el("span", { style: { marginLeft: "auto", display: "flex" } }, toggle)])
        );

        group.fields.forEach((field) => {
            const node = renderField(field, doc, collection, save, onTitleChange);
            if (!node) return;
            const wrap = el("div", { class: field.span === 2 ? "span-2" : field.span === 3 ? "span-3" : "" }, [
                el("label", { class: "field" }, [
                    el("span", { class: "field-label" }, [field.label, field.required ? el("span", { style: { color: "var(--error)" }, text: " *" }) : null]),
                    node,
                    field.help ? el("span", { class: "field-hint", text: field.help }) : null,
                ]),
            ]);
            fieldsHost.appendChild(wrap);
        });

        fieldsHost.hidden = !(hasData || groupIndex === 0 || required);
        toggle.textContent = fieldsHost.hidden ? "Expand" : "Collapse";
        section.appendChild(fieldsHost);
        body.appendChild(section);
    });

    const foot = el("div", { class: "editor-foot" }, [
        el("button", {
            type: "button",
            class: "btn btn-primary",
            onclick: async () => {
                try {
                    await flushDoc(collection, id);
                    toast("Saved.", "success", 1500);
                } catch (err) {
                    toastError(err, "Saving");
                }
            },
        }, [icon("save"), "Save now"]),
        el("button", { type: "button", class: "btn btn-ghost", onclick: closeEditor }, "Done"),
        el("span", { class: "spacer" }),
        el("button", {
            type: "button",
            class: "btn btn-danger-ghost btn-sm",
            onclick: async () => {
                const ok = await confirmDialog({
                    title: `Delete this ${ent.label.toLowerCase()}?`,
                    message:
                        "Deleting removes the record permanently. Prefer Archive (from the table or detail view) to keep history and references intact.",
                    confirmLabel: "Delete permanently",
                    danger: true,
                });
                if (!ok) return;
                try {
                    const { deleteRecord } = await import("../store.js");
                    await deleteRecord(collection, id);
                    toast(`${ent.label} deleted.`, "success");
                    closeEditor();
                    if (location.hash.includes(String(id))) location.hash = "#/dashboard";
                } catch (err) {
                    toastError(err, "Deleting");
                }
            },
        }, [icon("trash"), "Delete"]),
    ]);

    panel.append(head, body, foot);
    document.getElementById("modalRoot").append(backdrop, panel);
    document.body.style.overflow = "hidden";
    backdrop.addEventListener("click", closeEditor);

    activePanel = { backdrop, panel, hadModal, collection, id, onClose: null };
    return activePanel;
}

/* -------------------------------------------------------------- field types */

function renderField(field, doc, collection, save, onTitleChange) {
    const value = doc[field.key];

    switch (field.type) {
        case "text":
        case "url": {
            const input = el("input", {
                type: field.type === "url" ? "url" : "text",
                value: value ?? "",
                placeholder: field.placeholder || "",
            });
            if (field.key === "title" || field.key === "name") {
                input.addEventListener("input", () => onTitleChange(input.value));
            } else {
                input.addEventListener("input", debounce(() => save(field.key, input.value), 500));
            }
            return input;
        }

        case "number": {
            const input = el("input", {
                type: "number",
                value: value ?? "",
                min: field.min,
                max: field.max,
                step: field.step || 1,
            });
            input.addEventListener("input", debounce(() => {
                const raw = input.value.trim();
                save(field.key, raw === "" ? "" : Number(raw));
            }, 500));
            return input;
        }

        case "date":
        case "month": {
            const input = el("input", { type: field.type, value: value || "" });
            input.addEventListener("change", () => save(field.key, input.value));
            return input;
        }

        case "textarea": {
            const ta = el("textarea", { value: value ?? "", placeholder: field.placeholder || "", rows: 3 });
            ta.addEventListener("input", debounce(() => save(field.key, ta.value), 600));
            return ta;
        }

        case "select": {
            const opts = (field.options || []).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
            const current = value ?? "";
            const select = el("select", {}, [
                el("option", { value: "", text: opts.length ? "— Not set —" : "—" }),
                ...opts.map((o) => el("option", { value: o.value, selected: String(current) === String(o.value), text: o.label })),
            ]);
            const known = opts.some((o) => String(o.value) === String(current));
            if (current && !known) {
                select.appendChild(el("option", { value: current, selected: true, text: `${current} (custom)` }));
            }
            select.addEventListener("change", () => save(field.key, select.value));
            if (!field.custom) return select;

            // custom value support: a small "＋" opens a prompt for a new option
            const wrap = el("div", { style: { display: "flex", gap: "0.35rem", alignItems: "center" } }, [select]);
            wrap.appendChild(
                el("button", {
                    type: "button",
                    class: "btn btn-ghost btn-sm",
                    title: "Add a custom value",
                    onclick: () => {
                        const v = window.prompt(`Add a custom ${field.label.toLowerCase()}`);
                        if (!v) return;
                        const opt = el("option", { value: v, text: `${v} (custom)`, selected: true });
                        select.appendChild(opt);
                        select.value = v;
                        save(field.key, v);
                    },
                }, "+")
            );
            return wrap;
        }

        case "segmented": {
            const wrap = el("div", { class: "segmented" });
            (field.options || []).forEach((o) => {
                const val = typeof o === "string" ? o : o.value;
                const label = typeof o === "string" ? o : o.label;
                const btn = el("button", {
                    type: "button",
                    class: (value || field.options[0]) === val ? "active" : "",
                    onclick: () => {
                        Array.from(wrap.children).forEach((c) => c.classList.remove("active"));
                        btn.classList.add("active");
                        save(field.key, val);
                    },
                }, label);
                wrap.appendChild(btn);
            });
            return wrap;
        }

        case "multiselect": {
            const current = new Set(toArray(value));
            const wrap = el("div", { class: "pill-toggle" });
            (field.options || []).forEach((o) => {
                const val = typeof o === "string" ? o : o.value;
                const label = typeof o === "string" ? o : o.label;
                const btn = el("button", {
                    type: "button",
                    class: current.has(val) ? "on" : "",
                    onclick: () => {
                        if (current.has(val)) current.delete(val);
                        else current.add(val);
                        btn.classList.toggle("on", current.has(val));
                        save(field.key, Array.from(current));
                    },
                }, label);
                wrap.appendChild(btn);
            });
            return wrap;
        }

        case "bool": {
            const input = el("input", { type: "checkbox", checked: Boolean(value) });
            input.addEventListener("change", () => save(field.key, input.checked));
            return el("label", { class: "check" }, [input, "Enabled"]);
        }

        case "tags": {
            return tagsInput({ value: toArray(value), onChange: (tags) => save(field.key, tags) });
        }

        case "markdown": {
            const md = markdownField({
                value: value || "",
                tall: Boolean(field.tall),
                onChange: debounce((v) => save(field.key, v), 700),
            });
            return md;
        }

        case "ref": {
            return refPicker({
                collection: field.refType,
                value: value || "",
                multiple: false,
                onChange: (v) => save(field.key, v),
            });
        }

        case "refs": {
            return refPicker({
                collection: field.refType,
                value: toArray(value),
                multiple: true,
                onChange: (v) => save(field.key, v),
            });
        }

        case "image": {
            return imageUploader({
                value: value || "",
                label: "Choose image",
                onChange: (urls) => save(field.key, urls[0] || ""),
            });
        }

        case "images": {
            return imageUploader({
                value: toArray(value),
                anyFile: Boolean(field.anyFile),
                label: field.anyFile ? "Choose files" : "Upload images",
                onChange: (urls) => save(field.key, urls),
            });
        }

        case "historySteps": {
            return historyStepsEditor(toArray(value), (steps) => save(field.key, steps));
        }

        case "memberHistory": {
            return memberHistoryEditor(toArray(value), (rows) => save(field.key, rows));
        }

        default:
            return el("span", { class: "field-hint", text: `Unsupported field: ${field.type}` });
    }
}

/* ------------------------------------------------- relationship chronology */

export function historyStepsEditor(steps, onChange) {
    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "0.4rem" } });
    let list = steps.slice();

    const render = () => {
        clear(wrap);
        if (!list.length) {
            wrap.appendChild(el("span", { class: "field-hint", text: "No stages recorded. Add the first relationship stage." }));
        }
        list.forEach((step, idx) => {
            const typeInput = el("input", { type: "text", value: step.type || "", placeholder: "Type (e.g. Friends)", style: { flex: "1 1 110px" } });
            const dateInput = el("input", { type: "date", value: step.date || "", style: { flex: "0 1 150px" } });
            const noteInput = el("input", { type: "text", value: step.note || "", placeholder: "What changed?", style: { flex: "2 1 140px" } });
            const commit = () => {
                list[idx] = { ...list[idx], type: typeInput.value, date: dateInput.value, note: noteInput.value };
                onChange(list.slice());
            };
            typeInput.addEventListener("change", commit);
            dateInput.addEventListener("change", commit);
            noteInput.addEventListener("change", commit);
            wrap.appendChild(
                el("div", { class: "row nowrap", style: { gap: "0.3rem" } }, [
                    typeInput,
                    dateInput,
                    noteInput,
                    el("button", {
                        type: "button",
                        class: "icon-btn",
                        style: { width: "30px", height: "30px" },
                        "aria-label": "Remove stage",
                        onclick: () => {
                            list = list.filter((_, i) => i !== idx);
                            render();
                            onChange(list.slice());
                        },
                    }, icon("x")),
                ])
            );
        });
        wrap.appendChild(
            el("button", {
                type: "button",
                class: "btn btn-ghost btn-sm",
                onclick: () => {
                    list.push({ type: "", date: "", note: "", at: new Date().toISOString() });
                    render();
                    onChange(list.slice());
                },
            }, [icon("plus"), "Add stage"])
        );
    };
    render();
    return wrap;
}

export function memberHistoryEditor(rows, onChange) {
    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "0.4rem" } });
    let list = rows.slice();
    const render = () => {
        clear(wrap);
        list.forEach((row, idx) => {
            const nameInput = el("input", { type: "text", value: row.name || "", placeholder: "Member name", style: { flex: "1 1 120px" } });
            const actionInput = el("select", { style: { flex: "0 1 120px" } }, ["Joined", "Left", "Expelled", "Promoted", "Demoted", "Returned", "Deceased"].map((o) =>
                el("option", { value: o, selected: row.action === o, text: o })
            ));
            const dateInput = el("input", { type: "date", value: row.date || "", style: { flex: "0 1 140px" } });
            const commit = () => {
                list[idx] = { name: nameInput.value, action: actionInput.value, date: dateInput.value };
                onChange(list.slice());
            };
            [nameInput, actionInput, dateInput].forEach((i) => i.addEventListener("change", commit));
            wrap.appendChild(
                el("div", { class: "row nowrap", style: { gap: "0.3rem" } }, [
                    nameInput,
                    actionInput,
                    dateInput,
                    el("button", {
                        type: "button",
                        class: "icon-btn",
                        style: { width: "30px", height: "30px" },
                        "aria-label": "Remove row",
                        onclick: () => {
                            list = list.filter((_, i) => i !== idx);
                            render();
                            onChange(list.slice());
                        },
                    }, icon("x")),
                ])
            );
        });
        wrap.appendChild(
            el("button", {
                type: "button",
                class: "btn btn-ghost btn-sm",
                onclick: () => {
                    list.push({ name: "", action: "Joined", date: "" });
                    render();
                    onChange(list.slice());
                },
            }, [icon("plus"), "Add membership change"])
        );
    };
    render();
    return wrap;
}
