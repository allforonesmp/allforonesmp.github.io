/* Core helpers — DOM, formatting, events */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function uid(prefix = "r") {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function esc(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function attrs(obj = {}) {
    return Object.entries(obj)
        .filter(([, v]) => v !== false && v !== null && v !== undefined && v !== "")
        .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`))
        .join(" ");
}

export const debounce = (fn, ms = 250) => {
    let t;
    const wrapped = (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
    wrapped.cancel = () => clearTimeout(t);
    return wrapped;
};

export const throttle = (fn, ms = 80) => {
    let last = 0;
    let timer;
    return (...args) => {
        const now = Date.now();
        if (now - last >= ms) {
            last = now;
            fn(...args);
        } else {
            clearTimeout(timer);
            timer = setTimeout(() => {
                last = Date.now();
                fn(...args);
            }, ms - (now - last));
        }
    };
};

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export const unique = (arr) => Array.from(new Set(arr.filter((v) => v !== null && v !== undefined && v !== "")));

export const byName = (a, b) => String(a?.name || a?.title || a?.username || "").localeCompare(String(b?.name || b?.title || b?.username || ""));

export function sortBy(arr, key, dir = "asc") {
    const mul = dir === "desc" ? -1 : 1;
    return [...arr].sort((a, b) => {
        const av = typeof key === "function" ? key(a) : a[key];
        const bv = typeof key === "function" ? key(b) : b[key];
        if (av === bv) return 0;
        if (av === undefined || av === null || av === "") return 1;
        if (bv === undefined || bv === null || bv === "") return -1;
        return (av > bv ? 1 : -1) * mul;
    });
}

export function groupBy(arr, fn) {
    const out = new Map();
    for (const item of arr) {
        const key = typeof fn === "function" ? fn(item) : item[fn];
        if (!out.has(key)) out.set(key, []);
        out.get(key).push(item);
    }
    return out;
}

export const capitalize = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);
export const titleCase = (s = "") =>
    String(s)
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();

export const fmtNum = (n) => new Intl.NumberFormat("en-AU").format(n ?? 0);

export function fmtDate(value, opts = {}) {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...opts,
    });
}

export function fmtDateShort(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
}

export function fmtDateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export function timeAgo(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const diff = Date.now() - d.getTime();
    const abs = Math.abs(diff);
    const units = [
        [1000, "second"],
        [60, "minute"],
        [60, "hour"],
        [24, "day"],
        [7, "week"],
        [4.35, "month"],
        [12, "year"],
    ];
    let n = abs / 1000;
    let unit = "second";
    for (let i = 1; i < units.length; i++) {
        if (n < units[i][0]) break;
        n /= units[i][0];
        unit = units[i][1];
    }
    const val = Math.round(n);
    return val <= 1 ? `just now` : `${val} ${unit}${val === 1 ? "" : "s"} ago`;
}

export function parseTags(str) {
    return unique(
        String(str || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    );
}

export function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Normalize any date-ish input to YYYY-MM-DD or "" */
export function toISODate(value) {
    const d = parseDate(value);
    if (!d) return "";
    return d.toISOString().slice(0, 10);
}

export function rangeLabel(start, end) {
    if (!start && !end) return "Undated";
    if (start && end) return `${fmtDateShort(start)} → ${fmtDateShort(end)}`;
    return fmtDateShort(start || end);
}

export function initials(name = "") {
    return String(name)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase() || "?";
}

export function mcHead(username, size = 64) {
    if (!username) return "";
    return `https://mc-heads.net/avatar/${encodeURIComponent(username)}/${size}`;
}

export function safeUrl(url) {
    if (!url) return "";
    const trimmed = String(url).trim();
    if (/^(https?:|data:image\/|blob:|\/|\.\/|\.\.\/)/i.test(trimmed)) return trimmed;
    return "";
}

export function avatarHtml(name, { username, image, size = "md", className = "" } = {}) {
    const cls = `av av-${size} ${className}`.trim();
    const img = safeUrl(image) || mcHead(username, 64);
    if (img) {
        return `<span class="${cls}"><img src="${esc(img)}" alt="${esc(name || "Character")}" loading="lazy" onerror="this.parentNode.classList.add('failed');this.remove();" /></span>`;
    }
    return `<span class="${cls}">${esc(initials(name))}</span>`;
}

export function downloadFile(filename, content, mime = "application/json") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Could not read file"));
        reader.readAsText(file);
    });
}

export function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Could not read file"));
        reader.readAsDataURL(file);
    });
}

export function downloadText(filename, content) {
    downloadFile(filename, content, "text/plain");
}

export function highlight(text, query) {
    const safe = esc(text || "");
    if (!query) return safe;
    const q = String(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!q.trim()) return safe;
    return safe.replace(new RegExp(`(${q})`, "ig"), '<mark class="match">$1</mark>');
}

export function parseHash(hash = location.hash) {
    const clean = String(hash || "").replace(/^#\/?/, "");
    const [pathPart, queryPart] = clean.split("?");
    const segments = pathPart.split("/").filter(Boolean).map(decodeURIComponent);
    const query = Object.fromEntries(new URLSearchParams(queryPart || ""));
    return { segments, query, path: "/" + segments.join("/") };
}

export function navigate(path, { replace = false } = {}) {
    const target = "#" + (path.startsWith("/") ? path : "/" + path);
    if (replace) history.replaceState(null, "", target);
    else location.hash = target;
}

/** Simple typed event emitter */
export class Emitter {
    constructor() {
        this._map = new Map();
    }
    on(event, fn) {
        if (!this._map.has(event)) this._map.set(event, new Set());
        this._map.get(event).add(fn);
        return () => this.off(event, fn);
    }
    off(event, fn) {
        this._map.get(event)?.delete(fn);
    }
    emit(event, payload) {
        this._map.get(event)?.forEach((fn) => {
            try {
                fn(payload);
            } catch (err) {
                console.error(`[emitter:${event}]`, err);
            }
        });
        this._map.get("*")?.forEach((fn) => {
            try {
                fn({ event, payload });
            } catch (err) {
                console.error(err);
            }
        });
    }
}

export const bus = new Emitter();

export function relativeImportance(n) {
    const v = Number(n) || 1;
    return ["", "Minor", "Notable", "Significant", "Major", "World-changing"][clamp(v, 1, 5)];
}

export function splitLines(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return String(value || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
}

export function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

export function truncate(text, n = 120) {
    const s = String(text || "");
    return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

export function bytes(n) {
    if (!n) return "0 B";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) {
        n /= 1024;
        i++;
    }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}
