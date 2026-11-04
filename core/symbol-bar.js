// 폰에서 C# 기호를 쉽게 넣는 칩 줄. 칩을 눌러도 키보드가 내려가지 않는다(포커스 유지).
//
//   import { createSymbolBar } from "/csharp-lab/core/symbol-bar.js";
//   createSymbolBar(document.getElementById("bar"), editor);   // editor = createCodeEditor(...) 결과 (또는 { textarea, insert })
//
// 짝 기호는 커서를 가운데에 두고, 글자를 선택한 상태면 선택한 글자를 감싼다.
// 보이는 조건은 CSS 로: 기본은 터치 기기·좁은 화면에서만 (옵션 always:true 면 항상).

const CSS = `
.csb{display:flex;gap:6px;overflow-x:auto;padding:8px 10px;background:var(--csb-bg,#1a1622);border-top:1px solid var(--csb-line,#352e45);scrollbar-width:none;-webkit-overflow-scrolling:touch}
.csb::-webkit-scrollbar{display:none}
.csb button{flex:none;min-width:40px;height:38px;padding:0 10px;border-radius:9px;border:1px solid var(--csb-line,#3a3249);background:var(--csb-chip,#262132);color:var(--csb-text,#ece8f4);font:600 15px/1 var(--cse-font,"D2Coding",Consolas,ui-monospace,monospace);touch-action:manipulation;-webkit-user-select:none;user-select:none;cursor:pointer}
.csb button:active{background:#3a2f52}
.csb button.wide{font-family:inherit;font-size:13px;font-weight:600}
@media (hover:hover) and (pointer:fine){.csb:not(.always){display:none}}
`;

let cssInjected = false;

export const DEFAULT_SYMBOLS = [
  { label: ";", text: ";" },
  { label: "{ }", open: "{", close: "}" },
  { label: "( )", open: "(", close: ")" },
  { label: '" "', open: '"', close: '"' },
  { label: "[ ]", open: "[", close: "]" },
  { label: "< >", open: "<", close: ">" },
  { label: "=", text: " = " },
  { label: "==", text: " == " },
  { label: "=>", text: " => " },
  { label: ".", text: "." },
  { label: ",", text: ", " },
  { label: '$"{}"', text: '$"{}"', back: 2 },
  { label: "+", text: " + " },
  { label: "++", text: "++" },
  { label: "&&", text: " && " },
  { label: "||", text: " || " },
  { label: "!", text: "!" },
  { label: "'", open: "'", close: "'" },
  { label: "Tab", text: "    ", cls: "wide" },
  { label: "◀", move: -1 },
  { label: "▶", move: 1 },
];

export function createSymbolBar(container, editor, opts = {}) {
  if (!cssInjected) {
    cssInjected = true;
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const ta = editor.textarea || editor;
  const insert = editor.insert
    ? (text, back) => editor.insert(text, back)
    : (text, back = 0) => {
        ta.focus();
        if (!document.execCommand("insertText", false, text)) {
          ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
          ta.dispatchEvent(new Event("input"));
        }
        if (back) { const p = ta.selectionStart - back; ta.setSelectionRange(p, p); }
      };

  container.classList.add("csb");
  if (opts.always) container.classList.add("always");
  container.setAttribute("role", "toolbar");
  container.setAttribute("aria-label", "기호 넣기");
  container.innerHTML = "";

  for (const item of opts.symbols || DEFAULT_SYMBOLS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = item.label;
    b.setAttribute("aria-label", item.label === "◀" ? "커서 왼쪽" : item.label === "▶" ? "커서 오른쪽" : item.label + " 넣기");
    if (item.cls) b.className = item.cls;
    // pointerdown 에서 기본 동작을 막아야 textarea 포커스(=폰 키보드)가 유지된다
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      if (item.move) {
        ta.focus();
        const p = Math.max(0, Math.min(ta.value.length, ta.selectionStart + item.move));
        ta.setSelectionRange(p, p);
        return;
      }
      if (item.open) {
        const { selectionStart: s, selectionEnd: e } = ta;
        if (s !== e) {
          const sel = ta.value.slice(s, e);
          insert(item.open + sel + item.close);
        } else {
          insert(item.open + item.close, item.close.length);
        }
        return;
      }
      insert(item.text, item.back || 0);
    });
    container.appendChild(b);
  }
  return { el: container };
}
