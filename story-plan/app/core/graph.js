/* =========================================================================
   GraphView — interactive SVG canvas
   Pan · zoom · node drag · multi-select · connect · context menus
   ========================================================================= */

import { icon } from "./icons.js";
import { esc, clamp, throttle, initials, mcHead, safeUrl } from "./util.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const NODE_STYLE = {
    characters: { r: 25, shape: "circle" },
    events: { r: 17, shape: "diamond" },
    factions: { r: 23, shape: "hex" },
    locations: { r: 19, shape: "square" },
    mysteries: { r: 21, shape: "diamond" },
    storylines: { r: 27, shape: "band" },
    items: { r: 17, shape: "hex" },
};

const TYPE_ICON = {
    events: "events",
    factions: "factions",
    locations: "locations",
    mysteries: "key",
    storylines: "storylines",
    items: "items",
};

export class GraphView {
    constructor(host, opts = {}) {
        this.host = host;
        this.opts = opts;
        this.nodes = [];
        this.edges = [];
        this.positions = new Map();
        this.selected = new Set();
        this.selection = new Set(); // alias for multi-select
        this.viewport = { x: 0, y: 0, k: 1 };
        this.edgeLabels = opts.edgeLabels !== false;
        this.nodeLabels = opts.nodeLabels !== false;
        this.edgeColors = opts.edgeColors || {};
        this._raf = null;
        this._bind();
        this._resizeObserver = new ResizeObserver(() => this._onResize());
        this._resizeObserver.observe(host);
    }

    /* ------------------------------------------------------------- public */
    setData({ nodes, edges, positions = null }, { fit = true } = {}) {
        this.nodes = nodes || [];
        this.edges = edges || [];
        if (positions) this.setPositions(positions);
        const missing = this.nodes.filter((n) => !this.positions.has(n.id));
        if (missing.length) {
            this.runLayout({ only: missing, silent: true });
        }
        this.render();
        if (fit) this.fit();
    }

    setPositions(positions) {
        const entries = positions instanceof Map ? positions.entries() : Object.entries(positions || {});
        for (const [key, pos] of entries) {
            if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
                this.positions.set(key, { x: pos.x, y: pos.y });
            }
        }
    }

    getPositions() {
        const out = {};
        for (const n of this.nodes) {
            const p = this.positions.get(n.id);
            if (p) out[n.id] = { x: Math.round(p.x), y: Math.round(p.y) };
        }
        return out;
    }

    destroy() {
        this._resizeObserver.disconnect();
        this.host.removeEventListener("wheel", this._onWheel);
        this.host.removeEventListener("pointerdown", this._onPointerDown);
        window.removeEventListener("pointermove", this._onPointerMove);
        window.removeEventListener("pointerup", this._onPointerUp);
        window.removeEventListener("pointercancel", this._onPointerUp);
        this.host.removeEventListener("contextmenu", this._onContext);
        this.host.removeEventListener("dblclick", this._onDouble);
        this.host.innerHTML = "";
    }

    setFilteredHighlight(matchIds) {
        this._matchIds = matchIds ? new Set(matchIds) : null;
        this.render();
    }

    setLabels({ edges: showEdges, nodes: showNodes }) {
        if (showEdges !== undefined) this.edgeLabels = showEdges;
        if (showNodes !== undefined) this.nodeLabels = showNodes;
        this.render();
    }

    setEdgeColors(colors) {
        this.edgeColors = colors;
        this.render();
    }

    fit(padding = 70) {
        if (!this.nodes.length) {
            this.viewport = { x: 0, y: 0, k: 1 };
            this._apply();
            return;
        }
        const rect = this.host.getBoundingClientRect();
        const width = rect.width || 800;
        const height = rect.height || 600;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of this.nodes) {
            const p = this.positions.get(n.id);
            if (!p) continue;
            const r = nodeRadius(n);
            minX = Math.min(minX, p.x - r);
            minY = Math.min(minY, p.y - r);
            maxX = Math.max(maxX, p.x + r);
            maxY = Math.max(maxY, p.y + r);
        }
        if (!Number.isFinite(minX)) return;
        const k = clamp(Math.min((width - padding * 2) / (maxX - minX || 1), (height - padding * 2) / (maxY - minY || 1)), 0.16, 1.6);
        this.viewport.k = k;
        this.viewport.x = width / 2 - ((minX + maxX) / 2) * k;
        this.viewport.y = height / 2 - ((minY + maxY) / 2) * k;
        this._apply();
    }

    focusNode(id, zoom = 1.15) {
        const p = this.positions.get(id);
        if (!p) return;
        const rect = this.host.getBoundingClientRect();
        this.viewport.k = zoom;
        this.viewport.x = (rect.width || 800) / 2 - p.x * zoom;
        this.viewport.y = (rect.height || 600) / 2 - p.y * zoom;
        this._apply(true);
        this._select([id]);
    }

    zoomBy(factor) {
        const rect = this.host.getBoundingClientRect();
        const cx = (rect.width || 800) / 2;
        const cy = (rect.height || 600) / 2;
        this._zoomAt(cx, cy, factor);
    }

    addNode(node) {
        if (!this.nodes.some((n) => n.id === node.id)) this.nodes.push(node);
        this.runLayout({ only: [node], silent: true });
        this.render();
    }

    selectNode(id, additive = false) {
        this._select(additive ? [...this.selected, id] : [id]);
    }

    clearSelection() {
        this._select([]);
    }

    runLayout({ only = null, silent = false } = {}) {
        const nodes = only || this.nodes;
        if (!nodes.length) return;
        const all = this.nodes;
        const rect = this.host.getBoundingClientRect();
        const cx = 0;
        const cy = 0;

        // Seed positions by type cluster.
        const typeOrder = ["storylines", "factions", "locations", "characters", "events", "mysteries", "items"];
        const byType = new Map();
        for (const n of all) {
            if (!byType.has(n.type)) byType.set(n.type, []);
            byType.get(n.type).push(n);
        }
        const cols = 3;
        typeOrder.forEach((type, ti) => {
            const group = byType.get(type) || [];
            const col = ti % cols;
            const row = Math.floor(ti / cols);
            const baseX = (col - 1) * 420;
            const baseY = (row - 0.8) * 380;
            group.forEach((n, i) => {
                if (!only && this.positions.has(n.id)) return;
                const angle = (i / Math.max(1, group.length)) * Math.PI * 2;
                const spread = 60 + Math.sqrt(group.length) * 26;
                this.positions.set(n.id, {
                    x: baseX + Math.cos(angle) * spread + Math.random() * 8,
                    y: baseY + Math.sin(angle) * spread + Math.random() * 8,
                });
            });
        });

        // Force relaxation
        const idSet = new Set(nodes.map((n) => n.id));
        const movable = nodes;
        const movableSet = new Set(movable.map((n) => n.id));
        const iterations = all.length > 260 ? 120 : all.length > 120 ? 220 : 320;
        const buckets = new Map();
        const cell = 140;
        const neighbors = new Map();
        for (const e of this.edges) {
            if (!neighbors.has(e.from)) neighbors.set(e.from, []);
            if (!neighbors.has(e.to)) neighbors.set(e.to, []);
            neighbors.get(e.from).push(e.to);
            neighbors.get(e.to).push(e.from);
        }

        for (let iter = 0; iter < iterations; iter++) {
            buckets.clear();
            for (const n of movable) {
                const p = this.positions.get(n.id);
                if (!p) continue;
                const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push(n);
            }
            const alpha = 0.9 * (1 - iter / iterations) + 0.05;
            // repulsion within nearby cells
            for (const n of movable) {
                const p = this.positions.get(n.id);
                if (!p) continue;
                let fx = 0, fy = 0;
                const gx = Math.floor(p.x / cell);
                const gy = Math.floor(p.y / cell);
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const bucket = buckets.get(`${gx + dx},${gy + dy}`);
                        if (!bucket) continue;
                        for (const other of bucket) {
                            if (other === n) continue;
                            const op = this.positions.get(other.id);
                            const ddx = p.x - op.x;
                            const ddy = p.y - op.y;
                            const dist2 = ddx * ddx + ddy * ddy || 1;
                            const minDist = nodeRadius(n) + nodeRadius(other) + 48;
                            if (dist2 < minDist * minDist * 4) {
                                const dist = Math.sqrt(dist2);
                                const force = (minDist * minDist) / dist2;
                                fx += (ddx / dist) * force * alpha;
                                fy += (ddy / dist) * force * alpha;
                            }
                        }
                    }
                }
                p.x += clamp(fx, -18, 18);
                p.y += clamp(fy, -18, 18);
            }
            // springs
            for (const e of this.edges) {
                if (!idSet.has(e.from) || !idSet.has(e.to)) continue;
                const a = this.positions.get(e.from);
                const b = this.positions.get(e.to);
                if (!a || !b) continue;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const target = 170;
                const k = ((dist - target) / dist) * 0.045 * alpha;
                const ox = dx * k;
                const oy = dy * k;
                if (movableSet.has(e.from)) {
                    a.x += ox;
                    a.y += oy;
                }
                if (movableSet.has(e.to)) {
                    b.x -= ox;
                    b.y -= oy;
                }
            }
            // gravity to centre
            for (const n of movable) {
                const p = this.positions.get(n.id);
                if (!p) continue;
                p.x += (cx - p.x) * 0.004 * alpha;
                p.y += (cy - p.y) * 0.004 * alpha;
            }
        }
        if (!silent) this.render();
    }

    /* ------------------------------------------------------------- internal */
    _bind() {
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onContext = this._onContext.bind(this);
        this._onDouble = this._onDouble.bind(this);
        this.host.addEventListener("wheel", this._onWheel, { passive: false });
        this.host.addEventListener("pointerdown", this._onPointerDown);
        window.addEventListener("pointermove", this._onPointerMove);
        window.addEventListener("pointerup", this._onPointerUp);
        window.addEventListener("pointercancel", this._onPointerUp);
        this.host.addEventListener("contextmenu", this._onContext);
        this.host.addEventListener("dblclick", this._onDouble);
        this.host.addEventListener("click", (e) => {
            const edge = e.target.closest(".gedge-hit");
            if (edge) {
                e.stopPropagation();
                this.opts.onEdgeClick?.(edge.dataset.id);
            }
        });
    }

    _onResize() {
        if (!this.nodes.length) return;
        this._apply();
    }

    render() {
        const height = this.host.clientHeight;
        const existing = this.host.querySelector("svg.graph-svg");
        const svg = existing || document.createElementNS(SVG_NS, "svg");
        svg.classList.add("graph-svg");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");

        const defs = `
        <defs>
            <pattern id="graph-grid" width="56" height="56" patternUnits="userSpaceOnUse">
                <path d="M56 0H0V56" fill="none" stroke="rgba(255,255,255,0.038)" stroke-width="1"/>
            </pattern>
            <filter id="node-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="7" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            ${this.nodes
                .map(
                    (n) => `
                <clipPath id="clip-${sanitizeId(n.id)}"><circle r="${nodeRadius(n)}"/></clipPath>`,
                )
                .join("")}
        </defs>`;

        const edgePaths = this.edges
            .map((e) => {
                const a = this.positions.get(e.from);
                const b = this.positions.get(e.to);
                if (!a || !b) return "";
                const fromNode = this.nodes.find((n) => n.id === e.from);
                const toNode = this.nodes.find((n) => n.id === e.to);
                if (!fromNode || !toNode) return "";
                const d = edgePath(a, b, nodeRadius(fromNode), nodeRadius(toNode), e);
                const color = this.edgeColors[e.kind] || "#6f7b89";
                const width = e.kind === "enemy" ? 1.9 : e.kind === "secret" ? 1.5 : 1.35;
                const dash = e.dashed ? "5 5" : e.kind === "secret" ? "2 5" : "";
                const label = e.label || "";
                const midX = (a.x + b.x) / 2;
                const midY = (a.y + b.y) / 2 - 6;
                const showLabel = this.edgeLabels && label;
                const aId = `${sanitizeId(e.from)}|${sanitizeId(e.to)}`;
                return `<g class="gedge edge-${esc(e.kind)}" data-id="${esc(e.id)}" data-from="${esc(e.kind === "relationship" ? "" : e.from)}" data-to="${esc(e.to)}">
                    <path class="gedge-line" d="${d}" stroke="${esc(color)}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""} />
                    <path class="gedge-hit" data-id="${esc(e.id)}" d="${d}" stroke="transparent" stroke-width="16" fill="none" />
                    ${showLabel ? `<g class="gedge-label" transform="translate(${midX},${midY})"><rect x="${-label.length * 3.1 - 6}" y="-8" width="${label.length * 6.2 + 12}" height="16" rx="6"/><text text-anchor="middle" y="3.5">${esc(label)}</text></g>` : ""}
                </g>`;
            })
            .join("");

        const nodeMarkup = this.nodes
            .map((n) => {
                const p = this.positions.get(n.id);
                if (!p) return "";
                const st = NODE_STYLE[n.type] || NODE_STYLE.events;
                const r = nodeRadius(n);
                const record = n.record || {};
                const label = record.name || record.title || "Untitled";
                const sub = nodeSubLabel(n);
                const selected = this.selected.has(n.id);
                const dim = this._matchIds && !this._matchIds.has(n.id);
                const colorVar = `var(--n-${n.type === "mysteries" ? "mystery" : n.type.replace(/s$/, "")}, #9aa3b2)`;
                const shape = nodeShape(n, r);
                let inner = "";
                if (n.type === "characters") {
                    const img = safeUrl(record.portraitUrl) || mcHead(record.username, 96);
                    inner = `
                        ${img ? `<circle class="node-avatar-bg" r="${r - 3}" fill="#12161c"/>` : ""}
                        ${img ? `<image href="${esc(img)}" x="${-(r - 3)}" y="${-(r - 3)}" width="${(r - 3) * 2}" height="${(r - 3) * 2}" clip-path="url(#clip-${sanitizeId(n.id)})" preserveAspectRatio="xMidYMid slice" class="node-avatar"/>` : `<text class="node-initials" text-anchor="middle" y="5">${esc(initials(label))}</text>`}`;
                } else {
                    inner = `<text class="node-glyph" text-anchor="middle" y="5">${esc((label || "?").trim().charAt(0).toUpperCase())}</text>`;
                }
                return `<g class="gnode type-${esc(n.type)} ${selected ? "selected" : ""} ${dim ? "dimmed" : ""}" data-id="${esc(n.id)}" data-type="${esc(n.type)}" transform="translate(${p.x},${p.y})" tabindex="0" role="button" aria-label="${esc(label)}">
                    <g class="node-shape" style="--node-color:${colorVar}">
                        ${shape}
                        ${inner}
                        <circle class="node-importance" r="4" cx="${r * 0.72}" cy="${-r * 0.72}" fill="${importanceColor(record.importance)}" />
                        <circle class="connect-handle" r="7" cx="${r + 2}" cy="${r + 2}" />
                    </g>
                    ${this.nodeLabels ? `<text class="node-label" text-anchor="middle" y="${r + 17}">${esc(label.length > 28 ? label.slice(0, 26) + "…" : label)}${sub ? `<tspan class="node-sub" x="0" dy="13">${esc(sub)}</tspan>` : ""}</text>` : ""}
                </g>`;
            })
            .join("");

        const content = `
            <rect class="graph-bg" width="100%" height="100%" fill="url(#graph-grid)"/>
            <g class="graph-viewport">
                <g class="graph-edges">${edgePaths}</g>
                <g class="graph-nodes">${nodeMarkup}</g>
            </g>
            <g class="graph-marquee" hidden><rect /></g>`;
        svg.innerHTML = defs + content;
        if (!existing) {
            this.host.innerHTML = "";
            this.host.appendChild(svg);
        }
        this.svg = svg;
        this.viewportGroup = svg.querySelector(".graph-viewport");
        this._apply();
        if (height) svg.style.height = "100%";
    }

    _apply(animate = false) {
        if (!this.viewportGroup) return;
        const { x, y, k } = this.viewport;
        this.viewportGroup.setAttribute("transform", `translate(${x},${y}) scale(${k})`);
        this.viewportGroup.style.transition = animate ? "transform .4s cubic-bezier(.16,1,.3,1)" : "none";
        this.host.dispatchEvent(new CustomEvent("graph-viewport", { detail: this.viewport }));
    }

    _select(ids) {
        this.selected = new Set(ids);
        this.svg?.querySelectorAll(".gnode").forEach((el) => {
            el.classList.toggle("selected", this.selected.has(el.dataset.id));
        });
        this.svg?.querySelectorAll(".gedge").forEach((el) => {
            const from = el.dataset.from;
            const to = el.dataset.to;
            const active = this.selected.size && (this.selected.has(from) || this.selected.has(to));
            el.classList.toggle("active", Boolean(active));
            el.classList.toggle("muted", this.selected.size > 0 && !active);
        });
        this.opts.onSelectionChange?.([...this.selected]);
    }

    _nodeFromEvent(e) {
        const g = e.target.closest?.(".gnode");
        if (!g) return null;
        return this.nodes.find((n) => n.id === g.dataset.id) || null;
    }

    _pointerLocal(e) {
        const rect = this.host.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    _toWorld(pt) {
        return { x: (pt.x - this.viewport.x) / this.viewport.k, y: (pt.y - this.viewport.y) / this.viewport.k };
    }

    _onWheel(e) {
        e.preventDefault();
        const local = this._pointerLocal(e);
        const factor = Math.exp(-e.deltaY * 0.0016);
        this._zoomAt(local.x, local.y, factor);
    }

    _zoomAt(px, py, factor) {
        const k = clamp(this.viewport.k * factor, 0.12, 3.2);
        const world = this._toWorld({ x: px, y: py });
        this.viewport.k = k;
        this.viewport.x = px - world.x * k;
        this.viewport.y = py - world.y * k;
        this._apply();
    }

    _onPointerDown(e) {
        if (e.button === 2) return;
        if (!this._pointers) this._pointers = new Map();
        this._pointers.set(e.pointerId, this._pointerLocal(e));
        const nodeEl = e.target.closest?.(".gnode");
        const local = this._pointerLocal(e);

        if (e.target.closest?.(".connect-handle") && nodeEl) {
            e.preventDefault();
            this.connectDrag = { from: nodeEl.dataset.id, start: local };
            this._showTempLine(local, local);
            return;
        }

        if (nodeEl) {
            e.preventDefault();
            const id = nodeEl.dataset.id;
            if (e.shiftKey) {
                const next = new Set(this.selected);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                this._select([...next]);
                return;
            }
            if (!this.selected.has(id)) this._select([id]);
            const pos = this.positions.get(id);
            this.drag = {
                id,
                start: local,
                origin: { x: pos.x, y: pos.y },
                moved: false,
                multiple: [...this.selected].map((nid) => ({ id: nid, origin: { ...this.positions.get(nid) } })).filter((p) => p.origin.x !== undefined),
            };
            this.host.classList.add("dragging-node");
            return;
        }

        // background: pan or marquee
        if (e.shiftKey) {
            this.marquee = { start: local, current: local };
            const marquee = this.svg.querySelector(".graph-marquee");
            marquee.hidden = false;
            return;
        }
        this.pan = { start: local, origin: { x: this.viewport.x, y: this.viewport.y }, moved: false };
        this.host.classList.add("panning");
        if (this.selected.size) this._select([]);
    }

    _onPointerMove(e) {
        const local = this._pointerLocal(e);
        if (this._pointers?.has(e.pointerId)) this._pointers.set(e.pointerId, local);

        // pinch zoom
        if (e.pointerType === "touch" && this._pointers && this._pointers.size === 2) {
            const pts = [...this._pointers.values()];
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            if (this._pinchDist) {
                this._zoomAt((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2, dist / this._pinchDist);
            }
            this._pinchDist = dist;
        }

        if (this.connectDrag) {
            this._showTempLine(this.connectDrag.start, local);
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const target = el?.closest?.(".gnode");
            this.svg?.querySelectorAll(".gnode").forEach((n) => n.classList.toggle("connect-target", target === n && n.dataset.id !== this.connectDrag.from));
            return;
        }

        if (this.drag) {
            const dx = (local.x - this.drag.start.x) / this.viewport.k;
            const dy = (local.y - this.drag.start.y) / this.viewport.k;
            if (Math.abs(dx) + Math.abs(dy) > 1.5) this.drag.moved = true;
            for (const item of this.drag.multiple) {
                const pos = this.positions.get(item.id);
                if (!pos) continue;
                pos.x = item.origin.x + dx;
                pos.y = item.origin.y + dy;
            }
            this._renderPositions();
            return;
        }

        if (this.pan) {
            this.viewport.x = this.pan.origin.x + (local.x - this.pan.start.x);
            this.viewport.y = this.pan.origin.y + (local.y - this.pan.start.y);
            this.pan.moved = true;
            this._apply();
            return;
        }

        if (this.marquee) {
            this.marquee.current = local;
            this._drawMarquee();
        }
    }

    _onPointerUp(e) {
        if (this._pointers) {
            this._pointers.delete(e.pointerId);
            if (this._pointers.size < 2) this._pinchDist = null;
        }
        if (this.connectDrag) {
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const target = el?.closest?.(".gnode");
            this._hideTempLine();
            this.svg?.querySelectorAll(".gnode").forEach((n) => n.classList.remove("connect-target"));
            if (target && target.dataset.id !== this.connectDrag.from) {
                const from = this.nodes.find((n) => n.id === this.connectDrag.from);
                const to = this.nodes.find((n) => n.id === target.dataset.id);
                if (from && to) this.opts.onConnect?.(from, to);
            }
            this.connectDrag = null;
            return;
        }

        if (this.drag) {
            this.host.classList.remove("dragging-node");
            if (this.drag.moved) {
                this._persistPositions();
                this.opts.onSelectionChange?.([...this.selected]);
            } else {
                const node = this.nodes.find((n) => n.id === this.drag.id);
                if (node) this.opts.onNodeClick?.(node);
            }
            this.drag = null;
            return;
        }

        if (this.pan) {
            this.host.classList.remove("panning");
            this.pan = null;
            return;
        }

        if (this.marquee) {
            const rect = this.svg.querySelector(".graph-marquee");
            rect.hidden = true;
            const { start, current } = this.marquee;
            const x1 = Math.min(start.x, current.x);
            const y1 = Math.min(start.y, current.y);
            const x2 = Math.max(start.x, current.x);
            const y2 = Math.max(start.y, current.y);
            const hits = [];
            for (const n of this.nodes) {
                const p = this.positions.get(n.id);
                if (!p) continue;
                const sx = p.x * this.viewport.k + this.viewport.x;
                const sy = p.y * this.viewport.k + this.viewport.y;
                if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) hits.push(n.id);
            }
            this._select(hits);
            this.marquee = null;
        }
    }

    _persistPositions() {
        this.opts.onPositionsChange?.(this.getPositions());
    }

    _renderPositions() {
        for (const el of this.svg.querySelectorAll(".gnode")) {
            const p = this.positions.get(el.dataset.id);
            if (p) el.setAttribute("transform", `translate(${p.x},${p.y})`);
        }
        // redraw edges
        const edgeEls = this.svg.querySelectorAll(".gedge");
        let i = 0;
        for (const e of this.edges) {
            const el = edgeEls[i++];
            if (!el) continue;
            const a = this.positions.get(e.from);
            const b = this.positions.get(e.to);
            if (!a || !b) continue;
            const fromNode = this.nodes.find((n) => n.id === e.from);
            const toNode = this.nodes.find((n) => n.id === e.to);
            if (!fromNode || !toNode) continue;
            const d = edgePath(a, b, nodeRadius(fromNode), nodeRadius(toNode), e);
            el.querySelectorAll("path").forEach((p) => p.setAttribute("d", d));
            const label = el.querySelector(".gedge-label");
            if (label) label.setAttribute("transform", `translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2 - 6})`);
        }
        this._apply();
    }

    _drawMarquee() {
        const rect = this.svg.querySelector(".graph-marquee");
        const r = rect.querySelector("rect");
        const { start, current } = this.marquee;
        const x = Math.min(start.x, current.x);
        const y = Math.min(start.y, current.y);
        rect.setAttribute("transform", `translate(${x},${y})`);
        r.setAttribute("width", Math.abs(current.x - start.x));
        r.setAttribute("height", Math.abs(current.y - start.y));
    }

    _showTempLine(a, b) {
        let line = this.svg.querySelector(".temp-connect");
        if (!line) {
            line = document.createElementNS(SVG_NS, "line");
            line.setAttribute("class", "temp-connect");
            line.setAttribute("stroke", "var(--gold)");
            line.setAttribute("stroke-width", "2");
            line.setAttribute("stroke-dasharray", "6 5");
            this.svg.appendChild(line);
        }
        // points in world space
        const from = this.nodes.find((n) => n.id === this.connectDrag.from);
        const fromPos = this.positions.get(this.connectDrag.from);
        const startWorld = fromPos ? { x: fromPos.x, y: fromPos.y } : this._toWorld(a);
        const toWorld = this._toWorld(b);
        line.setAttribute("x1", startWorld.x);
        line.setAttribute("y1", startWorld.y);
        line.setAttribute("x2", toWorld.x);
        line.setAttribute("y2", toWorld.y);
        line.setAttribute("transform", `translate(${this.viewport.x},${this.viewport.y}) scale(${this.viewport.k})`);
    }

    _hideTempLine() {
        this.svg?.querySelector(".temp-connect")?.remove();
    }

    _onContext(e) {
        e.preventDefault();
        const nodeEl = e.target.closest?.(".gnode");
        const edgeEl = e.target.closest?.(".gedge-hit");
        if (nodeEl) {
            const node = this.nodes.find((n) => n.id === nodeEl.dataset.id);
            if (node) this.opts.onNodeContext?.(node, e);
        } else if (edgeEl) {
            const edge = this.edges.find((x) => x.id === edgeEl.dataset.id);
            if (edge) this.opts.onEdgeContext?.(edge, e);
        } else {
            this.opts.onCanvasContext?.(e);
        }
    }

    _onDouble(e) {
        const nodeEl = e.target.closest?.(".gnode");
        if (!nodeEl) {
            this.fit();
            return;
        }
        const node = this.nodes.find((n) => n.id === nodeEl.dataset.id);
        if (node) this.opts.onNodeOpen?.(node);
    }
}

/* -------------------------------------------------------------------------
   Geometry helpers
   ------------------------------------------------------------------------- */
function nodeRadius(node) {
    const base = (NODE_STYLE[node.type] || NODE_STYLE.events).r;
    const importance = Number(node.record?.importance || 0);
    const status = node.record?.status;
    const boost = status === "dead" ? -2 : 0;
    return base + Math.max(0, importance - 2) * 1.8 + boost;
}

function nodeShape(node, r) {
    const shape = (NODE_STYLE[node.type] || {}).shape || "circle";
    if (shape === "diamond") {
        const s = r * 1.28;
        return `<path class="node-bg" d="M0 ${-s} L${s} 0 L0 ${s} L${-s} 0 Z"/>`;
    }
    if (shape === "hex") {
        const pts = [];
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            pts.push(`${(Math.cos(a) * r * 1.1).toFixed(2)},${(Math.sin(a) * r * 1.1).toFixed(2)}`);
        }
        return `<polygon class="node-bg" points="${pts.join(" ")}"/>`;
    }
    if (shape === "square") {
        return `<rect class="node-bg" x="${-r}" y="${-r}" width="${r * 2}" height="${r * 2}" rx="${r * 0.42}"/>`;
    }
    if (shape === "band") {
        const w = 112;
        return `<rect class="node-bg" x="${-w / 2}" y="${-r * 0.66}" width="${w}" height="${r * 1.32}" rx="9"/>`;
    }
    return `<circle class="node-bg" r="${r}"/>`;
}

function nodeSubLabel(node) {
    const r = node.record || {};
    if (node.type === "events" && r.date) return `${r.date}`;
    if (node.type === "characters" && r.status) return r.status === "alive" ? "alive" : r.status;
    if (node.type === "factions") return `${(r.memberIds || []).length} members`;
    if (node.type === "storylines") return r.status || "";
    if (node.type === "mysteries") return (r.status || "").replace("_", " ");
    if (node.type === "items") return r.status || "";
    if (node.type === "locations") return r.type || "";
    return "";
}

function importanceColor(n) {
    const v = Number(n) || 0;
    if (v >= 5) return "#f0c674";
    if (v >= 4) return "#d9a96a";
    if (v >= 3) return "#9aa3a8";
    return "#4d5561";
}

function edgePath(a, b, ra, rb, edge) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const ax = a.x + ux * (ra + 2);
    const ay = a.y + uy * (ra + 2);
    const bx = b.x - ux * (rb + 2);
    const by = b.y - uy * (rb + 2);
    const bend = edge?.kind === "secret" ? 0.16 : 0.07;
    const sign = hashCode(edge?.id || "") % 2 === 0 ? 1 : -1;
    const mx = (ax + bx) / 2 + dy * bend * sign;
    const my = (ay + by) / 2 - dx * bend * sign;
    return `M${ax.toFixed(1)},${ay.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
}

function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
    return Math.abs(h);
}

function sanitizeId(id) {
    return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function nodeIcon(type) {
    return icon(TYPE_ICON[type] || "info");
}
