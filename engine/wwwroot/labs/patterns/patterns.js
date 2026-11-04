// 디자인 패턴 실험: 패턴 고르기 → 코드 편집 → (입력 중) 구조 분석으로 다이어그램·구조 체크 갱신 → 실행 / 채점(출력 + 구조)
import { bootEngine, esc } from "../shared/boot.js";
import { createCodeEditor } from "../../core/code-editor.js";
import { createSymbolBar } from "../../core/symbol-bar.js";
import { renderClassDiagram, classDiagramLegend } from "../../core/class-diagram.js";

const $ = (id) => document.getElementById(id);
const lab = (window.__lab = window.__lab || {});

const FREE = {
  id: "free", cat: "자유", name: "직접 그려보기", en: "Playground",
  when: "아무 클래스나 써 보세요. 다이어그램이 바로 그려집니다.",
  idea: "interface · abstract class · 상속(:) · 필드 · new 가 선으로 나타나요.",
  code: `new Zoo().Concert();   // 최상위 문장은 클래스보다 위에

interface IAnimal { string Sound(); }

abstract class Animal : IAnimal
{
    public string Name { get; }
    protected Animal(string name) { Name = name; }
    public abstract string Sound();
}

class Dog : Animal
{
    public Dog() : base("멍멍이") { }
    public override string Sound() => "멍";
}

class Zoo
{
    readonly List<IAnimal> _animals = new() { new Dog() };
    public void Concert() { foreach (var a in _animals) Console.WriteLine(a.Sound()); }
}
`,
  expect: null,
  rules: [],
};

let patterns = [FREE];
let current = FREE;
let running = false;

const editor = (lab.editor = createCodeEditor($("editorHost"), { id: "code", gutterId: "gutter", onRun: () => run(), onChange: () => scheduleAnalyze() }));
createSymbolBar($("symbar"), editor);
$("legend").innerHTML = classDiagramLegend();

const engine = bootEngine({
  onReady() { if (!running) setBtn("run"); $("gradeBtn").disabled = false; scheduleAnalyze(0); },
  onState(s) { if (s === "restarting" && !running) { setBtn("wait"); $("gradeBtn").disabled = true; } },
  onOutput(chunk) { if (running) { liveText += chunk; const pre = $("output").querySelector(".stdout.live"); if (pre) pre.textContent = liveText; } },
});
let liveText = "";

function setBtn(mode) {
  const b = $("runBtn");
  b.disabled = mode === "wait";
  b.classList.toggle("stop", mode === "stop");
  b.querySelector(".run-icon").textContent = mode === "stop" ? "■" : "▶";
  $("runLabel").textContent = mode === "stop" ? "중지" : mode === "wait" ? "엔진 준비 중…" : "실행";
}
const setStatus = (id, t, cls) => { $(id).textContent = t; $(id).className = "status " + (cls || ""); };

// ── 구조 분석: 입력이 멈추고 0.5초 뒤 ──
let timer = 0, seq = 0;
function scheduleAnalyze(delay = 500) {
  clearTimeout(timer);
  editor.setDiagnostics([]);
  $("liveCheck").innerHTML = "";
  timer = setTimeout(analyze, delay);
}

async function analyze() {
  if (!lab.ready) return;
  const code = editor.value, my = ++seq;
  const r = await engine.analyze(code, current.rules);
  if (my !== seq || code !== editor.value || r.stopped || r.notReady) return;
  lab.lastAnalyze = r;
  // 오류 밑줄
  const ds = (r.diagnostics || []).filter((d) => !d.file || d.file === "Program.cs");
  editor.setDiagnostics(ds);
  const errs = ds.filter((d) => d.severity === "error");
  $("liveCheck").innerHTML = errs.length
    ? `<span class="e">오류 ${errs.length}개</span> ${errs[0].line ? errs[0].line + "번째 줄: " : ""}${esc(errs[0].message)}`
    : `<span class="okc">✓ 문법 오류 없음</span> <span class="w" style="color:var(--muted)">· 분석 ${r.ms}ms</span>`;
  // 다이어그램
  const d = renderClassDiagram($("diagram"), r, { onSelect: (t) => editor.selectLine(t.line) });
  lab.lastDiagram = d;
  setStatus("anaStatus", `타입 ${r.types.length} · 관계 ${r.relations.length}`, "");
  renderRules(r);
}

function renderRules(r) {
  const ul = $("rules");
  if (!current.rules.length) {
    ul.innerHTML = `<li class="none">이 칸에는 구조 체크가 없어요. 패턴을 고르면 그 패턴의 핵심 구조를 검사합니다.</li>`;
    setStatus("ruleStatus", "", "");
    return;
  }
  ul.innerHTML = r.rules.map((x) => `<li class="${x.passed ? "ok" : "no"}"><span class="mark">${x.passed ? "✓" : "✗"}</span><span>${esc(x.text)}</span><span class="detail">${esc(x.detail)}</span></li>`).join("");
  const all = r.rulesPassed === r.rulesTotal;
  setStatus("ruleStatus", `${r.rulesPassed} / ${r.rulesTotal}`, all ? "ok" : "warn");
}

// ── 실행 ──
async function run() {
  if (running) { engine.stop(); return; }
  if (!lab.ready) return;
  running = true;
  liveText = "";
  $("output").innerHTML = `<pre class="stdout live"></pre>`;
  setBtn("stop");
  setStatus("status", "실행 중…", "busy");
  const r = await engine.run(editor.value, "");
  lab.lastResult = r;
  running = false;
  setBtn(lab.ready ? "run" : "wait");
  showRun(r);
}

function showRun(r, verdict = "") {
  let html = verdict;
  if (r.stdout) html += `<pre class="stdout">${esc(r.stdout)}</pre>`;
  if (r.status === "compile-error") {
    const errs = r.diagnostics.filter((d) => d.severity === "error");
    html += `<div class="box error"><b>컴파일 오류 ${errs.length}개</b><ul>${errs.map((d) => `<li>${d.line ? d.line + "번째 줄 " : ""}${esc(d.message)} <small>${d.id}</small></li>`).join("")}</ul></div>`;
  } else if (r.error) {
    html += `<div class="box ${r.status === "stopped" ? "warn" : "error"}"><b>${r.status === "stopped" ? "실행 중단" : "실행 중 오류"}</b><p>${r.error.line ? r.error.line + "번째 줄: " : ""}${esc(r.error.friendly)}</p></div>`;
  } else if (r.status === "stopped-by-user") {
    html += `<div class="box warn"><b>실행 중지</b></div>`;
  }
  if (!html) html = `<p class="placeholder">(출력 없음)</p>`;
  $("output").innerHTML = html;
  const label = { ok: ["성공", "ok"], "compile-error": ["컴파일 오류", "bad"], "runtime-error": ["실행 오류", "bad"], stopped: ["중단됨", "warn"], "stopped-by-user": ["중지함", "warn"] }[r.status] || [r.status, ""];
  setStatus("status", label[0], label[1]);
}

// ── 채점: 출력(기대값과 비교) + 구조 체크 ──
async function grade() {
  if (!lab.ready || running) return;
  setStatus("status", "채점 중…", "busy");
  const files = [{ name: "Program.cs", code: editor.value }];
  const [g, a] = await Promise.all([
    engine.grade(files, [{ stdin: "", expect: current.expect }]),
    engine.analyze(files, current.rules),
  ]);
  lab.lastGrade = { grade: g, analyze: a };
  renderRules(a);
  const t = g.tests && g.tests[0];
  const outOk = current.expect === null ? null : !!(t && t.passed);
  const structOk = current.rules.length ? a.rulesPassed === a.rulesTotal : null;
  let v = `<div class="verdict">`;
  if (outOk !== null) v += `<span class="${outOk ? "ok" : "no"}">출력 ${outOk ? "✓ 맞음" : "✗ 다름"}</span>`;
  if (structOk !== null) v += `<span class="${structOk ? "ok" : "no"}">구조 ${a.rulesPassed}/${a.rulesTotal}</span>`;
  v += `</div>`;
  if (outOk === false && t && t.status === "ok") v += `<p class="note">기대한 출력:</p><pre class="stdout">${esc(current.expect)}</pre><p class="note">실제 출력:</p>`;
  const r = g.status === "ok" && t ? { status: t.status, stdout: t.stdout, error: t.error, diagnostics: [] } : { status: g.status, stdout: "", error: g.error, diagnostics: g.diagnostics || [] };
  showRun(r, v);
  const pass = (outOk !== false) && (structOk !== false) && g.status === "ok";
  setStatus("status", pass ? "통과" : "아직", pass ? "ok" : "warn");
  if (window.matchMedia("(max-width: 899px)").matches) $("rules").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── 패턴 고르기 ──
function load(p) {
  current = p;
  lab.current = p.id;
  $("patternSel").value = p.id;
  $("info").innerHTML = `<h2>${esc(p.name)} <small>${esc(p.en)}</small> <span class="cat">${esc(p.cat)}</span></h2>` +
    `<p><b>언제?</b> ${esc(p.when)}</p><p><b>핵심</b> ${esc(p.idea)}</p>`;
  editor.value = p.code;
  $("output").innerHTML = `<p class="placeholder">▶ 실행하면 결과가, ✓ 채점하면 출력+구조 판정이 나옵니다.</p>`;
  setStatus("status", "", "");
  $("rules").innerHTML = "";
  scheduleAnalyze(0);
}

function buildPicker() {
  const sel = $("patternSel");
  const groups = new Map();
  for (const p of patterns) (groups.get(p.cat) || groups.set(p.cat, []).get(p.cat)).push(p);
  sel.innerHTML = [...groups].map(([cat, list]) =>
    `<optgroup label="${esc(cat)}">${list.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.en)})</option>`).join("")}</optgroup>`).join("");
  sel.addEventListener("change", () => load(patterns.find((p) => p.id === sel.value)));
  const step = (d) => { const i = patterns.indexOf(current); load(patterns[(i + d + patterns.length) % patterns.length]); };
  $("prevBtn").addEventListener("click", () => step(-1));
  $("nextBtn").addEventListener("click", () => step(1));
}

$("runBtn").addEventListener("click", run);
$("gradeBtn").addEventListener("click", grade);
$("resetBtn").addEventListener("click", () => load(current));
setBtn("wait");

fetch("patterns.json").then((r) => r.json()).then((list) => {
  patterns = [FREE, ...list];
  lab.patterns = patterns;
  buildPicker();
  const want = new URLSearchParams(location.search).get("p");
  load(patterns.find((p) => p.id === want) || patterns[1]);
}).catch((e) => { buildPicker(); load(FREE); $("info").innerHTML += `<p class="note">패턴 목록을 못 불러왔어요: ${esc(e)}</p>`; });
