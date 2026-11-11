/* AllForOne Story Planner — dependency-free force-directed graph.
 *
 * Plain SVG + pointer events. Supports zoom, pan, drag, fit, reset, search
 * highlighting, type filtering and persisted layouts. Node/edge data is always
 * supplied from real database records by the calling page.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined) continue;
        node.setAttribute(k, v);
    }
    return node;
}

function textWidth(str, size) {
    return String(str).length * size * 0.56 + 18;
}

export function createGraph(container, opts = {}) {
    const options = {
        nodeHeight: 30,
        fontSize: 11,
        charge: 1,
        linkDistance: 120,
        showEdgeLabels: true,
        onSelect: null,
        onOpen: null,
        ...opts,
    };

    let nodes = [];
    let edges = [];
    let nodeIndex = new Map();
    let visibleTypes = null; // Set or null (all)
    let selectedId = null;
    let searchTerm = "";

    const svg = svgEl("svg", { xmlns: SVG_NS, role: "img", "aria-label": "Storyline diagram" });
    const viewport = svgEl("g");
    const edgeLayer = svgEl("g", { class: "dg-edges" });
    const nodeLayer = svgEl("g", { class: "dg-nodes" });
    viewport.append(edgeLayer, nodeLayer);

    const defs = svgEl("defs");
    const marker = svgEl("marker", {
        id: "dg-arrow",
        viewBox: "0 0 10 10",
        refX: 9,
        refY: 5,
        markerWidth: 6,
        markerHeight: 6,
        orient: "auto-start-reverse",
    });
    marker.appendChild(svgEl("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "currentColor" }));
    defs.appendChild(marker);
    svg.append(defs, viewport);
    container.appendChild(svg);

    let tx = 0;
    let ty = 0;
    let scale = 1;

    const applyTransform = () => {
        viewport.setAttribute("transform", `translate(${tx},${ty}) scale(${scale})`);
    };
    applyTransform();

    const size = () => ({
        w: container.clientWidth || 800,
        h: container.clientHeight || 500,
    });

    /* ------------------------------------------------------------ layout */

    let simToken = 0;
    let simRunning = false;

    function tick(iterations = 1) {
        const { w, h } = size();
        const cx = w / 2;
        const cy = h / 2;
        for (let it = 0; it < iterations; it++) {
            const alpha = 1 - it / Math.max(1, iterations);
            // repulsion
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const a = nodes[i];
                    const b = nodes[j];
                    let dx = b.x - a.x;
                    let dy = b.y - a.y;
                    let dist2 = dx * dx + dy * dy;
                    if (dist2 < 1) {
                        dx = (Math.random() - 0.5) * 2;
                        dy = (Math.random() - 0.5) * 2;
                        dist2 = 1;
                    }
                    const dist = Math.sqrt(dist2);
                    const force = (2400 * options.charge) / dist2;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    a.vx -= fx;
                    a.vy -= fy;
                    b.vx += fx;
                    b.vy += fy;
                }
            }
            // springs
            for (const e of edges) {
                const a = nodeIndex.get(e.source);
                const b = nodeIndex.get(e.target);
                if (!a || !b) continue;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const diff = (dist - options.linkDistance) * 0.035;
                const fx = (dx / dist) * diff;
                const fy = (dy / dist) * diff;
                a.vx += fx;
                a.vy += fy;
                b.vx -= fx;
                b.vy -= fy;
            }
            // centering + integration
            for (const n of nodes) {
                n.vx += (cx - n.x) * 0.006;
                n.vy += (cy - n.y) * 0.008;
                if (!n.fixed) {
                    n.x += n.vx * 0.55 * alpha;
                    n.y += n.vy * 0.55 * alpha;
                }
                n.vx *= 0.72;
                n.vy *= 0.72;
            }
        }
        paint();
    }

    function warmLayout() {
        const { w, h } = size();
        // seed on a circle so the first frames look intentional
        const n = nodes.length || 1;
        nodes.forEach((node, i) => {
            if (Number.isFinite(node.x) && Number.isFinite(node.y)) return;
            const angle = (i / n) * Math.PI * 2;
            const radius = Math.min(w, h) * 0.32 + (i % 3) * 24;
            node.x = w / 2 + Math.cos(angle) * radius;
            node.y = h / 2 + Math.sin(angle) * radius;
            node.vx = 0;
            node.vy = 0;
        });
    }

    function runSimulation(frames = 90) {
        const token = ++simToken;
        simRunning = true;
        let remaining = frames;
        const step = () => {
            if (token !== simToken) return;
            tick(2);
            remaining -= 2;
            if (remaining > 0) requestAnimationFrame(step);
            else {
                simRunning = false;
                fit();
            }
        };
        requestAnimationFrame(step);
    }

    /* ------------------------------------------------------------- paint */

    function visibleNodes() {
        return nodes.filter((n) => !visibleTypes || visibleTypes.has(n.type));
    }

    function isMatch(n) {
        if (!searchTerm) return false;
        return String(n.label || "").toLowerCase().includes(searchTerm);
    }

    function connectedIds(id) {
        const ids = new Set([id]);
        edges.forEach((e) => {
            if (e.source === id) ids.add(e.target);
            if (e.target === id) ids.add(e.source);
        });
        return ids;
    }

    function paint() {
        const vis = visibleNodes();
        const visIds = new Set(vis.map((n) => n.id));
        const focusSet = selectedId ? connectedIds(selectedId) : null;

        // ---- edges
        while (edgeLayer.firstChild) edgeLayer.removeChild(edgeLayer.firstChild);

        for (const e of edges) {
            const a = nodeIndex.get(e.source);
            const b = nodeIndex.get(e.target);
            if (!a || !b || !visIds.has(a.id) || !visIds.has(b.id)) continue;
            const g = svgEl("g", { class: "dg-edge" });
            if (focusSet && !(focusSet.has(a.id) && focusSet.has(b.id))) g.classList.add("dim");
            else if (focusSet) g.classList.add("hl");
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 1;
            const padB = (b.width || 100) / 2 + 6;
            const padA = (a.width || 100) / 2 + 6;
            const x1 = a.x + (dx / dist) * padA;
            const y1 = a.y + (dy / dist) * (options.nodeHeight / 2 + 4);
            const x2 = b.x - (dx / dist) * padB;
            const y2 = b.y - (dy / dist) * (options.nodeHeight / 2 + 4);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2 + Math.min(28, dist * 0.12);
            g.appendChild(
                svgEl("path", {
                    d: `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`,
                    "marker-end": "url(#dg-arrow)",
                    style: "color: var(--border-strong)",
                })
            );
            if (options.showEdgeLabels && e.label && !focusSet) {
                const label = svgEl("text", { x: mx, y: my - 3, "text-anchor": "middle" });
                label.textContent = e.label;
                g.appendChild(label);
            }
            edgeLayer.appendChild(g);
        }

        // ---- nodes
        while (nodeLayer.firstChild) nodeLayer.removeChild(nodeLayer.firstChild);
        for (const node of vis) {
            const g = svgEl("g", {
                class: "dg-node",
                transform: `translate(${node.x},${node.y})`,
                "data-id": node.id,
                tabindex: "0",
                role: "button",
                "aria-label": node.label,
            });
            if (node.id === selectedId) g.classList.add("sel");
            else if (focusSet && focusSet.has(node.id)) g.classList.add("rel");
            else if (focusSet) g.classList.add("dim");
            if (isMatch(node)) g.classList.add("sel");

            const w = node.width || Math.max(84, textWidth(node.label, options.fontSize));
            node.width = w;
            const h = options.nodeHeight;
            const accent = node.color || "var(--primary-blue)";

            if (node.shape === "circle") {
                g.appendChild(svgEl("circle", { r: h / 2, cx: 0, cy: 0, fill: "var(--surface)", stroke: accent, "stroke-width": 2 }));
                g.appendChild(svgEl("circle", { r: 4, cx: 0, cy: 0, fill: accent, stroke: "none" }));
                const t = svgEl("text", { x: h / 2 + 6, y: 4 });
                t.textContent = node.label;
                g.appendChild(t);
            } else {
                g.appendChild(
                    svgEl("rect", {
                        x: -w / 2,
                        y: -h / 2,
                        width: w,
                        height: h,
                        rx: 8,
                        fill: "var(--surface)",
                        stroke: accent,
                        "stroke-width": 1.6,
                        style: `filter: drop-shadow(0 1px 3px rgba(20,30,45,0.10))`,
                    })
                );
                g.appendChild(svgEl("rect", { x: -w / 2, y: -h / 2, width: 4, height: h, rx: 2, fill: accent, stroke: "none" }));
                const t = svgEl("text", { x: 2, y: node.sub ? -1 : 4, "text-anchor": "middle" });
                t.textContent = node.label.length > 26 ? node.label.slice(0, 25) + "…" : node.label;
                g.appendChild(t);
                if (node.sub) {
                    const s = svgEl("text", { x: 2, y: 11, "text-anchor": "middle", class: "dg-sub" });
                    s.textContent = node.sub;
                    g.appendChild(s);
                }
            }

            attachDrag(g, node);
            g.addEventListener("dblclick", (ev) => {
                ev.stopPropagation();
                if (options.onOpen) options.onOpen(node);
            });
            nodeLayer.appendChild(g);
        }
    }

    /* -------------------------------------------------------- interaction */

    let dragging = null;
    let panning = null;

    function toWorld(clientX, clientY) {
        const rect = svg.getBoundingClientRect();
        return {
            x: (clientX - rect.left - tx) / scale,
            y: (clientY - rect.top - ty) / scale,
        };
    }

    function attachDrag(g, node) {
        let moved = false;
        let start = null;
        g.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            g.setPointerCapture(e.pointerId);
            const p = toWorld(e.clientX, e.clientY);
            start = { x: p.x - node.x, y: p.y - node.y, sx: e.clientX, sy: e.clientY };
            moved = false;
            dragging = { node, g, start };
            g.style.cursor = "grabbing";
        });
        g.addEventListener("pointermove", (e) => {
            if (!dragging || dragging.node !== node) return;
            const p = toWorld(e.clientX, e.clientY);
            if (Math.hypot(e.clientX - start.sx, e.clientY - start.sy) > 3) moved = true;
            node.x = p.x - start.x;
            node.y = p.y - start.y;
            node.fixed = true;
            g.setAttribute("transform", `translate(${node.x},${node.y})`);
            paintEdgesOnly();
        });
        g.addEventListener("pointerup", (e) => {
            if (dragging && dragging.node === node) {
                dragging = null;
                g.style.cursor = "";
                if (!moved) {
                    selectedId = node.id;
                    paint();
                    if (options.onSelect) options.onSelect(node);
                } else if (options.onDragEnd) {
                    options.onDragEnd();
                }
            }
        });
        g.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectedId = node.id;
                paint();
                if (options.onSelect) options.onSelect(node);
            }
        });
    }

    function paintEdgesOnly() {
        // cheap path update while dragging a node
        const paths = edgeLayer.querySelectorAll(".dg-edge");
        let idx = 0;
        for (const e of edges) {
            const a = nodeIndex.get(e.source);
            const b = nodeIndex.get(e.target);
            if (!a || !b || (!visibleIds().has(a.id) || !visibleIds().has(b.id))) continue;
            const g = paths[idx++];
            if (!g) continue;
            const path = g.querySelector("path");
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 1;
            const x1 = a.x + (dx / dist) * ((a.width || 100) / 2 + 6);
            const y1 = a.y + (dy / dist) * (options.nodeHeight / 2 + 4);
            const x2 = b.x - (dx / dist) * ((b.width || 100) / 2 + 6);
            const y2 = b.y - (dy / dist) * (options.nodeHeight / 2 + 4);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2 + Math.min(28, dist * 0.12);
            if (path) path.setAttribute("d", `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`);
        }
    }

    function visibleIds() {
        return new Set(visibleNodes().map((n) => n.id));
    }

    // pan
    svg.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".dg-node")) return;
        svg.setPointerCapture(e.pointerId);
        container.classList.add("dragging");
        panning = { x: e.clientX, y: e.clientY, tx, ty };
        if (e.target === svg || e.target === viewport) {
            selectedId = null;
            paint();
            if (options.onSelect) options.onSelect(null);
        }
    });
    svg.addEventListener("pointermove", (e) => {
        if (!panning) return;
        tx = panning.tx + (e.clientX - panning.x);
        ty = panning.ty + (e.clientY - panning.y);
        applyTransform();
    });
    svg.addEventListener("pointerup", () => {
        panning = null;
        container.classList.remove("dragging");
    });
    svg.addEventListener("pointercancel", () => {
        panning = null;
        container.classList.remove("dragging");
    });

    container.addEventListener(
        "wheel",
        (e) => {
            if (!e.ctrlKey && Math.abs(e.deltaY) > 0 && !e.shiftKey) {
                // plain wheel still zooms inside the diagram (no page scroll)
                e.preventDefault();
            }
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            zoomAt(e.clientX, e.clientY, factor);
        },
        { passive: false }
    );

    function zoomAt(clientX, clientY, factor) {
        const rect = svg.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const next = Math.min(3.2, Math.max(0.18, scale * factor));
        tx = px - ((px - tx) * next) / scale;
        ty = py - ((py - ty) * next) / scale;
        scale = next;
        applyTransform();
    }

    /* ------------------------------------------------------------ public */

    const api = {
        setData({ nodes: n, edges: e }, { layout = true } = {}) {
            nodes = (n || []).map((node) => ({ ...node }));
            nodeIndex = new Map(nodes.map((node) => [node.id, node]));
            edges = (e || []).filter((edge) => nodeIndex.has(edge.source) && nodeIndex.has(edge.target));
            selectedId = null;
            paint();
            if (layout) {
                warmLayout();
                runSimulation(nodes.length > 120 ? 60 : 90);
            } else {
                paint();
            }
        },
        setVisibleTypes(types) {
            visibleTypes = types && types.size ? types : null;
            paint();
        },
        search(term) {
            searchTerm = String(term || "").toLowerCase();
            if (searchTerm) {
                const hit = nodes.find((n) => String(n.label || "").toLowerCase().includes(searchTerm));
                if (hit) {
                    selectedId = hit.id;
                    centerOn(hit);
                }
            }
            paint();
        },
        select(id, { center = true } = {}) {
            selectedId = id;
            const node = nodeIndex.get(id);
            if (node && center) centerOn(node);
            paint();
            return node || null;
        },
        centerOn,
        zoomIn() {
            const rect = svg.getBoundingClientRect();
            zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.25);
        },
        zoomOut() {
            const rect = svg.getBoundingClientRect();
            zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.25);
        },
        fit,
        relayout() {
            nodes.forEach((n) => {
                n.fixed = false;
                n.x = NaN;
                n.y = NaN;
            });
            warmLayout();
            runSimulation(90);
        },
        clearSelection() {
            selectedId = null;
            paint();
        },
        positions() {
            return nodes.map((n) => ({ id: n.id, x: Math.round(n.x), y: Math.round(n.y) }));
        },
        isRunning() {
            return simRunning;
        },
        destroy() {
            simToken++;
            svg.remove();
        },
        get data() {
            return { nodes, edges };
        },
    };

    function centerOn(node) {
        const { w, h } = size();
        tx = w / 2 - node.x * scale;
        ty = h / 2 - node.y * scale;
        applyTransform();
    }

    function fit() {
        const vis = visibleNodes();
        if (!vis.length) return;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const n of vis) {
            const w = (n.width || 110) / 2 + 20;
            minX = Math.min(minX, n.x - w);
            maxX = Math.max(maxX, n.x + w);
            minY = Math.min(minY, n.y - options.nodeHeight / 2 - 20);
            maxY = Math.max(maxY, n.y + options.nodeHeight / 2 + 20);
        }
        const { w, h } = size();
        const gw = Math.max(1, maxX - minX);
        const gh = Math.max(1, maxY - minY);
        scale = Math.min(1.6, Math.max(0.2, Math.min(w / gw, h / gh) * 0.92));
        tx = w / 2 - ((minX + maxX) / 2) * scale;
        ty = h / 2 - ((minY + maxY) / 2) * scale;
        applyTransform();
    }

    const onResize = () => paint();
    window.addEventListener("resize", onResize);

    api.destroy = ((orig) => () => {
        window.removeEventListener("resize", onResize);
        orig();
    })(api.destroy);

    return api;
}
