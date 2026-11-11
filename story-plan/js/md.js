/* AllForOne Story Planner — dependency-free Markdown renderer.
   Design notes:
   - Input is HTML-escaped before any inline processing, so user text can never
     inject markup. Only a fixed set of tags is ever produced.
   - Links are restricted to http(s)/mailto, and open in a new tab. */

import { esc } from "./util.js";

function safeUrl(raw) {
    const url = String(raw || "").trim();
    if (/^(https?:\/\/|mailto:)/i.test(url)) return esc(url);
    return null;
}

function inline(text) {
    let out = esc(text);

    // inline code first — protects its contents from further processing
    const codes = [];
    out = out.replace(/`([^`]+)`/g, (_, code) => {
        codes.push(code);
        return `\u0000C${codes.length - 1}\u0000`;
    });

    // links [label](url)
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
        const safe = safeUrl(url);
        if (!safe) return label;
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
    });

    // bare URLs
    out = out.replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+)/g, (m, pre, url) => {
        return `${pre}<a href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(url)}</a>`;
    });

    // bold / italic / strike
    out = out.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    out = out.replace(/(^|[^_\w])_([^_\n]+)_/g, "$1<em>$2</em>");
    out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");

    // restore inline code
    out = out.replace(/\u0000C(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
    return out;
}

function tableBlock(lines) {
    const rows = lines.map((l) =>
        l
            .trim()
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((c) => c.trim())
    );
    const head = rows[0];
    const body = rows.slice(1).filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
    let html = "<table><thead><tr>";
    head.forEach((c) => (html += `<th>${inline(c)}</th>`));
    html += "</tr></thead><tbody>";
    body.forEach((r) => {
        html += "<tr>";
        for (let i = 0; i < head.length; i++) html += `<td>${inline(r[i] || "")}</td>`;
        html += "</tr>";
    });
    return html + "</tbody></table>";
}

/**
 * Render markdown to sanitised HTML.
 * @param {string} src
 * @returns {string}
 */
export function renderMarkdown(src) {
    const text = String(src ?? "").replace(/\r\n?/g, "\n");
    if (!text.trim()) return "";

    const lines = text.split("\n");
    const out = [];
    let i = 0;
    let listStack = []; // {type:'ul'|'ol', indent}

    const closeLists = (indent = -1) => {
        while (listStack.length && listStack[listStack.length - 1].indent > indent) {
            out.push(`</${listStack.pop().type}>`);
        }
    };

    while (i < lines.length) {
        const line = lines[i];

        // fenced code
        const fence = /^\s*```(\w*)\s*$/.exec(line);
        if (fence) {
            closeLists();
            const buf = [];
            i++;
            while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
            i++;
            out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
            continue;
        }

        if (!line.trim()) {
            closeLists();
            i++;
            continue;
        }

        // heading
        const h = /^(#{1,4})\s+(.*)$/.exec(line);
        if (h) {
            closeLists();
            const lvl = h[1].length;
            out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
            i++;
            continue;
        }

        // horizontal rule
        if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
            closeLists();
            out.push("<hr />");
            i++;
            continue;
        }

        // table
        if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
            closeLists();
            const buf = [];
            while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) buf.push(lines[i++]);
            out.push(tableBlock(buf));
            continue;
        }

        // blockquote
        if (/^\s*>\s?/.test(line)) {
            closeLists();
            const buf = [];
            while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                buf.push(lines[i].replace(/^\s*>\s?/, ""));
                i++;
            }
            out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
            continue;
        }

        // list item
        const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
        if (li) {
            const indent = Math.floor(li[1].replace(/\t/g, "    ").length / 2);
            const ordered = /\d/.test(li[2]);
            const type = ordered ? "ol" : "ul";

            while (listStack.length && indent < listStack[listStack.length - 1].indent) {
                out.push(`</${listStack.pop().type}>`);
            }
            const top = listStack[listStack.length - 1];
            if (!top || indent > top.indent) {
                listStack.push({ type, indent });
                out.push(`<${type}>`);
            } else if (top.type !== type) {
                out.push(`</${top.type}>`);
                listStack.pop();
                listStack.push({ type, indent });
                out.push(`<${type}>`);
            }

            let content = li[3];
            const task = /^\[( |x|X)\]\s*(.*)$/.exec(content);
            if (task) {
                const done = task[1].toLowerCase() === "x";
                out.push(
                    `<li class="task${done ? " done" : ""}"><input type="checkbox" disabled${done ? " checked" : ""} /><span>${inline(task[2])}</span></li>`
                );
            } else {
                out.push(`<li>${inline(content)}</li>`);
            }
            i++;
            continue;
        }

        // paragraph
        closeLists();
        const buf = [];
        while (
            i < lines.length &&
            lines[i].trim() &&
            !/^\s*(#{1,4}\s|\d+[.)]\s|[-*+]\s|>\s?|```|---|\*\*\*)/.test(lines[i]) &&
            !/^\s*\*\s/.test(lines[i])
        ) {
            buf.push(lines[i]);
            i++;
        }
        if (!buf.length) {
            // avoid infinite loop on unexpected line
            buf.push(lines[i]);
            i++;
        }
        out.push(`<p>${inline(buf.join("\n")).replace(/\n/g, "<br />")}</p>`);
    }

    while (listStack.length) out.push(`</${listStack.pop().type}>`);
    return out.join("\n");
}

/** Plain-text preview of markdown, for cards and list rows. */
export function mdToText(src, max = 160) {
    const s = String(src ?? "")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[#>*_`~|]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}
