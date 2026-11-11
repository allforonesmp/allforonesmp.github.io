/* AllForOne Story Planner — small DOM/format utilities (no dependencies) */

/* ------------------------------------------------------------------ icons */
const P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    storyline: '<circle cx="6" cy="5" r="2.4"/><circle cx="6" cy="19" r="2.4"/><circle cx="18" cy="12" r="2.4"/><path d="M6 7.4v9.2M8.4 5h4.2a3 3 0 0 1 3 3v1.4M8.4 19h4.2a3 3 0 0 0 3-3v-1.4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/><path d="M8 15h2M14 15h2"/>',
    calendarStar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18M12 13.6l1.1 2.2 2.4.3-1.7 1.7.4 2.4-2.2-1.1-2.2 1.1.4-2.4-1.7-1.7 2.4-.3z"/>',
    users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20.5a6.2 6.2 0 0 1 12.4 0"/><path d="M16.4 5.2a3.4 3.4 0 0 1 0 6.4M18.2 20.5a6 6 0 0 0-2.4-4.7"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20.4a7 7 0 0 1 14 0"/>',
    link: '<path d="M9.5 14.5l5-5"/><path d="M7.6 17.4l-1.3 1.3a3.9 3.9 0 0 1-5.5-5.5l2.8-2.8a3.9 3.9 0 0 1 5.5 0"/><path d="M16.4 6.6l1.3-1.3a3.9 3.9 0 0 1 5.5 5.5l-2.8 2.8a3.9 3.9 0 0 1-5.5 0"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17.5H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M8 6.5h8M8 10h5"/>',
    mapPin: '<path d="M12 21.5s7-6.2 7-11.5a7 7 0 1 0-14 0c0 5.3 7 11.5 7 11.5z"/><circle cx="12" cy="9.6" r="2.7"/>',
    flag: '<path d="M5 21V3.8"/><path d="M5 4.5h12.5l-1.8 4 1.8 4H5"/>',
    share: '<circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="M15.7 6.8L8.3 10.7M8.3 13.3l7.4 3.9"/>',
    layers: '<path d="M12 2.8l9 4.7-9 4.7-9-4.7z"/><path d="M3 12.4l9 4.7 9-4.7M3 17l9 4.7 9-4.7"/>',
    note: '<path d="M20 3H4a1.8 1.8 0 0 0-1.8 1.8v11.5L8 22h12a1.8 1.8 0 0 0 1.8-1.8V4.8A1.8 1.8 0 0 0 20 3z"/><path d="M2.5 16.5H8V22"/><path d="M7.5 8h9M7.5 11.6h6"/>',
    archive: '<rect x="2.5" y="4" width="19" height="4.5" rx="1.4"/><path d="M4.5 8.5V19a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8V8.5"/><path d="M9.5 12.5h5"/>',
    settings: '<circle cx="12" cy="12" r="3.1"/><path d="M19.4 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a1.9 1.9 0 1 1 0-3.8h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V4a1.9 1.9 0 1 1 3.8 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.3a1.9 1.9 0 1 1 0 3.8h-.2a1.6 1.6 0 0 0-1.5 1z"/>',
    search: '<circle cx="10.6" cy="10.6" r="7"/><path d="M15.8 15.8L21 21"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7.5 18.5l-4 1 1-4z"/>',
    trash: '<path d="M3.5 6.5h17"/><path d="M8.5 6.5V4.2A1.7 1.7 0 0 1 10.2 2.5h3.6a1.7 1.7 0 0 1 1.7 1.7v2.3"/><path d="M5.8 6.5l.9 12.4a1.9 1.9 0 0 0 1.9 1.8h6.8a1.9 1.9 0 0 0 1.9-1.8l.9-12.4"/><path d="M10 11v5M14 11v5"/>',
    restore: '<path d="M3.5 8.5V3.5h5"/><path d="M3.9 8.4A9 9 0 1 1 3 12"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    chevronRight: '<path d="M9 5l7 7-7 7"/>',
    chevronDown: '<path d="M5 9l7 7 7-7"/>',
    chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
    check: '<path d="M4.5 12.5l5 5 10-11"/>',
    alert: '<path d="M10.3 3.9L1.9 18.2A1.9 1.9 0 0 0 3.6 21h16.8a1.9 1.9 0 0 0 1.7-2.8L13.7 3.9a1.9 1.9 0 0 0-3.4 0z"/><path d="M12 9v4.5M12 17.5h.01"/>',
    info: '<circle cx="12" cy="12" r="9.2"/><path d="M12 11v5.5M12 7.8h.01"/>',
    save: '<path d="M19 21H5a1.9 1.9 0 0 1-1.9-1.9V4.9A1.9 1.9 0 0 1 5 3h11.6L21 7.4v11.7A1.9 1.9 0 0 1 19 21z"/><path d="M7.5 21v-7h9v7M7.5 3v5h7"/>',
    download: '<path d="M21 15.5v3.6A1.9 1.9 0 0 1 19.1 21H4.9A1.9 1.9 0 0 1 3 19.1v-3.6"/><path d="M7.5 10.5L12 15l4.5-4.5M12 15V3"/>',
    upload: '<path d="M21 15.5v3.6A1.9 1.9 0 0 1 19.1 21H4.9A1.9 1.9 0 0 1 3 19.1v-3.6"/><path d="M16.5 7.5L12 3 7.5 7.5M12 3v12"/>',
    filter: '<path d="M21 4H3l7.2 8.5V20l3.6-2v-5.5z"/>',
    zoomIn: '<circle cx="10.6" cy="10.6" r="7"/><path d="M15.8 15.8L21 21M8 10.6h5.2M10.6 8v5.2"/>',
    zoomOut: '<circle cx="10.6" cy="10.6" r="7"/><path d="M15.8 15.8L21 21M8 10.6h5.2"/>',
    maximize: '<path d="M8 3H4.4A1.4 1.4 0 0 0 3 4.4V8M16 3h3.6A1.4 1.4 0 0 1 21 4.4V8M21 16v3.6a1.4 1.4 0 0 1-1.4 1.4H16M8 21H4.4A1.4 1.4 0 0 1 3 19.6V16"/>',
    reset: '<path d="M3 5v5h5"/><path d="M3.5 10a8.5 8.5 0 1 1 2.2 8.6"/>',
    lock: '<rect x="4" y="10.5" width="16" height="10.5" rx="2.2"/><path d="M8 10.5V7.2a4 4 0 0 1 8 0v3.3"/>',
    logout: '<path d="M9.5 21H5a1.9 1.9 0 0 1-1.9-1.9V4.9A1.9 1.9 0 0 1 5 3h4.5"/><path d="M16 16.5l4.5-4.5L16 7.5M20.5 12H9"/>',
    clock: '<circle cx="12" cy="12" r="9.2"/><path d="M12 7v5.3l3.4 2"/>',
    arrowRight: '<path d="M4 12h16M14 6l6 6-6 6"/>',
    grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
    image: '<rect x="3" y="3.5" width="18" height="17" rx="2.2"/><circle cx="8.8" cy="9" r="1.8"/><path d="M21 16l-5-5-9 9.5"/>',
    file: '<path d="M14 2.5H6.8A2.3 2.3 0 0 0 4.5 4.8v14.4a2.3 2.3 0 0 0 2.3 2.3h10.4a2.3 2.3 0 0 0 2.3-2.3V7.5z"/><path d="M14 2.5V7.5h5.5"/>',
    star: '<path d="M12 2.7l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.5l6.5-.9z"/>',
    sparkles: '<path d="M12 2.8l1.7 4.6 4.6 1.7-4.6 1.7L12 15.4l-1.7-4.6L5.7 9.1l4.6-1.7z"/><path d="M18.5 14.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9zM5 15l.6 1.6L7.2 17l-1.6.6L5 19.2l-.6-1.6L2.8 17l1.6-.4z"/>',
    list: '<path d="M8.5 6h12M8.5 12h12M8.5 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/>',
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
    timeline: '<path d="M4 4v16"/><circle cx="8" cy="8" r="2"/><circle cx="8" cy="16" r="2"/><path d="M10 8h10M10 16h7"/>',
    eye: '<path d="M1.8 12S5.5 5.2 12 5.2 22.2 12 22.2 12 18.5 18.8 12 18.8 1.8 12 1.8 12z"/><circle cx="12" cy="12" r="3"/>',
    lockSmall: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8.5 11V7.8a3.5 3.5 0 0 1 7 0V11"/>',
    message: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1.5 2v-10A8.5 8.5 0 0 1 12 3h.5A8.5 8.5 0 0 1 21 11.5z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
    branch: '<circle cx="6" cy="4" r="2.2"/><circle cx="6" cy="20" r="2.2"/><circle cx="18" cy="9" r="2.2"/><path d="M6 6.2v11.6M18 11.2v1.4A3.4 3.4 0 0 1 14.6 16H8.2"/>',
    globe: '<circle cx="12" cy="12" r="9.2"/><path d="M2.8 12h18.4M12 2.8a13 13 0 0 1 0 18.4 13 13 0 0 1 0-18.4"/>',
    columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    refresh: '<path d="M20.5 11a8.5 8.5 0 0 0-14.9-4.6L3 9"/><path d="M3 4v5h5"/><path d="M3.5 13a8.5 8.5 0 0 0 14.9 4.6L21 15"/><path d="M21 20v-5h-5"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M15 9V5.5A2.5 2.5 0 0 0 12.5 3H5.5A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15H9"/>',
    wifiOff: '<path d="M2 3l19 19"/><path d="M8.5 15.5a5 5 0 0 1 6.5-.6"/><path d="M5 12.4a10.5 10.5 0 0 1 3.3-2.2M12 6.2a10.5 10.5 0 0 1 7 3.3"/><path d="M12 19.5h.01"/>',
};

export function icon(name, extraClass = "") {
    const body = P[name] || P.info;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    if (extraClass) svg.setAttribute("class", extraClass);
    svg.innerHTML = body;
    return svg;
}

export function iconHTML(name, cls = "") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" class="${cls}">${P[name] || P.info}</svg>`;
}

/* ------------------------------------------------------------------ DOM */
export function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v;
        else if (k === "text") node.textContent = v;
        else if (k === "dataset") Object.assign(node.dataset, v);
        else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === "value") node.value = v;
        else if (k === "checked" || k === "disabled" || k === "hidden" || k === "selected") node[k] = Boolean(v);
        else if (v === true) node.setAttribute(k, "");
        else node.setAttribute(k, v);
    }
    append(node, children);
    return node;
}

export function append(node, children) {
    if (children === null || children === undefined) return node;
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
        if (child === null || child === undefined || child === false) continue;
        if (Array.isArray(child)) append(node, child);
        else if (child instanceof Node) node.appendChild(child);
        else node.appendChild(document.createTextNode(String(child)));
    }
    return node;
}

export function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function debounce(fn, wait = 250) {
    let t = null;
    const wrapped = (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
    wrapped.cancel = () => clearTimeout(t);
    wrapped.flush = (...args) => {
        clearTimeout(t);
        fn(...args);
    };
    return wrapped;
}

export function uid(prefix = "id") {
    const rnd = crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
        : Math.random().toString(36).slice(2, 14);
    return `${prefix}_${rnd}`;
}

export function deepClone(obj) {
    if (obj === undefined) return undefined;
    if (typeof structuredClone === "function") {
        try {
            return structuredClone(obj);
        } catch (_) {
            /* fall through */
        }
    }
    return JSON.parse(JSON.stringify(obj));
}

/* ------------------------------------------------------------------ format */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export { MONTHS, MONTHS_LONG };

export function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value) ? null : value;
    const s = String(value);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const ym = /^(\d{4})-(\d{2})$/.exec(s);
    if (ym) return new Date(Number(ym[1]), Number(ym[2]) - 1, 1);
    const d = new Date(s);
    return isNaN(d) ? null : d;
}

export function fmtDate(value, opts = {}) {
    const d = parseDate(value);
    if (!d) return "";
    const { withYear = true, long = false } = opts;
    const mon = long ? MONTHS_LONG[d.getMonth()] : MONTHS[d.getMonth()];
    return `${d.getDate()} ${mon}${withYear ? " " + d.getFullYear() : ""}`;
}

export function fmtMonth(value) {
    const d = parseDate(value);
    if (!d) return "";
    return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateTime(value) {
    const d = parseDate(value);
    if (!d) return "";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${fmtDate(d)} · ${hh}:${mm}`;
}

export function monthKey(value) {
    const d = parseDate(value);
    if (!d) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function relTime(value) {
    const d = parseDate(value);
    if (!d) return "";
    const diff = Date.now() - d.getTime();
    const mins = Math.round(diff / 60000);
    if (Math.abs(mins) < 1) return "just now";
    if (Math.abs(mins) < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (Math.abs(days) < 30) return `${days}d ago`;
    const months = Math.round(days / 30);
    if (Math.abs(months) < 12) return `${months}mo ago`;
    return `${Math.round(months / 12)}y ago`;
}

export function daysSince(value) {
    const d = parseDate(value);
    if (!d) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function toArray(v) {
    if (v === null || v === undefined || v === "") return [];
    return Array.isArray(v) ? v : [v];
}

export function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

export function slug(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

export function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function truncate(str, n = 100) {
    const s = String(str ?? "");
    return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

export function downloadFile(filename, content, type = "application/json") {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function isOnline() {
    return navigator.onLine !== false;
}

export function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export function compareText(a, b) {
    return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

/* deterministic colour from a string, used for diagram groupings */
export function hashHue(str) {
    let h = 0;
    for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) % 360;
    return h;
}
