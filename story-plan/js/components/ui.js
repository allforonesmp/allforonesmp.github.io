/* AllForOne Story Planner — shared UI primitives: toasts, modals, confirms,
   markdown field, reference pickers, image uploads, small building blocks. */

import { el, clear, icon, toArray, debounce } from "../util.js";
import { renderMarkdown } from "../md.js";
import { ENTITIES } from "../schema.js";
import { docs, byId } from "../store.js";
import { db } from "../api.js";

/* ------------------------------------------------------------------ toasts */

const TOAST_ICONS = { success: "check", error: "alert", warning: "alert", info: "info" };

export function toast(message, type = "info", timeout = 4200) {
    const host = document.getElementById("toasts");
    if (!host) return;
    const node = el("div", { class: `toast ${type}` }, [icon(TOAST_ICONS[type] || "info"), el("span", { text: message })]);
    host.appendChild(node);
    const remove = () => {
        node.classList.add("leaving");
        setTimeout(() => node.remove(), 220);
    };
    node.addEventListener("click", remove);
    setTimeout(remove, timeout);
}

export const toastError = (err, context = "") => {
    const msg = err?.message || String(err);
    toast(context ? `${context}: ${msg}` : msg, "error", 6000);
};

/* ------------------------------------------------------------------ modals */

let modalStack = [];

export function openModal({ title, body, footer, wide = false, onClose, className = "" }) {
    const backdrop = el("div", { class: "modal-backdrop", role: "dialog", "aria-modal": "true" });
    const modal = el("div", { class: `modal ${wide ? "wide" : ""} ${className}` });
    const close = () => closeModal(entry);

    if (title) {
        modal.appendChild(
            el("div", { class: "modal-head" }, [
                el("h2", { text: title }),
                el("button", { class: "icon-btn", type: "button", "aria-label": "Close", onclick: close }, icon("x")),
            ])
        );
    }
    const bodyEl = el("div", { class: "modal-body" });
    if (typeof body === "string") bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);
    modal.appendChild(bodyEl);

    if (footer) {
        const foot = el("div", { class: "modal-foot" });
        (Array.isArray(footer) ? footer : [footer]).forEach((f) => foot.appendChild(f));
        modal.appendChild(foot);
    }

    backdrop.appendChild(modal);
    backdrop.addEventListener("mousedown", (e) => {
        if (e.target === backdrop) close();
    });

    document.getElementById("modalRoot").appendChild(backdrop);
    document.body.style.overflow = "hidden";

    const entry = { backdrop, modal, close, onClose };
    modalStack.push(entry);
    setTimeout(() => {
        const focusable = modal.querySelector("input:not([type=hidden]), textarea, select, button.btn-primary");
        if (focusable) focusable.focus();
    }, 60);
    return entry;
}

export function closeModal(entry) {
    const target = entry || modalStack[modalStack.length - 1];
    if (!target) return;
    target.backdrop.remove();
    modalStack = modalStack.filter((m) => m !== target);
    if (!modalStack.length) document.body.style.overflow = "";
    if (target.onClose) {
        try {
            target.onClose();
        } catch (_) {}
    }
}

export function closeAllModals() {
    while (modalStack.length) closeModal(modalStack[modalStack.length - 1]);
}

export function confirmDialog({ title = "Are you sure?", message, confirmLabel = "Confirm", danger = false }) {
    return new Promise((resolve) => {
        let settled = false;
        const done = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        const cancel = el("button", { class: "btn btn-ghost", type: "button", onclick: () => { done(false); closeModal(entry); } }, "Cancel");
        const ok = el(
            "button",
            {
                class: `btn ${danger ? "btn-danger" : "btn-primary"}`,
                type: "button",
                onclick: () => {
                    done(true);
                    closeModal(entry);
                },
            },
            confirmLabel
        );
        const entry = openModal({
            title,
            body: el("p", { style: { fontSize: "0.9rem", lineHeight: "1.6", color: "var(--text-medium)" }, text: message || "" }),
            footer: [cancel, ok],
            onClose: () => done(false),
        });
    });
}

export function promptDialog({ title, label, value = "", placeholder = "", multiline = false, confirmLabel = "Save" }) {
    return new Promise((resolve) => {
        let settled = false;
        const done = (v) => {
            if (settled) return;
            settled = true;
            resolve(v);
        };
        const input = multiline
            ? el("textarea", { placeholder, value, rows: 4 })
            : el("input", { type: "text", placeholder, value });
        const submit = () => {
            const v = input.value.trim();
            done(v || null);
            closeModal(entry);
        };
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !multiline) submit();
        });
        const entry = openModal({
            title,
            body: el("label", { class: "field" }, [el("span", { class: "field-label", text: label }), input]),
            footer: [
                el("button", { class: "btn btn-ghost", type: "button", onclick: () => { done(null); closeModal(entry); } }, "Cancel"),
                el("button", { class: "btn btn-primary", type: "button", onclick: submit }, confirmLabel),
            ],
            onClose: () => done(null),
        });
        setTimeout(() => input.focus(), 80);
    });
}

/* -------------------------------------------------------------- md editor */

export function markdownField({ value = "", onChange, tall = false, placeholder = "Write in Markdown…" }) {
    const wrap = el("div", { class: "md-editor", dataset: { mode: "split" } });
    const textarea = el("textarea", {
        placeholder,
        value: value || "",
        style: tall ? { minHeight: "260px" } : {},
    });
    const preview = el("div", { class: "md-preview prose" });

    const refresh = () => {
        preview.innerHTML = renderMarkdown(textarea.value) || `<p style="color:var(--text-light)">Nothing yet.</p>`;
    };

    const emit = () => {
        refresh();
        if (onChange) onChange(textarea.value);
    };

    const insert = (before, after = "", blockPrefix = "") => {
        const { selectionStart: start, selectionEnd: end, value: v } = textarea;
        const selected = v.slice(start, end);
        let insertText;
        if (blockPrefix) {
            const lineStart = v.lastIndexOf("\n", start - 1) + 1;
            textarea.value = v.slice(0, lineStart) + blockPrefix + v.slice(lineStart);
            textarea.selectionStart = textarea.selectionEnd = end + blockPrefix.length;
            emit();
            return;
        }
        insertText = `${before}${selected || ""}${after}`;
        textarea.value = v.slice(0, start) + insertText + v.slice(end);
        textarea.selectionStart = start + before.length;
        textarea.selectionEnd = start + before.length + (selected || "").length;
        textarea.focus();
        emit();
    };

    const tool = (iconName, title, fn) => el("button", { type: "button", title, "aria-label": title, onclick: fn }, icon(iconName));
    const textTool = (label, title, fn) => el("button", { type: "button", title, "aria-label": title, onclick: fn, text: label });

    const toolbar = el("div", { class: "md-toolbar" }, [
        textTool("B", "Bold", () => insert("**", "**")),
        textTool("I", "Italic", () => insert("*", "*")),
        tool("list", "Bulleted list", () => insert("- ", "", "- ")),
        textTool("1.", "Numbered list", () => insert("1. ", "", "1. ")),
        textTool("☑", "Checklist", () => insert("- [ ] ", "", "- [ ] ")),
        el("span", { class: "md-sep" }),
        textTool("H2", "Heading", () => insert("## ", "", "## ")),
        textTool("❝", "Quote", () => insert("> ", "", "> ")),
        textTool("`", "Inline code", () => insert("`", "`")),
        tool("link", "Link", () => insert("[", "](https://)")),
        el("span", { class: "md-sep" }),
        el("button", {
            type: "button",
            class: "md-tab",
            title: "Toggle preview",
            onclick: () => {
                wrap.dataset.mode = wrap.dataset.mode === "split" ? "edit" : "split";
                refresh();
            },
        }, "Preview"),
    ]);

    textarea.addEventListener("input", emit);
    wrap.append(toolbar, textarea, preview);

    if (tall) textarea.style.minHeight = "260px";

    refresh();
    wrap.getValue = () => textarea.value;
    wrap.setValue = (v) => {
        textarea.value = v ?? "";
        refresh();
    };
    return wrap;
}

/* ---------------------------------------------------------- ref pickers */

export function refPicker({ collection, value, onChange, multiple = false, placeholder = "Search…" }) {
    const ent = ENTITIES[collection];
    let selected = multiple ? toArray(value).map(String) : value ? [String(value)] : [];

    const wrapper = el("div", { class: "picker" });
    const chosen = el("div", { class: "picker-chosen" });
    const input = el("input", { type: "text", class: "picker-input", placeholder, autocomplete: "off" });
    const results = el("div", { class: "picker-results" });

    const renderChosen = () => {
        clear(chosen);
        if (!selected.length) {
            chosen.classList.add("empty");
            chosen.textContent = multiple ? "None linked yet" : "Not set";
            return;
        }
        chosen.classList.remove("empty");
        selected.forEach((id) => {
            const doc = byId(collection, id);
            chosen.appendChild(
                el("span", { class: "chip" }, [
                    el("span", { text: doc ? ent.title(doc) : "(missing record)" }),
                    el("button", {
                        type: "button",
                        class: "x",
                        "aria-label": "Remove",
                        onclick: () => {
                            selected = selected.filter((s) => s !== String(id));
                            renderChosen();
                            commit();
                        },
                    }, icon("x")),
                ])
            );
        });
    };

    const renderResults = () => {
        const q = input.value.trim().toLowerCase();
        clear(results);
        const pool = docs(collection)
            .filter((d) => !selected.includes(String(d.id)))
            .filter((d) => {
                if (!q) return true;
                const hay = [ent.title(d), ent.subtitle(d), d.code, d.username, ...toArray(d.tags)]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                return hay.includes(q);
            })
            .slice(0, 40);

        if (!pool.length) {
            results.appendChild(el("div", { class: "picker-empty", text: docs(collection).length ? "No matches" : `No ${ent.plural.toLowerCase()} yet` }));
            return;
        }
        pool.forEach((doc) => {
            results.appendChild(
                el("button", {
                    type: "button",
                    class: "picker-opt",
                    onclick: () => {
                        if (!multiple) selected = [String(doc.id)];
                        else selected.push(String(doc.id));
                        input.value = "";
                        renderChosen();
                        commit();
                        if (!multiple) clear(results);
                        else renderResults();
                        input.focus();
                    },
                }, [
                    el("span", { class: "po-name", text: ent.title(doc) }),
                    el("span", { class: "po-meta", text: ent.subtitle(doc) || "" }),
                ])
            );
        });
    };

    const commit = () => {
        if (!onChange) return;
        onChange(multiple ? selected.slice() : selected[0] || "");
    };

    input.addEventListener("input", debounce(renderResults, 120));
    input.addEventListener("focus", renderResults);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const first = results.querySelector(".picker-opt");
            if (first) first.click();
        }
        if (e.key === "Backspace" && !input.value && selected.length) {
            selected.pop();
            renderChosen();
            commit();
        }
    });

    wrapper.append(chosen, input, results);
    renderChosen();
    wrapper.refresh = () => {
        renderChosen();
    };
    return wrapper;
}

/* -------------------------------------------------------- image uploads */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function imageUploader({ value, onChange, anyFile = false, label = "Upload image" }) {
    let urls = toArray(value).filter(Boolean);
    const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "0.5rem" } });
    const thumbs = el("div", { class: "thumb-row" });
    const drop = el("label", { class: "file-drop" });
    const input = el("input", {
        type: "file",
        accept: anyFile ? undefined : "image/*",
        multiple: true,
        hidden: true,
    });
    const status = el("span", { class: "upload-progress" });

    clear(drop);
    drop.append(icon("upload"), el("span", { text: label }), el("span", { class: "field-hint", text: anyFile ? "Any file · max 20 MB" : "JPG, PNG, WebP, GIF · max 8 MB" }));
    drop.appendChild(input);

    const renderThumbs = () => {
        clear(thumbs);
        urls.forEach((url, idx) => {
            const isImage = /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url);
            thumbs.appendChild(
                el("div", { class: "thumb" }, [
                    isImage
                        ? el("img", { src: url, alt: "", loading: "lazy" })
                        : el("a", { href: url, target: "_blank", rel: "noopener noreferrer", style: { display: "grid", placeItems: "center", height: "100%" } }, icon("file")),
                    el("button", {
                        type: "button",
                        class: "rm",
                        "aria-label": "Remove",
                        onclick: () => {
                            urls = urls.filter((u) => u !== url);
                            renderThumbs();
                            onChange && onChange(urls.slice());
                        },
                    }, icon("x")),
                ])
            );
        });
    };

    const handleFiles = async (files) => {
        for (const file of Array.from(files)) {
            const max = anyFile ? MAX_FILE_BYTES : MAX_IMAGE_BYTES;
            if (file.size > max) {
                toast(`${file.name} is too large (max ${Math.round(max / 1048576)} MB).`, "error");
                continue;
            }
            if (!anyFile && !/^image\//.test(file.type)) {
                toast(`${file.name} is not an image.`, "error");
                continue;
            }
            status.textContent = `Uploading ${file.name}…`;
            try {
                const { url } = await db.upload(file);
                urls.push(url);
                renderThumbs();
                onChange && onChange(urls.slice());
                status.textContent = "";
                toast(`${file.name} uploaded.`, "success", 2200);
            } catch (err) {
                status.textContent = "";
                toastError(err, `Uploading ${file.name}`);
            }
        }
    };

    input.addEventListener("change", () => {
        if (input.files?.length) handleFiles(input.files);
        input.value = "";
    });
    ["dragenter", "dragover"].forEach((evt) =>
        drop.addEventListener(evt, (e) => {
            e.preventDefault();
            drop.classList.add("over");
        })
    );
    ["dragleave", "drop"].forEach((evt) =>
        drop.addEventListener(evt, (e) => {
            e.preventDefault();
            drop.classList.remove("over");
            if (evt === "drop" && e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
        })
    );

    wrap.append(thumbs, drop, status);
    renderThumbs();
    return wrap;
}

/* ---------------------------------------------------------- small pieces */

export function emptyState({ iconName = "sparkles", title, message, action }) {
    return el("div", { class: "empty" }, [
        el("div", { class: "empty-icon" }, icon(iconName)),
        el("strong", { text: title }),
        message ? el("p", { text: message }) : null,
        action || null,
    ]);
}

export function loadingState(message = "Loading…") {
    return el("div", { class: "loading-line" }, [el("span", { class: "spinner" }), el("span", { text: message })]);
}

export function errorState(err, retry) {
    const node = el("div", { class: "error-panel" }, [
        icon("alert"),
        el("div", {}, [
            el("strong", { text: err?.message || "Something went wrong" }),
            el("p", {
                text:
                    err?.status === 403
                        ? "The backend project rules are blocking this collection. An owner needs to allow authenticated reads for this collection in the BreadBackend dashboard."
                        : "You can retry, or keep working — unsaved changes are kept locally.",
            }),
            retry ? el("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: retry, style: { marginTop: "0.5rem" } }, "Retry") : null,
        ]),
    ]);
    return node;
}

export function badge(text, variant = "", opts = {}) {
    if (!text) return null;
    return el("span", { class: `badge ${variant}`, title: opts.title || "" }, [opts.dot ? el("span", { class: "dot" }) : null, text]);
}

const IMPORTANCE_VARIANT = {
    Critical: "danger",
    High: "warning",
    Medium: "",
    Low: "muted",
    Minor: "muted",
};
export function importanceBadge(level) {
    return badge(level || "—", IMPORTANCE_VARIANT[level] || "ghost");
}

const STATUS_VARIANT = {
    Completed: "success",
    Done: "success",
    Recorded: "success",
    Resolved: "success",
    Ready: "success",
    Confirmed: "success",
    Active: "success",
    "In Progress": "warning",
    "In Development": "warning",
    Developing: "warning",
    Scheduled: "warning",
    Planned: "",
    Planning: "ghost",
    Draft: "ghost",
    Outline: "ghost",
    "On Hold": "warning",
    "Not Started": "ghost",
    Idea: "muted",
    Cancelled: "danger",
    Abandoned: "danger",
    Archived: "muted",
    Broken: "danger",
    Missing: "danger",
    Deceased: "muted",
};
export function statusBadge(status) {
    if (!status) return null;
    return badge(status, STATUS_VARIANT[status] || "ghost");
}

export function knowledgeBadge(level) {
    const variant =
        level === "Public Knowledge" ? "success"
        : level === "Secret" ? "danger"
        : level === "Restricted Knowledge" ? "warning"
        : level === "Confirmed" ? "success"
        : level === "Unknown" || level === "Unconfirmed" ? "muted"
        : "ghost";
    return badge(level, variant);
}

export function meter(label, value, { suffix = "%", gold = false } = {}) {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    return el("div", { class: "meter" }, [
        el("div", { class: "meter-top" }, [el("strong", { text: label }), el("span", { text: `${pct}${suffix}` })]),
        el("div", { class: `progress ${gold ? "gold" : ""}` }, [el("span", { style: { width: `${pct}%` } })]),
    ]);
}

export function statTile({ label, value, hint, iconName, accent, onclick, href }) {
    const node = el(onclick || href ? "a" : "div", {
        class: "stat",
        href: href || undefined,
        onclick,
        style: accent ? { "--stat-accent": accent } : {},
        role: onclick ? "button" : undefined,
    }, [
        el("div", { class: "stat-label" }, [iconName ? icon(iconName) : null, label]),
        el("div", { class: "stat-value", text: String(value) }),
        hint ? el("div", { class: "stat-hint", text: hint }) : null,
    ]);
    if (iconName) {
        const labelNode = node.querySelector(".stat-label");
        labelNode.style.display = "flex";
        labelNode.style.alignItems = "center";
        labelNode.style.gap = "0.3rem";
        const svg = labelNode.querySelector("svg");
        if (svg) svg.style.width = "13px";
    }
    return node;
}

export function sectionTitle(text, extra) {
    return el("div", { class: "section-title" }, [text, extra || null]);
}

export function pageHead(title, lead, actions, extra) {
    return el("div", { class: "page-head" }, [
        el("div", {}, [el("h1", {}, [title, extra || null]), lead ? el("p", { class: "lead", text: lead }) : null]),
        actions ? el("div", { class: "page-actions" }, actions) : null,
    ]);
}

export function card({ title, iconName, actions, body, flush = false, className = "" }) {
    const head =
        title || actions
            ? el("div", { class: "card-head" }, [
                  title ? el("h2", {}, [iconName ? icon(iconName) : null, title]) : el("div"),
                  actions ? el("div", { class: "head-actions" }, actions) : null,
              ])
            : null;
    return el("div", { class: `card ${className}` }, [head, el("div", { class: `card-body ${flush ? "flush" : ""}` }, body)]);
}

export function refChip(collection, id, label) {
    const ent = ENTITIES[collection];
    const doc = byId(collection, id);
    const text = label || (doc ? ent.title(doc) : "(missing)");
    const accentMap = {
        characters: "accent-character",
        events: "accent-event",
        lore: "accent-lore",
        factions: "accent-faction",
        locations: "accent-location",
        story_arcs: "accent-arc",
        story_threads: "accent-thread",
        notes: "accent-note",
    };
    return el("a", {
        class: `chip ${accentMap[collection] || ""}`,
        href: `#/${detailSegment(collection)}/${encodeURIComponent(id)}`,
    }, [text]);
}

export function detailSegment(collection) {
    return (
        {
            seasons: "season",
            chapters: "chapter",
            story_arcs: "arc",
            story_threads: "thread",
            events: "event",
            characters: "character",
            lore: "lore",
            factions: "faction",
            locations: "location",
            storyboards: "storyboard",
            notes: "note",
        }[collection] || "dashboard"
    );
}

export function avatarFor(doc, size = "") {
    if (doc?.image) {
        return el("img", { class: `avatar-img ${size}`, src: doc.image, alt: "", loading: "lazy", onerror: (e) => e.target.replaceWith(fallbackAvatar(doc, size)) });
    }
    return fallbackAvatar(doc, size);
}

function fallbackAvatar(doc, size) {
    const name = doc?.name || doc?.title || "?";
    const letters = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase();
    return el(
        "div",
        {
            class: `avatar-img ${size}`,
            style: {
                display: "grid",
                placeItems: "center",
                fontFamily: "Spectral, serif",
                fontSize: size === "sm" ? "0.9rem" : "1.6rem",
                color: "var(--primary-blue)",
                background: "var(--light-blue)",
                fontWeight: "700",
            },
            text: letters,
        }
    );
}

export function tagRow(tags, { onRemove, max = 40 } = {}) {
    const list = toArray(tags).filter(Boolean).slice(0, max);
    if (!list.length) return null;
    return el(
        "div",
        { class: "chip-row" },
        list.map((t) =>
            el("span", { class: "chip" }, [
                t,
                onRemove
                    ? el("button", { class: "x", type: "button", "aria-label": `Remove ${t}`, onclick: () => onRemove(t) }, icon("x"))
                    : null,
            ])
        )
    );
}

export function tagsInput({ value = [], onChange, placeholder = "Add tag and press Enter" }) {
    let tags = toArray(value).map(String);
    const wrap = el("div", { class: "picker", style: { padding: "0.35rem" } });
    const row = el("div", { class: "chip-row", style: { marginBottom: "0.35rem" } });
    const input = el("input", { type: "text", class: "picker-input", placeholder });
    input.style.border = "none";

    const render = () => {
        clear(row);
        tags.forEach((t) => {
            row.appendChild(
                el("span", { class: "chip" }, [
                    t,
                    el("button", {
                        class: "x",
                        type: "button",
                        "aria-label": `Remove ${t}`,
                        onclick: () => {
                            tags = tags.filter((x) => x !== t);
                            render();
                            onChange && onChange(tags.slice());
                        },
                    }, icon("x")),
                ])
            );
        });
        if (!tags.length) row.appendChild(el("span", { class: "field-hint", text: "No tags" }));
    };

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const v = input.value.trim().replace(/,$/, "");
            if (v && !tags.includes(v)) {
                tags.push(v);
                input.value = "";
                render();
                onChange && onChange(tags.slice());
            }
        }
        if (e.key === "Backspace" && !input.value && tags.length) {
            tags.pop();
            render();
            onChange && onChange(tags.slice());
        }
    });

    wrap.append(row, input);
    render();
    return wrap;
}

export function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(
            () => toast("Copied.", "success", 1600),
            () => toast("Could not copy.", "error")
        );
    } else {
        toast("Clipboard unavailable in this browser.", "warning");
    }
}
