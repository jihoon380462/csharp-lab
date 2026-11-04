// 클래스 다이어그램 (UML 비슷하게) — engine.analyze() 결과(types·relations)를 SVG 로 그린다. 외부 라이브러리 없음.
//
//   import { renderClassDiagram } from "/csharp-lab/core/class-diagram.js";
//   const r = await engine.analyze(code);
//   const d = renderClassDiagram(hostDiv, r, { onSelect: (type) => editor.selectLine(type.line), members: true });
//   d.boxes  → [{ name, x, y, w, h }]   (검사용)
//
// 배치: 부모(상속·구현 대상)가 위, 자식이 아래. 계층에 안 걸린 타입은 자기를 품는(has·creates) 타입 아래로.
// 선:   상속 ─▷   구현 ┄▷   가짐 ◇─ (여럿이면 *)   생성 ┄> «create»   사용 ┈>
// 같은 두 타입 사이에 관계가 여러 개면 중요한 것 하나만 그린다 (상속·구현 > 가짐 > 생성 > 사용).

const CSS = `
.ccd{position:relative;overflow:auto;-webkit-overflow-scrolling:touch}
.ccd svg{display:block;margin:0 auto}
.ccd .box{cursor:pointer}
.ccd .box:hover rect.frame{stroke-width:2.2}
.ccd .empty{padding:24px;text-align:center;color:var(--ccd-muted,#9a92ad);font-size:13px}
.ccd-legend{display:flex;flex-wrap:wrap;gap:4px 14px;justify-content:center;padding:6px 8px 8px;font-size:11.5px;color:var(--ccd-muted,#9a92ad)}
.ccd-legend span{white-space:nowrap}
.ccd-legend svg{vertical-align:middle;margin-right:4px}
`;

const COLORS = {
  interface: "#b07cf0", abstract: "#3fb5a3", class: "#6d9cf2", record: "#69c27a",
  struct: "#d7a24c", enum: "#e08a5f", static: "#9aa3b5", delegate: "#c98bd4",
};
const EDGE = { inherits: "#cfc6e6", implements: "#b07cf0", has: "#6d9cf2", creates: "#69c27a", uses: "#6f6789" };
const PRIORITY = { inherits: 5, implements: 5, has: 3, creates: 2, uses: 1 };

const FONT = '12px "D2Coding","Cascadia Code",Consolas,"SF Mono",ui-monospace,Menlo,monospace';
const FONT_B = 'bold 13px "D2Coding","Cascadia Code",Consolas,"SF Mono",ui-monospace,Menlo,monospace';
const PAD = 10, LINE = 16, HEAD = 22, GAP_X = 34, GAP_Y = 64, MAX_MEMBERS = 9, MAX_CHARS = 40;

let cssInjected = false;
let measureCtx = null;
function measure(text, font) {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cut = (s) => (s.length > MAX_CHARS ? s.slice(0, MAX_CHARS - 1) + "…" : s);

function kindOf(t) {
  if (t.kind === "interface") return "interface";
  if (t.isStatic) return "static";
  if (t.isAbstract) return "abstract";
  if (t.kind.startsWith("record")) return "record";
  if (t.kind === "struct") return "struct";
  return COLORS[t.kind] ? t.kind : "class";
}

function stereotype(t) {
  if (t.kind === "interface") return "«interface»";
  if (t.isStatic) return "«static»";
  if (t.isAbstract) return "«abstract»";
  if (t.kind === "record" || t.kind === "record struct") return "«" + t.kind + "»";
  if (t.kind === "enum" || t.kind === "struct" || t.kind === "delegate") return "«" + t.kind + "»";
  return null;
}

function memberLine(m) {
  const mods = m.isStatic ? "static " : "";
  if (m.kind === "value") return m.name;
  if (m.kind === "constructor") return `${m.access} ${m.name}(${m.params || ""})`;
  if (m.kind === "method") return `${m.access} ${mods}${m.name}(${m.params || ""}): ${m.type}`;
  if (m.kind === "event") return `${m.access} ${mods}event ${m.name}: ${m.type}`;
  return `${m.access} ${mods}${m.name}: ${m.type}`;
}

// ───────── 배치 ─────────
function layout(types, relations) {
  const idx = new Map(types.map((t, i) => [t.name, i]));
  const n = types.length;
  const parents = types.map(() => new Set());
  const hier = (r) => r.kind === "inherits" || r.kind === "implements";
  for (const r of relations) {
    if (!hier(r) || r.from === r.to || !idx.has(r.from) || !idx.has(r.to)) continue;
    parents[idx.get(r.from)].add(idx.get(r.to));
  }
  const inHier = types.map((_, i) => parents[i].size > 0 || parents.some((p) => p.has(i)));

  // 1) 계층: 부모 위 (가장 긴 경로)
  const level = new Array(n).fill(0);
  for (let pass = 0; pass < n; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++)
      for (const p of parents[i]) if (level[i] < level[p] + 1 && level[p] + 1 < n) { level[i] = level[p] + 1; changed = true; }
    if (!changed) break;
  }
  // 2) 계층에 없는 타입: 자기를 품는(has·creates) 타입 한 줄 아래로 (순환은 n번으로 제한)
  for (let pass = 0; pass < n; pass++) {
    let changed = false;
    for (const r of relations) {
      if (hier(r) || r.kind === "uses" || r.from === r.to || !idx.has(r.from) || !idx.has(r.to)) continue;
      const a = idx.get(r.from), b = idx.get(r.to);
      if (inHier[b]) continue;
      if (level[b] < level[a] + 1 && level[a] + 1 < n) { level[b] = level[a] + 1; changed = true; }
    }
    if (!changed) break;
  }
  // 빈 줄 없애기
  const used = [...new Set(level)].sort((a, b) => a - b);
  const remap = new Map(used.map((l, i) => [l, i]));
  for (let i = 0; i < n; i++) level[i] = remap.get(level[i]);

  // 3) 줄 안 순서: 선언 순서 → 이웃 평균 위치로 몇 번 다듬기
  const rows = [];
  for (let i = 0; i < n; i++) (rows[level[i]] = rows[level[i]] || []).push(i);
  const neighbors = types.map(() => []);
  for (const r of relations) {
    if (r.from === r.to || !idx.has(r.from) || !idx.has(r.to)) continue;
    const a = idx.get(r.from), b = idx.get(r.to);
    neighbors[a].push(b); neighbors[b].push(a);
  }
  const pos = new Array(n).fill(0);
  const setPos = () => rows.forEach((row) => row.forEach((i, k) => (pos[i] = k / Math.max(1, row.length - 1))));
  setPos();
  for (let it = 0; it < 6; it++) {
    const order = it % 2 === 0 ? rows : [...rows].reverse();
    for (const row of order) {
      const key = new Map(row.map((i) => {
        const nb = neighbors[i].filter((j) => level[j] !== level[i]);
        return [i, nb.length ? nb.reduce((s, j) => s + pos[j], 0) / nb.length : pos[i]];
      }));
      row.sort((a, b) => key.get(a) - key.get(b));
    }
    setPos();
  }
  return rows;
}

// ───────── 선 모양 ─────────
function clipToBox(b, px, py) {
  // 상자 중심에서 (px,py) 쪽으로 나가는 선이 상자 테두리와 만나는 점
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const dx = px - cx, dy = py - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const sx = dx !== 0 ? (b.w / 2) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (b.h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}

export function renderClassDiagram(host, model, opts = {}) {
  if (!cssInjected) {
    cssInjected = true;
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  host.classList.add("ccd");
  const types = (model && model.types) || [];
  const relations = ((model && model.relations) || []).filter((r) => types.some((t) => t.name === r.from) && types.some((t) => t.name === r.to));
  if (!types.length) {
    host.innerHTML = `<div class="empty">${esc(opts.emptyText || "클래스·인터페이스가 아직 없어요")}</div>`;
    return { boxes: [], edges: [], width: 0, height: 0 };
  }
  const showMembers = opts.members !== false;
  const uid = "ccd" + Math.random().toString(36).slice(2, 8);

  // 상자 크기
  const boxes = types.map((t) => {
    const lines = [];
    const st = stereotype(t);
    const extra = [];
    if (t.baseType && !types.some((x) => x.name === t.baseType)) extra.push("▷ " + t.baseType);
    for (const i of t.interfaces || []) if (!types.some((x) => x.name === i)) extra.push("◁ " + i);
    let members = showMembers ? (t.members || []) : [];
    const more = Math.max(0, members.length - MAX_MEMBERS);
    members = members.slice(0, MAX_MEMBERS);
    const memberTexts = members.map((m) => cut(memberLine(m)));
    if (more) memberTexts.push(`… ${more}개 더`);
    let w = Math.max(measure(t.name, FONT_B), st ? measure(st, FONT) : 0, ...extra.map((e) => measure(cut(e), FONT)), ...memberTexts.map((m) => measure(m, FONT)), 70) + PAD * 2;
    w = Math.ceil(w);
    const headH = HEAD + (st ? LINE - 4 : 0) + extra.length * (LINE - 2);
    const h = headH + (memberTexts.length ? memberTexts.length * LINE + 10 : 6);
    return { t, name: t.name, st, extra: extra.map(cut), memberTexts, members, w, h, headH, x: 0, y: 0, kind: kindOf(t) };
  });
  const byName = new Map(boxes.map((b) => [b.name, b]));

  // 배치
  const rows = layout(types, relations);
  const rowW = rows.map((row) => row.reduce((s, i) => s + boxes[i].w, 0) + GAP_X * (row.length - 1));
  const W = Math.max(...rowW) + 40;
  let y = 20;
  rows.forEach((row, ri) => {
    let x = (W - rowW[ri]) / 2;
    const rowH = Math.max(...row.map((i) => boxes[i].h));
    for (const i of row) { boxes[i].x = Math.round(x); boxes[i].y = y; x += boxes[i].w + GAP_X; }
    y += rowH + GAP_Y;
  });
  const H = y - GAP_Y + 30;

  // 관계: 같은 쌍은 우선순위 높은 것 하나만
  const pairs = new Map();
  for (const r of relations) {
    const key = r.from === r.to ? r.from + "\u0000self" : [r.from, r.to].sort().join("\u0000") + "\u0000" + (PRIORITY[r.kind] === 5 ? "h" : "o");
    const cur = pairs.get(key);
    if (!cur || PRIORITY[r.kind] > PRIORITY[cur.kind] || (PRIORITY[r.kind] === PRIORITY[cur.kind] && r.many && !cur.many)) pairs.set(key, r);
  }
  // 양방향(서로 품음)이면 선을 조금 벌린다
  const drawn = [...pairs.values()];
  const dirCount = new Map();
  for (const r of drawn) { const k = [r.from, r.to].sort().join("\u0000"); dirCount.set(k, (dirCount.get(k) || 0) + 1); }

  // 상속·구현 선이 부모 아래쪽에 들어오는 자리 나눠 주기
  const into = new Map();
  for (const r of drawn) if (PRIORITY[r.kind] === 5 && r.from !== r.to) (into.get(r.to) || into.set(r.to, []).get(r.to)).push(r);
  for (const [to, list] of into) list.sort((a, b) => (byName.get(a.from).x + byName.get(a.from).w / 2) - (byName.get(b.from).x + byName.get(b.from).w / 2));

  const edges = [];
  let svgEdges = "";
  for (const r of drawn) {
    const a = byName.get(r.from), b = byName.get(r.to);
    const color = EDGE[r.kind] || "#888";
    const dash = r.kind === "implements" || r.kind === "creates" ? "6 4" : r.kind === "uses" ? "2 4" : "";
    const start = r.kind === "has" ? `url(#${uid}-dia)` : "";
    const end = PRIORITY[r.kind] === 5 ? `url(#${uid}-tri-${r.kind})` : r.kind === "has" ? "" : `url(#${uid}-arr-${r.kind})`;
    let d, lx, ly;
    if (r.from === r.to) {
      const x0 = a.x + a.w, y0 = a.y + Math.min(14, a.h / 3), y1 = a.y + Math.min(a.h - 6, 40);
      d = `M${x0} ${y0} C${x0 + 34} ${y0 - 6}, ${x0 + 34} ${y1 + 6}, ${x0} ${y1}`;
      lx = x0 + 30; ly = (y0 + y1) / 2;
    } else if (PRIORITY[r.kind] === 5 && a.y > b.y) {
      const list = into.get(r.to);
      const k = list.indexOf(r), cnt = list.length;
      const tx = b.x + b.w * (k + 1) / (cnt + 1);
      const sx = a.x + a.w / 2, sy = a.y, ty = b.y + b.h;
      const my = (sy + ty) / 2;
      d = `M${sx} ${sy} L${sx} ${my} L${tx} ${my} L${tx} ${ty}`;
      lx = (sx + tx) / 2; ly = my;
    } else {
      let [x1, y1] = clipToBox(a, b.x + b.w / 2, b.y + b.h / 2);
      let [x2, y2] = clipToBox(b, a.x + a.w / 2, a.y + a.h / 2);
      if ((dirCount.get([r.from, r.to].sort().join("\u0000")) || 0) > 1) {
        const len = Math.hypot(x2 - x1, y2 - y1) || 1, off = r.from < r.to ? 5 : -5;
        const ox = -(y2 - y1) / len * off, oy = (x2 - x1) / len * off;
        x1 += ox; y1 += oy; x2 += ox; y2 += oy;
      }
      d = `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`;
      lx = (x1 + x2) / 2; ly = (y1 + y2) / 2;
    }
    edges.push({ from: r.from, to: r.to, kind: r.kind, d });
    svgEdges += `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"${dash ? ` stroke-dasharray="${dash}"` : ""}${start ? ` marker-start="${start}"` : ""}${end ? ` marker-end="${end}"` : ""}><title>${esc(r.from)} ${esc({ inherits: "상속", implements: "구현", has: "가짐", creates: "생성", uses: "사용" }[r.kind])} ${esc(r.to)}${r.via ? " (" + esc(r.via) + ")" : ""}</title></path>`;
    const label = r.kind === "creates" ? "«create»" : r.kind === "has" && r.many ? "*" : r.kind === "uses" ? "" : "";
    if (label) svgEdges += `<text x="${lx.toFixed(1)}" y="${(ly - 4).toFixed(1)}" text-anchor="middle" fill="${color}" font-size="11" font-family="system-ui,sans-serif" paint-order="stroke" stroke="#120f18" stroke-width="3">${esc(label)}</text>`;
  }

  // 상자
  let svgBoxes = "";
  for (const b of boxes) {
    const c = COLORS[b.kind];
    let s = `<g class="box" data-name="${esc(b.name)}" transform="translate(${b.x},${b.y})">`;
    s += `<rect class="frame" width="${b.w}" height="${b.h}" rx="7" fill="#1b1724" stroke="${c}" stroke-width="1.4"/>`;
    s += `<rect width="${b.w}" height="${b.headH}" rx="7" fill="${c}" fill-opacity=".16"/>`;
    let ty = 15;
    if (b.st) { s += `<text x="${b.w / 2}" y="${ty}" text-anchor="middle" fill="${c}" font-size="11" font-family="system-ui,sans-serif">${esc(b.st)}</text>`; ty += LINE - 4; }
    s += `<text x="${b.w / 2}" y="${ty + 2}" text-anchor="middle" fill="#ece8f4" style="font:${FONT_B}${b.t.isAbstract || b.t.kind === "interface" ? ";font-style:italic" : ""}">${esc(b.name)}</text>`;
    ty += 4;
    for (const e of b.extra) { ty += LINE - 2; s += `<text x="${b.w / 2}" y="${ty}" text-anchor="middle" fill="#9a92ad" style="font:${FONT}">${esc(e)}</text>`; }
    if (b.memberTexts.length) {
      s += `<line x1="0" y1="${b.headH}" x2="${b.w}" y2="${b.headH}" stroke="${c}" stroke-opacity=".5"/>`;
      b.memberTexts.forEach((m, i) => {
        const mm = b.members[i];
        const deco = mm && mm.isStatic ? "text-decoration:underline;" : "";
        const ital = mm && mm.isAbstract ? "font-style:italic;" : "";
        const col = mm ? (mm.access === "+" ? "#d8d2e6" : "#9a92ad") : "#6f6789";
        s += `<text x="${PAD}" y="${b.headH + 16 + i * LINE}" fill="${col}" style="font:${FONT};${deco}${ital}">${esc(m)}</text>`;
      });
    }
    s += `<title>${esc(b.name)} — ${b.t.line}번째 줄</title></g>`;
    svgBoxes += s;
  }

  const tri = (kind) => `<marker id="${uid}-tri-${kind}" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 1 L11 6 L1 11 Z" fill="#1b1724" stroke="${EDGE[kind]}" stroke-width="1.4"/></marker>`;
  const arr = (kind) => `<marker id="${uid}-arr-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 1 L9 5 L1 9" fill="none" stroke="${EDGE[kind]}" stroke-width="1.5"/></marker>`;
  const defs = `<defs>${tri("inherits")}${tri("implements")}${arr("creates")}${arr("uses")}` +
    `<marker id="${uid}-dia" viewBox="0 0 16 10" refX="1" refY="5" markerWidth="16" markerHeight="10" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 5 L8 1 L15 5 L8 9 Z" fill="#1b1724" stroke="${EDGE.has}" stroke-width="1.4"/></marker></defs>`;

  const minW = Math.min(W, opts.minWidth || 560);
  host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;min-width:${minW}px" role="img" aria-label="클래스 다이어그램: ${esc(types.map((t) => t.name).join(", "))}">${defs}${svgEdges}${svgBoxes}</svg>`;
  if (opts.onSelect) {
    host.querySelectorAll(".box").forEach((g) => g.addEventListener("click", () => {
      const t = types.find((x) => x.name === g.dataset.name);
      if (t) opts.onSelect(t);
    }));
  }
  return { boxes: boxes.map((b) => ({ name: b.name, x: b.x, y: b.y, w: b.w, h: b.h })), edges, width: W, height: H };
}

/** 범례 HTML (다이어그램 아래에 붙이기) */
export function classDiagramLegend() {
  const line = (color, dash, end) => `<svg width="34" height="10"><line x1="1" y1="5" x2="${end === "dia" ? 33 : 26}" y2="5" stroke="${color}" stroke-width="1.5"${dash ? ` stroke-dasharray="${dash}"` : ""}/>` +
    (end === "tri" ? `<path d="M25 1 L33 5 L25 9 Z" fill="#1b1724" stroke="${color}"/>` : end === "arr" ? `<path d="M27 1 L33 5 L27 9" fill="none" stroke="${color}" stroke-width="1.5"/>` : `<path d="M1 5 L7 1.5 L13 5 L7 8.5 Z" fill="#1b1724" stroke="${color}"/>`) + `</svg>`;
  return `<div class="ccd-legend">` +
    `<span>${line(EDGE.inherits, "", "tri")}상속</span>` +
    `<span>${line(EDGE.implements, "6 4", "tri")}구현</span>` +
    `<span>${line(EDGE.has, "", "dia")}가짐 (* 여럿)</span>` +
    `<span>${line(EDGE.creates, "6 4", "arr")}생성 «create»</span>` +
    `<span>${line(EDGE.uses, "2 4", "arr")}사용</span></div>`;
}
