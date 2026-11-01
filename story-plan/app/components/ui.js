/* =========================================================================
   UI primitives — overlays, toasts, confirmations and the form engine.
   ========================================================================= */

import { store } from "../core/store.js";
import { SCHEMAS, DEFAULT_ATTRIBUTES, OPTIONS } from "../core/schema.js";
import { icon } from "../core/icons.js";
import { $, $$, esc, uid, debounce, splitLines, safeUrl, initials } from "../core/util.js";

const root = () => document.getElementById("overlay-root") || document.body;

const overlayStack = [];

/* -------------------------------------------------------------------------
   Toasts
   ------------------------------------------------------------------------- */
export function toast(message, type = "info", { title = "", timeout = 4200 } = {}) {
    const host = document.getElementById("toast-root");
    if (!host) return;
    const node = document.createElement("div");
    node.className = `toast ${type}`;
    const ic = type === "error" ? "alert" : type === "success" ? "checkCircle" : type === "warn" ? "alert" : "info";
    node.innerHTML = `${icon(ic)}<div>${title ? `<b>${esc(title)}</b><br>` : ""}${esc(message)}</div>`;
    host.appendChild(node);
    const close = () => {
        node.classList.add("leaving");
        setTimeout(() => node.remove(), 260);
    };
    setTimeout(close, timeout);
    node.addEventListener("click", close);
}

/* -------------------------------------------------------------------------
   Overlay plumbing
   ------------------------------------------------------------------------- */
function registerOverlay(close) {
    overlayStack.push(close);
}

function popOverlay() {
    const fn = overlayStack.pop();
    if (fn) fn();
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlayStack.length) {
        e.preventDefault();
        popOverlay();
    }
});

export function closeAllOverlays() {
    while (overlayStack.length) popOverlay();
}

/* -------------------------------------------------------------------------
   Modal
   ------------------------------------------------------------------------- */
export function openModal({
    title = "",
    subtitle = "",
    body = "",
    foot = "",
    size = "",
    className = "",
    onMount = null,
    onClose = null,
    dismissible = true,
    headRight = "",
} = {}) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
        <div class="modal ${size} ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
            <div class="modal-head">
                <div style="min-width:0">
                    ${title ? `<div class="mtitle">${esc(title)}</div>` : ""}
                    ${subtitle ? `<div class="msub">${esc(subtitle)}</div>` : ""}
                </div>
                ${headRight}
                <button class="modal-close" aria-label="Close" data-close>${icon("x")}</button>
            </div>
            <div class="modal-body">${body}</div>
            ${foot ? `<div class="modal-foot">${foot}</div>` : ""}
        </div>`;
    root().appendChild(backdrop);

    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        backdrop.style.opacity = "0";
        backdrop.style.transition = "opacity .16s";
        setTimeout(() => backdrop.remove(), 160);
        const idx = overlayStack.indexOf(close);
        if (idx >= 0) overlayStack.splice(idx, 1);
        if (onClose) onClose();
    };
    registerOverlay(close);

    backdrop.addEventListener("mousedown", (e) => {
        if (e.target === backdrop && dismissible) close();
    });
    backdrop.querySelector("[data-close]")?.addEventListener("click", close);
    const modal = backdrop.querySelector(".modal");
    modal.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
            const focusables = $$(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                modal,
            ).filter((el) => el.offsetParent !== null);
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });
    if (onMount) onMount(modal, close);
    setTimeout(() => {
        const focusTarget = modal.querySelector("[autofocus], input:not([type=hidden]), textarea, select");
        if (focusTarget) focusTarget.focus({ preventScroll: true });
    }, 60);
    return { close, el: modal, backdrop };
}

/* -------------------------------------------------------------------------
   Drawer
   ------------------------------------------------------------------------- */
export function openDrawer({ title = "", subtitle = "", body = "", width = "", onMount = null, onClose = null, foot = "" } = {}) {
    const wrap = document.createElement("div");
    wrap.className = "drawer-backdrop";
    wrap.innerHTML = `
        <div class="drawer" style="${width ? `width:${width}` : ""}" role="dialog" aria-modal="true">
            <div class="drawer-head">
                <div style="min-width:0">
                    <div class="mtitle" style="font-family:var(--font-display);font-size:18px">${esc(title)}</div>
                    ${subtitle ? `<div class="tiny dim">${esc(subtitle)}</div>` : ""}
                </div>
                <button class="modal-close" data-close aria-label="Close">${icon("x")}</button>
            </div>
            <div class="drawer-body">${body}</div>
            ${foot ? `<div class="modal-foot">${foot}</div>` : ""}
        </div>`;
    root().appendChild(wrap);
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        wrap.remove();
        const idx = overlayStack.indexOf(close);
        if (idx >= 0) overlayStack.splice(idx, 1);
        if (onClose) onClose();
    };
    registerOverlay(close);
    wrap.addEventListener("mousedown", (e) => {
        if (e.target === wrap) close();
    });
    wrap.querySelector("[data-close]")?.addEventListener("click", close);
    if (onMount) onMount(wrap.querySelector(".drawer"), close);
    return { close, el: wrap.querySelector(".drawer") };
}

/* -------------------------------------------------------------------------
   Popover
   ------------------------------------------------------------------------- */
let activePopover = null;
export function closePopover() {
    if (activePopover) {
        activePopover.remove();
        activePopover = null;
    }
}
document.addEventListener("mousedown", (e) => {
    if (activePopover && !activePopover.contains(e.target)) {
        const anchor = activePopover._anchor;
        if (!anchor || !anchor.contains(e.target)) closePopover();
    }
});

export function openPopover(anchor, html, { width = 200, align = "left", onMount = null } = {}) {
    closePopover();
    const pop = document.createElement("div");
    pop.className = "popover";
    pop.innerHTML = html;
    pop._anchor = anchor;
    pop.style.minWidth = width + "px";
    root().appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    let left = align === "right" ? rect.right - popRect.width : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - popRect.width - 8));
    let top = rect.bottom + 6;
    if (top + popRect.height > window.innerHeight - 8) top = Math.max(8, rect.top - popRect.height - 6);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    activePopover = pop;
    if (onMount) onMount(pop);
    return pop;
}

/* -------------------------------------------------------------------------
   Confirm / prompt
   ------------------------------------------------------------------------- */
export function confirmDialog({
    title = "Are you sure?",
    message = "",
    detail = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = true,
    requireText = "",
    onConfirm,
}) {
    let confirmed = false;
    const body = `
        <div class="row" style="align-items:flex-start;gap:14px">
            <div class="confirm-icon ${danger ? "" : "warn"}">${icon(danger ? "alert" : "info")}</div>
            <div style="min-width:0">
                <div style="font-size:13.5px;color:var(--text-soft);line-height:1.55">${message}</div>
                ${detail ? `<div class="small dim" style="margin-top:8px;line-height:1.6">${detail}</div>` : ""}
                ${
                    requireText
                        ? `<div class="field" style="margin-top:14px"><label>Type <b style="color:var(--gold)">${esc(requireText)}</b> to continue</label><input class="input" data-confirm-text placeholder="${esc(requireText)}" autocomplete="off" /></div>`
                        : ""
                }
            </div>
        </div>`;
    const { close } = openModal({
        title,
        size: "narrow",
        body,
        foot: `<button class="btn" data-cancel>${esc(cancelLabel)}</button><span class="spacer"></span><button class="btn ${danger ? "danger" : "primary"}" data-ok ${requireText ? "disabled" : ""}>${esc(confirmLabel)}</button>`,
        onMount: (modal) => {
            const ok = modal.querySelector("[data-ok]");
            const input = modal.querySelector("[data-confirm-text]");
            if (input) {
                input.addEventListener("input", () => {
                    ok.disabled = input.value.trim() !== requireText;
                });
                setTimeout(() => input.focus(), 80);
            }
            modal.querySelector("[data-cancel]").addEventListener("click", close);
            ok.addEventListener("click", () => {
                confirmed = true;
                close();
                if (onConfirm) onConfirm();
            });
        },
        onClose: () => {
            if (!confirmed) return;
        },
    });
    return close;
}

export function promptDialog({ title, label, value = "", placeholder = "", hint = "", confirmLabel = "Save", onSubmit }) {
    const body = `<div class="field"><label>${esc(label)}</label><input class="input" data-prompt-value value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus />${hint ? `<div class="hint">${esc(hint)}</div>` : ""}</div>`;
    const { close, el } = openModal({
        title,
        size: "narrow",
        body,
        foot: `<button class="btn" data-cancel>Cancel</button><span class="spacer"></span><button class="btn primary" data-ok>${esc(confirmLabel)}</button>`,
        onMount: (modal) => {
            const input = modal.querySelector("[data-prompt-value]");
            const submit = () => {
                const v = input.value.trim();
                if (!v) {
                    input.focus();
                    return;
                }
                close();
                onSubmit?.(v);
            };
            modal.querySelector("[data-cancel]").addEventListener("click", close);
            modal.querySelector("[data-ok]").addEventListener("click", submit);
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") submit();
            });
        },
    });
    return { close, el };
}

/* -------------------------------------------------------------------------
   Lightbox
   ------------------------------------------------------------------------- */
export function openLightbox(url, caption = "") {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.style.alignItems = "center";
    backdrop.innerHTML = `
        <div style="max-width:min(1100px,94vw);max-height:90vh;display:flex;flex-direction:column;gap:10px" role="dialog">
            <div class="row" style="justify-content:flex-end"><button class="icon-btn" data-close style="background:rgba(0,0,0,.5)">${icon("x")}</button></div>
            <img src="${esc(safeUrl(url))}" alt="${esc(caption)}" style="max-height:78vh;max-width:100%;object-fit:contain;border-radius:10px;border:1px solid var(--line-strong);margin:0 auto" />
            ${caption ? `<div class="small muted" style="text-align:center">${esc(caption)}</div>` : ""}
        </div>`;
    root().appendChild(backdrop);
    const close = () => backdrop.remove();
    overlayStack.push(close);
    backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop || e.target.closest("[data-close]")) close();
    });
}

/* -------------------------------------------------------------------------
   Field helpers
   ------------------------------------------------------------------------- */
function getPath(obj, path) {
    return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}
function setPath(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    parts.forEach((part, i) => {
        if (i === parts.length - 1) {
            cur[part] = value;
        } else {
            const nextIsIndex = /^\d+$/.test(parts[i + 1]);
            if (cur[part] === undefined || cur[part] === null || typeof cur[part] !== "object") {
                cur[part] = nextIsIndex ? [] : {};
            }
            cur = cur[part];
        }
    });
}

function refOptions(collection) {
    return store.refOptions(collection);
}

function selectHtml({ path, value, options, placeholder = "— None —", sm = false }) {
    return `<select class="select ${sm ? "sm" : ""}" data-key="${path}" data-type="select">
        ${placeholder !== false ? `<option value="">${esc(placeholder)}</option>` : ""}
        ${options
            .map((o) => `<option value="${esc(o.value)}" ${String(value) === String(o.value) ? "selected" : ""}>${esc(o.label)}</option>`)
            .join("")}
    </select>`;
}

function textareaHtml({ path, value, rows = 4, placeholder = "", dataType = "textarea" }) {
    return `<textarea class="textarea" rows="${rows}" data-key="${path}" data-type="${dataType}" placeholder="${esc(placeholder)}">${esc(value || "")}</textarea>`;
}

function inputHtml({ path, value, type = "text", placeholder = "", full = false }) {
    return `<input class="input" type="${type}" data-key="${path}" data-type="${type}" value="${esc(value ?? "")}" placeholder="${esc(placeholder)}" ${full ? 'style="width:100%"' : ""} />`;
}

function tagPickerHtml({ path, values, collection, titleLabel }) {
    const selected = new Set(values || []);
    const options = refOptions(collection);
    return `
    <div class="tag-pick searchable" data-picker="${path}">
        <input class="input sm" data-picker-filter placeholder="Filter ${esc(titleLabel || "options")}…" style="margin-bottom:5px" />
        <div class="picker-opts" data-picker-opts>
            ${
                options.length
                    ? options
                          .map(
                              (o) =>
                                  `<button type="button" class="opt ${selected.has(o.value) ? "on" : ""}" data-val="${esc(o.value)}">${esc(o.label)}</button>`,
                          )
                          .join("")
                    : `<div class="empty" style="padding:8px">No ${esc(titleLabel || "records")} yet.</div>`
            }
        </div>
        <div class="tiny dim" data-picker-count style="padding:3px 2px">${selected.size} selected</div>
    </div>`;
}

function imageFieldHtml({ path, value, label = "image" }) {
    return `
    <div class="image-field" data-image-field="${path}">
        <div class="image-preview ${value ? "" : "empty"}">
            ${value ? `<img src="${esc(safeUrl(value))}" alt="" />` : `<span>${icon("image")}<em>No ${esc(label)}</em></span>`}
        </div>
        <div class="image-controls">
            <input class="input sm" data-key="${path}" data-type="text" value="${esc(value || "")}" placeholder="https://… or upload" />
            <div class="row gap-6" style="margin-top:6px">
                <button type="button" class="btn sm" data-upload="${path}">${icon("upload")} Upload</button>
                <button type="button" class="btn sm ghost" data-clear-image="${path}">Clear</button>
            </div>
        </div>
    </div>`;
}

function ratingHtml({ path, value }) {
    const v = Number(value) || 3;
    return `<div class="rating" data-rating="${path}" data-value="${v}">
        ${[1, 2, 3, 4, 5]
            .map((n) => `<button type="button" class="${n <= v ? "on" : ""}" data-rate="${n}" title="${n}/5" aria-label="Importance ${n}"></button>`)
            .join("")}
        <span class="rating-label">${(OPTIONS.IMPORTANCE.find((i) => i.value === v) || {}).label || ""}</span>
    </div>`;
}

function attributesHtml({ path, value }) {
    const attrs = value || {};
    return `<div class="attrs-editor">
        ${DEFAULT_ATTRIBUTES.map((a) => {
            const v = Number(attrs[a.key] ?? 5);
            return `<div class="attr-row">
                <label>${esc(a.label)}</label>
                <input type="range" min="0" max="10" value="${v}" data-attr="${path}.${a.key}" data-type="number" />
                <output>${v}</output>
            </div>`;
        }).join("")}
    </div>`;
}

function repeaterHtml({ field, path, value }) {
    const rows = Array.isArray(value) ? value : [];
    return `<div class="repeater" data-repeater="${path}">
        ${rows
            .map(
                (row, i) => `
            <div class="rep-row" data-rep-index="${i}">
                <div class="rep-head">
                    <span class="rep-num mono">${String(i + 1).padStart(2, "0")}</span>
                    <span class="rep-title">${esc(row?.[field.itemLabel || "label"] || row?.note || row?.text || "Entry")}</span>
                    <button type="button" class="icon-btn" data-rep-remove="${i}" aria-label="Remove row">${icon("trash")}</button>
                </div>
                <div class="rep-fields">
                    ${field.fields.map((sub) => renderFieldInner(sub, `${path}.${i}.${sub.key}`, row?.[sub.key], true)).join("")}
                </div>
            </div>`,
            )
            .join("")}
        <button type="button" class="btn sm" data-rep-add="${path}">${icon("plus")} ${esc(field.addLabel || "Add entry")}</button>
    </div>`;
}

function imagesHtml({ path, value }) {
    const rows = Array.isArray(value) ? value : [];
    return `<div class="image-field" data-image-field="${path}">
        <div class="gallery-editor" data-gallery="${path}">
            ${rows
                .map(
                    (img, i) => `
                <div class="gal-item" data-gal-index="${i}">
                    <div class="gal-thumb">${img?.url ? `<img src="${esc(safeUrl(img.url))}" alt="" data-lightbox="${esc(safeUrl(img.url))}" />` : icon("image")}</div>
                    <input class="input sm" data-key="${path}.${i}.url" data-type="text" value="${esc(img?.url || "")}" placeholder="Image URL" />
                    <input class="input sm" data-key="${path}.${i}.caption" data-type="text" value="${esc(img?.caption || "")}" placeholder="Caption" />
                    <button type="button" class="icon-btn" data-gal-remove="${i}" aria-label="Remove image">${icon("x")}</button>
                </div>`,
                )
                .join("")}
        </div>
        <div class="row gap-6" style="margin-top:8px">
            <button type="button" class="btn sm" data-upload-multi="${path}">${icon("upload")} Upload images</button>
            <button type="button" class="btn sm ghost" data-gal-add="${path}">${icon("plus")} Add by URL</button>
        </div>
    </div>`;
}

function renderFieldInner(field, path, value, compact = false) {
    if (field.type === "bool") {
        return `<label class="checkline" style="${compact ? "margin:4px 0" : ""}"><input type="checkbox" data-key="${path}" data-type="bool" ${value ? "checked" : ""} /> ${esc(field.label)}</label>`;
    }
    let control = "";
    switch (field.type) {
        case "textarea":
            control = textareaHtml({ path, value, rows: compact ? 2 : 4, placeholder: field.placeholder });
            break;
        case "select":
            control = selectHtml({ path, value: value ?? field.default, options: field.options?.length ? field.options : [], placeholder: field.placeholder || "— None —", sm: compact });
            break;
        case "date":
            control = `<input class="input ${compact ? "sm" : ""}" type="date" data-key="${path}" data-type="date" value="${esc(value || "")}" />`;
            break;
        case "number":
            control = inputHtml({ path, value: value ?? field.default ?? 0, type: "number", placeholder: field.placeholder });
            break;
        case "color":
            control = `<div class="row gap-6"><input type="color" class="color-input" data-key="${path}" data-type="text" value="${esc(value || field.default || "#d7b878")}" /><input class="input sm" data-key="${path}" data-type="text" value="${esc(value || field.default || "#d7b878")}" style="max-width:110px" /></div>`;
            break;
        case "rating":
            control = ratingHtml({ path, value: value ?? field.default });
            break;
        case "attributes":
            control = attributesHtml({ path, value });
            break;
        case "list":
            control = textareaHtml({ path, value: Array.isArray(value) ? value.join("\n") : value || "", rows: compact ? 2 : 3, placeholder: "One per line", dataType: "list" });
            break;
        case "tags":
            control = `<input class="input ${compact ? "sm" : ""}" data-key="${path}" data-type="tags" value="${esc(Array.isArray(value) ? value.join(", ") : value || "")}" placeholder="${esc(field.placeholder || "Comma separated")}" />`;
            break;
        case "ref":
            control = selectHtml({ path, value, options: refOptions(field.collection), sm: compact });
            break;
        case "refs":
            control = tagPickerHtml({ path, values: value || [], collection: field.collection, titleLabel: field.collection });
            break;
        case "dynamic-ref": {
            const sourceType = getPath(formContext.working, field.collectionFrom);
            const options = sourceType ? refOptions(sourceType) : [];
            control = selectHtml({
                path,
                value,
                options,
                placeholder: sourceType ? "— None —" : "Choose a type first",
                sm: compact,
            });
            break;
        }
        case "image":
            control = imageFieldHtml({ path, value });
            break;
        case "images":
            control = imagesHtml({ path, value });
            break;
        case "repeater":
            control = repeaterHtml({ field, path, value });
            break;
        case "text":
        default:
            control = inputHtml({ path, value, placeholder: field.placeholder, type: "text" });
    }
    return `<div class="field ${field.full ? "full" : ""} ${compact ? "compact" : ""}">
        <label>${esc(field.label)} ${field.required ? '<span class="req">*</span>' : ""}</label>
        ${control}
        ${field.hint && !compact ? `<div class="hint">${esc(field.hint)}</div>` : ""}
    </div>`;
}

/* -------------------------------------------------------------------------
   Form engine
   ------------------------------------------------------------------------- */
const formContext = { working: {}, type: null };

export function openEntityForm({ type, record = null, defaults = {}, onSaved = null, onDeleted = null, title = null, subtitle = "" }) {
    const sections = SCHEMAS[type];
    if (!sections) throw new Error(`No schema for ${type}`);
    const isEdit = Boolean(record?.key);
    const working = record ? JSON.parse(JSON.stringify(record)) : {};
    if (!isEdit) {
        for (const section of sections) {
            for (const f of section.fields) {
                if (f.type === "repeater" || f.type === "refs" || f.type === "images") working[f.key] = working[f.key] || [];
                else if (working[f.key] === undefined) working[f.key] = f.default ?? "";
            }
        }
        Object.assign(working, defaults);
    }
    formContext.working = working;
    formContext.type = type;

    const draftKey = `afo_sp_draft_${type}_${record?.key || "new"}`;
    let hasDraft = false;
    try {
        const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
        if (draft && draft.savedAt && (!record?.updatedAt || draft.savedAt > record.updatedAt) && draft.data) {
            Object.assign(working, draft.data);
            hasDraft = true;
        }
    } catch (err) {}

    let activeSection = 0;
    let dirty = false;

    const tabs = sections
        .map(
            (s, i) =>
                `<button type="button" class="tab ${i === 0 ? "active" : ""}" data-section="${i}">${esc(s.title)}</button>`,
        )
        .join("");

    const body = `
        <div class="form-modal">
            ${hasDraft ? `<div class="banner">${icon("info")} <div>Unsaved draft restored for this record.</div><div class="b-actions"><button class="btn sm ghost" data-discard-draft>Discard draft</button></div></div>` : ""}
            <div class="tabs" data-form-tabs>${tabs}</div>
            <div data-form-body></div>
            <div class="form-error" data-form-error hidden></div>
        </div>`;

    const foot = `
        <button class="btn ghost" data-cancel>Cancel</button>
        ${isEdit ? `<button class="btn danger sm" data-delete>${icon("trash")} Delete</button>` : ""}
        <span class="spacer"></span>
        <span class="tiny dim" data-save-state></span>
        <button class="btn primary" data-save>${icon("check")} ${isEdit ? "Save changes" : `Create ${type === "relationships" ? "relationship" : "record"}`}</button>`;

    const modalRef = openModal({
        title: title || (isEdit ? `Edit ${SCHEMAS[type] ? store.__typeName?.(type) || singular(type) : "record"}` : `New ${singular(type)}`),
        subtitle: subtitle || (isEdit ? "All changes are saved to the shared archive." : "Fill in what you know — everything can be refined later."),
        body,
        foot: foot,
        size: "wide",
        onMount: (modal, close) => {
            const bodyEl = modal.querySelector("[data-form-body]");
            const errorEl = modal.querySelector("[data-form-error]");

            const renderSection = () => {
                const section = sections[activeSection];
                bodyEl.innerHTML = `<div class="form-grid">${section.fields
                    .map((field) => renderFieldInner(field, field.key, getPath(working, field.key)))
                    .join("")}</div>`;
                const saveState = modal.querySelector("[data-save-state]");
                if (saveState) saveState.textContent = "";
            };
            renderSection();

            const updateSaveState = () => {
                const el = modal.querySelector("[data-save-state]");
                if (el) el.textContent = dirty ? "Unsaved changes" : "";
            };

            const saveDraft = debounce(() => {
                if (!store.canWriteOnline()) return;
                try {
                    localStorage.setItem(draftKey, JSON.stringify({ savedAt: new Date().toISOString(), data: working }));
                } catch (err) {}
            }, 600);

            modal.querySelectorAll("[data-section]").forEach((btn) => {
                btn.addEventListener("click", () => {
                    activeSection = Number(btn.dataset.section);
                    modal.querySelectorAll("[data-section]").forEach((b) => b.classList.toggle("active", b === btn));
                    renderSection();
                });
            });

            modal.addEventListener("input", (e) => {
                const t = e.target;
                const key = t.dataset.key;
                if (key && t.dataset.type) {
                    let value = t.value;
                    if (t.dataset.type === "tags") value = value.split(",").map((s) => s.trim()).filter(Boolean);
                    else if (t.dataset.type === "list") value = value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
                    else if (t.dataset.type === "number") value = Number(value);
                    else if (t.dataset.type === "bool") value = t.checked;
                    setPath(working, key, value);
                    dirty = true;
                    updateSaveState();
                    saveDraft();
                    if (t.dataset.attr) {
                        const out = t.parentElement.querySelector("output");
                        if (out) out.textContent = t.value;
                    }
                }
                if (t.matches("[data-picker-filter]")) {
                    const picker = t.closest("[data-picker]");
                    const q = t.value.toLowerCase();
                    picker.querySelectorAll(".opt").forEach((opt) => {
                        opt.style.display = opt.textContent.toLowerCase().includes(q) ? "" : "none";
                    });
                }
                if (t.matches("[data-gal-add], [data-gal-remove]")) return;
            });

            modal.addEventListener("change", (e) => {
                const t = e.target;
                if (t.dataset.type === "bool") {
                    setPath(working, t.dataset.key, t.checked);
                    dirty = true;
                    saveDraft();
                }
                if (t.matches("[data-key]") && t.tagName === "SELECT") {
                    // Dynamic refs depend on a select value.
                    const section = sections[activeSection];
                    if (section.fields.some((f) => f.type === "dynamic-ref" && f.collectionFrom === t.dataset.key)) {
                        renderSection();
                    }
                }
                if (t.matches(".color-input")) {
                    const sibling = t.parentElement.querySelector('input[data-type="text"]');
                    if (sibling) sibling.value = t.value;
                }
            });

            // Tag pickers, ratings, repeaters, galleries use click delegation.
            modal.addEventListener("click", async (e) => {
                const pick = e.target.closest("[data-picker] .opt");
                if (pick) {
                    const picker = pick.closest("[data-picker]");
                    const key = picker.dataset.picker;
                    const current = new Set(getPath(working, key) || []);
                    if (current.has(pick.dataset.val)) current.delete(pick.dataset.val);
                    else current.add(pick.dataset.val);
                    setPath(working, key, [...current]);
                    pick.classList.toggle("on");
                    dirty = true;
                    saveDraft();
                    const count = picker.querySelector("[data-picker-count]");
                    if (count) count.textContent = `${current.size} selected`;
                    return;
                }
                const rate = e.target.closest("[data-rate]");
                if (rate) {
                    const wrap = rate.closest("[data-rating]");
                    const key = wrap.dataset.rating;
                    const val = Number(rate.dataset.rate);
                    setPath(working, key, val);
                    wrap.dataset.value = val;
                    wrap.querySelectorAll("[data-rate]").forEach((b) => b.classList.toggle("on", Number(b.dataset.rate) <= val));
                    const label = wrap.querySelector(".rating-label");
                    if (label) label.textContent = (OPTIONS.IMPORTANCE.find((i) => i.value === val) || {}).label || "";
                    dirty = true;
                    saveDraft();
                    return;
                }
                const addRep = e.target.closest("[data-rep-add]");
                if (addRep) {
                    const path = addRep.dataset.repAdd;
                    const arr = getPath(working, path) || [];
                    arr.push({});
                    setPath(working, path, arr);
                    renderSection();
                    saveDraft();
                    return;
                }
                const rmRep = e.target.closest("[data-rep-remove]");
                if (rmRep) {
                    const wrap = rmRep.closest("[data-repeater]");
                    const path = wrap.dataset.repeater;
                    const arr = getPath(working, path) || [];
                    arr.splice(Number(rmRep.dataset.repRemove), 1);
                    setPath(working, path, arr);
                    renderSection();
                    saveDraft();
                    return;
                }
                const galRemove = e.target.closest("[data-gal-remove]");
                if (galRemove) {
                    const wrap = galRemove.closest("[data-image-field]");
                    const path = wrap.dataset.imageField;
                    const arr = getPath(working, path) || [];
                    arr.splice(Number(galRemove.dataset.galRemove), 1);
                    setPath(working, path, arr);
                    renderSection();
                    saveDraft();
                    return;
                }
                const galAdd = e.target.closest("[data-gal-add]");
                if (galAdd) {
                    const path = galAdd.dataset.galAdd;
                    const arr = getPath(working, path) || [];
                    arr.push({ url: "", caption: "" });
                    setPath(working, path, arr);
                    renderSection();
                    return;
                }
                const clearImage = e.target.closest("[data-clear-image]");
                if (clearImage) {
                    setPath(working, clearImage.dataset.clearImage, "");
                    renderSection();
                    saveDraft();
                    return;
                }
                const lightbox = e.target.closest("[data-lightbox]");
                if (lightbox) {
                    openLightbox(lightbox.dataset.lightbox);
                    return;
                }
                const uploadBtn = e.target.closest("[data-upload]");
                if (uploadBtn) {
                    const path = uploadBtn.dataset.upload;
                    await pickAndUpload(async (url) => {
                        setPath(working, path, url);
                        renderSection();
                        saveDraft();
                        dirty = true;
                    });
                    return;
                }
                const multi = e.target.closest("[data-upload-multi]");
                if (multi) {
                    const path = multi.dataset.uploadMulti;
                    await pickAndUpload(
                        async (url, file) => {
                            const arr = getPath(working, path) || [];
                            arr.push({ url, caption: file?.name || "" });
                            setPath(working, path, arr);
                            renderSection();
                            saveDraft();
                            dirty = true;
                        },
                        true,
                    );
                    return;
                }
                const discard = e.target.closest("[data-discard-draft]");
                if (discard) {
                    localStorage.removeItem(draftKey);
                    modal.querySelector(".banner")?.remove();
                    return;
                }
                if (e.target.closest("[data-cancel]")) {
                    close();
                    return;
                }
                if (e.target.closest("[data-delete]")) {
                    close();
                    confirmDialog({
                        title: `Delete ${singular(type)}?`,
                        message: `Delete <b>${esc(store.nameOf(type, record.key) || "this record")}</b>? References from other records will be cleaned up.`,
                        detail: "This cannot be undone. Export a backup first if you need a safety net.",
                        confirmLabel: "Delete permanently",
                        onConfirm: async () => {
                            store.remove(type, { key: record.key });
                            toast(`${singular(type)} deleted.`, "success");
                            localStorage.removeItem(draftKey);
                            onDeleted?.(record);
                        },
                    });
                    return;
                }
                if (e.target.closest("[data-save]")) {
                    const missing = [];
                    for (const section of sections) {
                        for (const f of section.fields) {
                            if (!f.required) continue;
                            const v = getPath(working, f.key);
                            if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) missing.push(f.label);
                        }
                    }
                    if (type === "relationships" && working.aId && working.aId === working.bId) missing.push("Two different characters");
                    if (missing.length) {
                        const firstSectionIdx = sections.findIndex((s) =>
                            s.fields.some((f) => f.required && missing.includes(f.label)),
                        );
                        activeSection = Math.max(0, firstSectionIdx);
                        modal.querySelectorAll("[data-section]").forEach((b, i) => b.classList.toggle("active", i === activeSection));
                        renderSection();
                        errorEl.hidden = false;
                        errorEl.innerHTML = `${icon("alert")} <div>Please complete: <b>${esc([...new Set(missing)].join(", "))}</b></div>`;
                        return;
                    }
                    errorEl.hidden = true;
                    try {
                        const clean = JSON.parse(JSON.stringify(working));
                        delete clean.id;
                        const saved = store.save(type, clean);
                        localStorage.removeItem(draftKey);
                        toast(`${singular(type)} ${isEdit ? "updated" : "created"}.`, "success");
                        close();
                        onSaved?.(saved);
                    } catch (err) {
                        errorEl.hidden = false;
                        errorEl.innerHTML = `${icon("alert")} <div>${esc(err.message || "Could not save.")}</div>`;
                    }
                }
            });

            // Warn before closing with unsaved changes.
            const originalClose = close;
            modal.querySelector("[data-cancel]")?.addEventListener("click", close);
        },
        onClose: () => {
            formContext.working = {};
        },
    });

    async function pickAndUpload(handler, multiple = false) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.multiple = multiple;
        input.onchange = async () => {
            const files = Array.from(input.files || []);
            for (const file of files) {
                try {
                    toast(`Uploading ${file.name}…`, "info", { timeout: 1600 });
                    const url = await store.uploadFile(file);
                    await handler(url, file);
                    toast("Image uploaded.", "success", { timeout: 2200 });
                } catch (err) {
                    toast(err.message || "Upload failed.", "error");
                }
            }
        };
        input.click();
    }

    return modalRef;
}

function singular(type) {
    return (
        {
            characters: "character",
            events: "event",
            factions: "faction",
            storylines: "storyline",
            relationships: "relationship",
            mysteries: "mystery",
            secrets: "secret",
            locations: "location",
            items: "item",
            links: "connection",
            maps: "map",
        }[type] || type
    );
}

/* Expose helpers for views */
export { singular, getPath, setPath };
