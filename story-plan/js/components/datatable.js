/* AllForOne Story Planner — reusable searchable / filterable / sortable list.
 *
 * Client-side only: BreadBackend's SDK offers limit/orderBy but no `where`, so
 * filtering happens here over the cached collection. Rows link to detail views.
 */

import { el, clear, icon, compareText, debounce } from "../util.js";
import { ENTITIES } from "../schema.js";
import { docs, subscribe } from "../store.js";
import { emptyState, pageHead } from "./ui.js";
import { openEditor, createAndEdit } from "./editor.js";
import { navigate, detailPath } from "../router.js";

const PAGE_SIZE = 40;

/**
 * @param {object} cfg
 *  collection, title, lead, columns[], filters[], sorts[], searchFields[],
 *  createLabel, emptyTitle, emptyMessage, actions[], rowHref(doc), extra(doc)
 */
export function listView(cfg) {
    const initialParams = cfg.params || new URLSearchParams();
    const collection = cfg.collection;
    const ent = ENTITIES[collection];
    const root = el("div", { class: "page" });

    const filtersState = {};
    let searchTerm = "";
    let sortKey = initialParams.get("sort") || cfg.defaultSort || (cfg.sorts?.[0]?.key ?? "");
    let sortDir = cfg.defaultSortDir || "asc";
    let showArchived = false;
    let limit = PAGE_SIZE;

    /* ---------------- header ---------------- */
    const headActions = [];
    if (cfg.actions) headActions.push(...cfg.actions);
    headActions.push(
        el("button", {
            class: "btn btn-primary",
            type: "button",
            onclick: () => createAndEdit(collection, cfg.createPreset ? cfg.createPreset() : {}),
        }, [icon("plus"), cfg.createLabel || `New ${ent.label}`])
    );
    root.appendChild(pageHead(cfg.title || ent.plural, cfg.lead || "", headActions));

    /* ---------------- toolbar ---------------- */
    const searchInput = el("input", {
        type: "search",
        value: initialParams.get("q") || "",
        placeholder: cfg.searchPlaceholder || `Search ${ent.plural.toLowerCase()}…`,
        "aria-label": `Search ${ent.plural}`,
    });
    if (initialParams.get("q")) searchTerm = String(initialParams.get("q")).toLowerCase();
    searchInput.addEventListener(
        "input",
        debounce(() => {
            searchTerm = searchInput.value.trim().toLowerCase();
            limit = PAGE_SIZE;
            render();
        }, 160)
    );

    const filterEls = {};
    const filterHost = el("div", { class: "row", style: { gap: "0.4rem", flexWrap: "wrap" } });

    (cfg.filters || []).forEach((f) => {
        let options = f.options;
        if (typeof options === "function") options = options();
        if (f.collection) {
            options = docs(f.collection)
                .filter((d) => !d.archived)
                .map((d) => ({ value: d.id, label: ENTITIES[f.collection].title(d) }));
        }
        const preset = initialParams.get(f.key) || "";
        if (preset) filtersState[f.key] = preset;
        const select = el("select", { class: "select-sm", "aria-label": `Filter by ${f.label}` }, [
            el("option", { value: "", text: `All ${f.label.toLowerCase()}` }),
            ...options.map((o) => {
                const val = typeof o === "string" ? o : o.value;
                const label = typeof o === "string" ? o : o.label;
                return el("option", { value: val, selected: String(preset) === String(val), text: label });
            }),
        ]);
        select.addEventListener("change", () => {
            if (select.value) filtersState[f.key] = select.value;
            else delete filtersState[f.key];
            limit = PAGE_SIZE;
            render();
        });
        filterEls[f.key] = select;
        filterHost.appendChild(select);
    });

    const sortOptions = cfg.sorts || [
        { key: "updatedAt", label: "Last modified" },
        { key: "title", label: "Alphabetical" },
    ];
    const sortSelect = el("select", { class: "select-sm", "aria-label": "Sort by" }, [
        ...sortOptions.map((s) => el("option", { value: s.key, selected: s.key === sortKey, text: `Sort: ${s.label}` })),
    ]);
    sortSelect.addEventListener("change", () => {
        sortKey = sortSelect.value;
        render();
    });
    const dirBtn = el(
        "button",
        { class: "icon-btn", type: "button", title: "Toggle sort direction", onclick: () => { sortDir = sortDir === "asc" ? "desc" : "asc"; dirBtn.innerHTML = ""; dirBtn.appendChild(icon(sortDir === "asc" ? "chevronDown" : "chevronUp")); render(); } },
        icon(sortDir === "asc" ? "chevronDown" : "chevronUp")
    );

    const archivedToggle = cfg.hideArchivedToggle
        ? null
        : el("button", {
              class: "chip-button",
              type: "button",
              title: "Include archived records",
              onclick: () => {
                  showArchived = !showArchived;
                  archivedToggle.classList.toggle("on", showArchived);
                  limit = PAGE_SIZE;
                  render();
              },
          }, [icon("archive"), "Archived"]);

    const countLabel = el("span", { class: "filter-count" });

    const toolbar = el("div", { class: "toolbar" }, [
        el("div", { class: "search-mini grow" }, [icon("search"), searchInput]),
        filterHost,
        sortSelect,
        dirBtn,
        archivedToggle,
        countLabel,
    ]);
    root.appendChild(toolbar);

    /* ---------------- table host ---------------- */
    const tableHost = el("div", { class: "card" });
    root.appendChild(tableHost);

    /* ---------------- data pipeline ---------------- */
    function allDocs() {
        return showArchived ? docs(collection) : docs(collection).filter((d) => !d.archived);
    }

    function matches(doc) {
        if (searchTerm) {
            const fields = cfg.searchFields || ent.search || ["title", "name"];
            const hay = fields
                .flatMap((f) => (Array.isArray(doc[f]) ? doc[f] : [doc[f]]))
                .filter((v) => v !== undefined && v !== null && v !== "")
                .join(" ")
                .toLowerCase();
            if (!hay.includes(searchTerm)) return false;
        }
        for (const [key, value] of Object.entries(filtersState)) {
            const def = (cfg.filters || []).find((f) => f.key === key);
            if (!def) continue;
            const current = doc[key];
            if (Array.isArray(current)) {
                if (!current.map(String).includes(String(value))) return false;
            } else if (String(current ?? "") !== String(value)) {
                return false;
            }
        }
        if (cfg.predicate && !cfg.predicate(doc)) return false;
        return true;
    }

    function sortValue(doc, key) {
        const def = (cfg.sorts || []).find((s) => s.key === key);
        if (def?.get) return def.get(doc);
        if (key === "title") return ent.title(doc);
        if (key === "createdAt" || key === "updatedAt") return Date.parse(doc[key]) || 0;
        return doc[key];
    }

    function filteredSorted() {
        const list = allDocs().filter(matches);
        list.sort((a, b) => {
            const va = sortValue(a, sortKey);
            const vb = sortValue(b, sortKey);
            let cmp;
            if (typeof va === "number" || typeof vb === "number") cmp = (Number(va) || 0) - (Number(vb) || 0);
            else cmp = compareText(va, vb);
            return sortDir === "asc" ? cmp : -cmp;
        });
        return list;
    }

    /* ---------------- rendering ---------------- */
    function render() {
        clear(tableHost);
        const rows = filteredSorted();
        countLabel.textContent = `${rows.length} ${rows.length === 1 ? ent.label.toLowerCase() : ent.plural.toLowerCase()}`;

        if (!docs(collection).length && !showArchived) {
            tableHost.appendChild(
                emptyState({
                    iconName: ent.icon,
                    title: cfg.emptyTitle || `No ${ent.plural.toLowerCase()} yet`,
                    message: cfg.emptyMessage || `Create your first ${ent.label.toLowerCase()} to start building this part of the story.`,
                    action: el("button", { class: "btn btn-primary", type: "button", onclick: () => createAndEdit(collection) }, [icon("plus"), cfg.createLabel || `New ${ent.label}`]),
                })
            );
            return;
        }

        if (!rows.length) {
            tableHost.appendChild(
                el("div", { class: "empty" }, [
                    el("div", { class: "empty-icon" }, icon("search")),
                    el("strong", { text: "Nothing matches those filters" }),
                    el("p", { text: "Try a different search term, or clear the filters." }),
                    el("button", {
                        class: "btn btn-ghost btn-sm",
                        type: "button",
                        onclick: () => {
                            searchInput.value = "";
                            searchTerm = "";
                            Object.keys(filtersState).forEach((k) => delete filtersState[k]);
                            Object.values(filterEls).forEach((s) => (s.value = ""));
                            render();
                        },
                    }, "Clear filters"),
                ])
            );
            return;
        }

        const visible = rows.slice(0, limit);
        const wrap = el("div", { class: "table-wrap" });
        const table = el("table", { class: "data" });
        const thead = el("thead");
        const tr = el("tr");
        (cfg.columns || defaultColumns(collection)).forEach((col) => {
            const th = el("th", {}, [
                col.label,
                col.sortable !== false ? el("span", { class: "sort-ind", text: sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : "" }) : null,
            ]);
            if (col.sortable !== false) {
                th.dataset.sort = col.key;
                th.addEventListener("click", () => {
                    if (sortKey === col.key) sortDir = sortDir === "asc" ? "desc" : "asc";
                    else {
                        sortKey = col.key;
                        sortDir = "asc";
                    }
                    render();
                });
            }
            if (col.width) th.style.width = col.width;
            tr.appendChild(th);
        });
        tr.appendChild(el("th", { style: { width: "44px" } }));
        thead.appendChild(tr);
        table.appendChild(thead);

        const tbody = el("tbody");
        visible.forEach((doc) => {
            const row = el("tr", { dataset: { id: doc.id } });
            row.addEventListener("click", (e) => {
                if (e.target.closest("button, a")) return;
                navigate(cfg.rowHref ? cfg.rowHref(doc) : detailPath(collection, doc.id));
            });
            (cfg.columns || defaultColumns(collection)).forEach((col) => {
                const td = el("td", { class: col.nowrap === false ? "" : "nowrap" });
                const value = col.get ? col.get(doc) : doc[col.key];
                if (value instanceof Node) td.appendChild(value);
                else td.textContent = value ?? "";
                if (col.className) td.className += ` ${col.className}`;
                row.appendChild(td);
            });
            const actions = el("td", { class: "nowrap" });
            actions.appendChild(
                el("button", {
                    class: "icon-btn",
                    type: "button",
                    style: { width: "30px", height: "30px" },
                    title: "Quick edit",
                    "aria-label": `Edit ${ent.title(doc)}`,
                    onclick: (e) => {
                        e.stopPropagation();
                        openEditor(collection, doc.id);
                    },
                }, icon("edit"))
            );
            row.appendChild(actions);

            if (doc.archived) row.style.opacity = "0.62";
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        tableHost.appendChild(wrap);

        if (rows.length > visible.length) {
            tableHost.appendChild(
                el("div", { style: { padding: "0.8rem", textAlign: "center", borderTop: "1px solid var(--border-color)" } }, [
                    el("button", {
                        class: "btn btn-ghost btn-sm",
                        type: "button",
                        onclick: () => {
                            limit += PAGE_SIZE;
                            render();
                        },
                    }, `Show more (${rows.length - visible.length} remaining)`),
                ])
            );
        }
        if (cfg.footer) tableHost.appendChild(cfg.footer(rows));
    }

    render();

    // re-render whenever the collection changes (edits, remote updates)
    const unsub = subscribe((ev) => {
        if ((ev.type === "changed" || ev.type === "loaded") && ev.collection === collection) {
            if (root.isConnected) render();
        }
    });
    root.addEventListener("planner:dispose", () => unsub());
    return root;
}

function defaultColumns(collection) {
    return [
        {
            key: "title",
            label: "Name",
            get: (d) => {
                const wrap = el("div", { style: { display: "flex", flexDirection: "column", gap: "1px" } }, [
                    el("span", { class: "cell-strong", text: ENTITIES[collection].title(d) }),
                ]);
                if (d.code) wrap.appendChild(el("span", { class: "field-hint", text: d.code }));
                return wrap;
            },
        },
        { key: "status", label: "Status", get: (d) => d.status || "—" },
        { key: "updatedAt", label: "Updated", get: (d) => (d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : "—") },
    ];
}

export { PAGE_SIZE };
