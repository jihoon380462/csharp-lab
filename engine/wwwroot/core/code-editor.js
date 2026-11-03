// 가벼운 C# 코드 편집기 (외부 라이브러리 없음). 높이는 host 요소에 정해 둘 것 (예: .editor { height: 280px }).
// <textarea>(글자 투명) 뒤에 색칠한 <pre>와 오류 밑줄 <pre>를 같은 자리에 겹쳐 그린다.
//
//   import { createCodeEditor } from "/csharp-lab/core/code-editor.js";
//   const ed = createCodeEditor(document.getElementById("host"), {
//     value: "Console.WriteLine(1);", onChange: (code) => {}, onRun: () => {},   // onRun = Ctrl/Cmd+Enter
//     id: "code", gutterId: "gutter",                                            // (선택) 요소 id
//   });
//   ed.value / ed.value = "..." / ed.setDiagnostics([{severity, line, column, endLine, endColumn, message}])
//   ed.selectLine(3) / ed.focus() / ed.textarea / ed.insert("텍스트", 커서를뒤로몇칸)
//
// 키: Tab = 공백 4칸(선택 영역이면 줄마다), Shift+Tab = 내어쓰기, Enter = 들여쓰기 유지({ 뒤면 한 칸 더, {|} 사이면 블록으로 펼침)

const CSS = `
.cse{position:relative;display:flex;color-scheme:dark;background:var(--cse-bg,#120f18);font-family:var(--cse-font,"D2Coding","Cascadia Code",Consolas,"SF Mono",ui-monospace,Menlo,monospace);font-size:var(--cse-size,14px);line-height:var(--cse-lh,21px)}
.cse-gutter{flex:none;width:44px;margin:0;padding:12px 8px 12px 0;text-align:right;color:var(--cse-gutter,#5d5470);background:var(--cse-gutter-bg,#17131f);border-right:1px solid var(--cse-line,#352e45);overflow:hidden;user-select:none;font:inherit;white-space:pre}
.cse-gutter .e{color:#ff7a85;font-weight:700}
.cse-gutter .w{color:#f4c25b}
.cse-gutter-in{display:block;will-change:transform}
.cse-main{position:relative;flex:1;min-width:0;overflow:hidden}
.cse-layer,.cse-input{position:absolute;top:0;left:0;margin:0;padding:12px;border:0;font:inherit;line-height:inherit;tab-size:4;white-space:pre;letter-spacing:0;word-spacing:0}
.cse-layer{pointer-events:none;will-change:transform;min-width:100%;min-height:100%;box-sizing:border-box}
.cse-hl{color:var(--cse-text,#ece8f4)}
.cse-sq{color:transparent}
.cse-input{width:100%;height:100%;box-sizing:border-box;resize:none;outline:0;background:transparent;color:transparent;-webkit-text-fill-color:transparent;caret-color:var(--cse-caret,#fff);overflow:auto}
.cse-input::selection{background:rgba(168,111,224,.38);-webkit-text-fill-color:transparent}
.cse .k{color:#c792ea}.cse .t{color:#82aaff}.cse .s{color:#c3e88d}.cse .n{color:#f78c6c}.cse .c{color:#6f6789;font-style:italic}
.cse .f{color:#ffcb6b}.cse .y{color:#89ddff}.cse .p{color:#ff5370}.cse .o{color:#b8b2c8}
.cse .sq-e{text-decoration:underline wavy #ff5c6c;text-decoration-skip-ink:none;text-underline-offset:3px;background:rgba(255,92,108,.10)}
.cse .sq-w{text-decoration:underline wavy #f4c25b;text-decoration-skip-ink:none;text-underline-offset:3px}
`;

let cssInjected = false;
function injectCss() {
  if (cssInjected) return;
  cssInjected = true;
  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);
}

// ───────── C# 문법 색칠 ─────────
const KW = new Set(("abstract as base break case catch checked class const continue default delegate do else enum event explicit extern " +
  "false finally fixed for foreach goto if implicit in interface internal is lock namespace new null operator out override params " +
  "private protected public readonly ref return sealed sizeof stackalloc static struct switch this throw true try typeof unchecked " +
  "unsafe using virtual volatile while async await yield record init get set value when where nameof and or not with global partial required").split(" "));
const TYPES = new Set("bool byte sbyte char decimal double float int uint long ulong short ushort object string void var dynamic nint nuint".split(" "));

const RULES = [
  ["c", /\/\/[^\n]*/y],
  ["c", /\/\*[\s\S]*?(?:\*\/|$)/y],
  ["s", /\$*"""[\s\S]*?(?:"""|$)/y],
  ["s", /(?:\$@|@\$|@)"(?:[^"]|"")*"?/y],
  ["s", /\$?"(?:[^"\\\n]|\\.)*"?/y],
  ["s", /'(?:[^'\\\n]|\\.){0,8}'/y],
  ["n", /(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[fFdDmMuUlL]*/y],
  ["i", /@?[A-Za-z_À-￿][A-Za-z0-9_À-￿]*/y],
  ["w", /\s+/y],
  ["o", /[\s\S]/y],
];

const esc = (s) => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

export function highlightCSharp(code) {
  let out = "", i = 0, lineStart = true;
  while (i < code.length) {
    // 전처리 지시문(# 으로 시작하는 줄)
    if (lineStart && code[i] === "#") {
      const end = code.indexOf("\n", i);
      const t = code.slice(i, end < 0 ? code.length : end);
      out += `<span class="p">${esc(t)}</span>`;
      i += t.length;
      continue;
    }
    let matched = false;
    for (const [cls, re] of RULES) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (!m || m[0].length === 0) continue;
      const t = m[0];
      let c = cls;
      if (cls === "i") {
        const word = t.startsWith("@") ? t.slice(1) : t;
        if (TYPES.has(word)) c = "t";
        else if (KW.has(word)) c = "k";
        else {
          const rest = code.slice(i + t.length).match(/^\s*(<[^<>()]*>)?\s*\(/);
          c = rest ? "f" : /^[A-Z]/.test(word) ? "y" : "";
        }
      }
      if (cls === "w") {
        out += t;
        lineStart = t.includes("\n") ? /\n[ \t]*$/.test(t) : lineStart;
      } else {
        out += c ? `<span class="${c}">${esc(t)}</span>` : esc(t);
        lineStart = false;
      }
      i += t.length;
      matched = true;
      break;
    }
    if (!matched) { out += esc(code[i]); i++; }
  }
  return out;
}

// ───────── 편집기 ─────────
export function createCodeEditor(host, opts = {}) {
  injectCss();
  host.classList.add("cse");
  host.innerHTML = `<pre class="cse-gutter" aria-hidden="true"><span class="cse-gutter-in"></span></pre>` +
    `<div class="cse-main"><pre class="cse-layer cse-hl" aria-hidden="true"></pre><pre class="cse-layer cse-sq" aria-hidden="true"></pre>` +
    `<textarea class="cse-input" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="${opts.label || "C# 코드"}"></textarea></div>`;
  const gutter = host.querySelector(".cse-gutter");
  const gutterIn = host.querySelector(".cse-gutter-in");
  const hl = host.querySelector(".cse-hl");
  const sq = host.querySelector(".cse-sq");
  const ta = host.querySelector("textarea");
  if (opts.id) ta.id = opts.id;
  if (opts.gutterId) gutter.id = opts.gutterId;

  let diags = [];

  function lineStarts(code) {
    const s = [0];
    for (let i = 0; i < code.length; i++) if (code[i] === "\n") s.push(i + 1);
    return s;
  }

  function renderSquiggles(code) {
    if (!diags.length) { sq.textContent = code + "\n "; return; }
    const starts = lineStarts(code);
    const sev = new Uint8Array(code.length + 1);
    const off = (line, col) => Math.min(code.length, (starts[Math.max(0, Math.min(starts.length - 1, line - 1))] || 0) + Math.max(0, col - 1));
    for (const d of diags) {
      if (!d.line) continue;
      let a = off(d.line, d.column || 1);
      let b = off(d.endLine || d.line, d.endColumn || (d.column || 1) + 1);
      if (b <= a) { // 길이 0 (예: ; 빠짐) → 앞 글자 하나에 표시
        if (a > 0 && (a >= code.length || code[a] === "\n")) a -= 1;
        b = a + 1;
      }
      const v = d.severity === "error" ? 2 : 1;
      for (let i = a; i < b && i < sev.length; i++) if (sev[i] < v) sev[i] = v;
    }
    let out = "", i = 0;
    while (i < code.length) {
      const v = sev[i];
      let j = i + 1;
      while (j < code.length && sev[j] === v && code[j] !== "\n") j++;
      const t = esc(code.slice(i, j));
      out += v ? `<span class="${v === 2 ? "sq-e" : "sq-w"}">${t}</span>` : t;
      i = j;
    }
    sq.innerHTML = out + "\n ";
  }

  function renderGutter(code) {
    const n = code.split("\n").length;
    const marks = new Map();
    for (const d of diags) {
      if (!d.line) continue;
      const cur = marks.get(d.line);
      if (!cur || (cur.severity !== "error" && d.severity === "error")) marks.set(d.line, d);
    }
    let html = "";
    for (let i = 1; i <= n; i++) {
      const m = marks.get(i);
      html += m ? `<span class="${m.severity === "error" ? "e" : "w"}" title="${esc(m.message || "").replace(/"/g, "&quot;")}">${i}</span>` : String(i);
      if (i < n) html += "\n";
    }
    gutterIn.innerHTML = html;
  }

  function render() {
    const code = ta.value;
    hl.innerHTML = highlightCSharp(code) + "\n ";
    renderSquiggles(code);
    renderGutter(code);
    sync();
  }

  function sync() {
    const t = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
    hl.style.transform = t;
    sq.style.transform = t;
    gutterIn.style.transform = `translateY(${-ta.scrollTop}px)`;
  }

  function changed() {
    render();
    opts.onChange && opts.onChange(ta.value);
  }

  // 글자 넣기: 실행 취소(Ctrl+Z)가 되도록 execCommand 를 먼저 시도
  function insert(text, back = 0, replaceFrom, replaceTo) {
    ta.focus();
    if (replaceFrom !== undefined) ta.setSelectionRange(replaceFrom, replaceTo);
    const ok = document.execCommand && document.execCommand("insertText", false, text);
    if (!ok) {
      const { selectionStart: s, selectionEnd: e } = ta;
      ta.setRangeText(text, s, e, "end");
      changed();
    }
    if (back) { const p = ta.selectionStart - back; ta.setSelectionRange(p, p); }
  }

  ta.addEventListener("input", changed);
  ta.addEventListener("scroll", sync);
  ta.addEventListener("keydown", (e) => {
    const { selectionStart: s, selectionEnd: en, value } = ta;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      opts.onRun && opts.onRun();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const ls = value.lastIndexOf("\n", s - 1) + 1;
      if (e.shiftKey || s !== en) {
        // 여러 줄 들여쓰기 / 내어쓰기
        const le = value.indexOf("\n", Math.max(s, en - 1));
        const end = le < 0 ? value.length : le;
        const block = value.slice(ls, end);
        const lines = block.split("\n");
        const out = lines.map((l) => (e.shiftKey ? l.replace(/^ {1,4}|^\t/, "") : "    " + l)).join("\n");
        insert(out, 0, ls, end);
        ta.setSelectionRange(ls, ls + out.length);
      } else {
        insert("    ");
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const ls = value.lastIndexOf("\n", s - 1) + 1;
      const before = value.slice(ls, s);
      const indent = (before.match(/^[ \t]*/) || [""])[0];
      const opens = /\{\s*$/.test(before);
      if (opens && value[en] === "}") {
        insert("\n" + indent + "    " + "\n" + indent, indent.length + 1);
      } else {
        insert("\n" + indent + (opens ? "    " : ""));
      }
      return;
    }
    if (e.key === "}" && s === en) {
      // 빈 줄에서 } 를 치면 한 단계 내어쓰기
      const ls = value.lastIndexOf("\n", s - 1) + 1;
      const before = value.slice(ls, s);
      if (/^ {4,}$/.test(before)) {
        e.preventDefault();
        insert(before.slice(4) + "}", 0, ls, s);
      }
    }
  });

  const api = {
    textarea: ta,
    el: host,
    get value() { return ta.value; },
    set value(v) { ta.value = v; ta.scrollTop = 0; ta.scrollLeft = 0; diags = []; render(); },
    setDiagnostics(list) { diags = (list || []).filter((d) => d && d.line > 0); render(); },
    get diagnostics() { return diags; },
    insert,
    focus() { ta.focus(); },
    refresh: render,
    selectLine(line) {
      const lines = ta.value.split("\n");
      if (line < 1 || line > lines.length) return;
      let start = 0;
      for (let i = 0; i < line - 1; i++) start += lines[i].length + 1;
      ta.focus();
      ta.setSelectionRange(start, start + lines[line - 1].length);
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 21;
      ta.scrollTop = Math.max(0, (line - 3) * lh);
      sync();
    },
  };
  ta.value = opts.value || "";
  render();
  return api;
}
