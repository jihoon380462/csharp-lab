// 채점 실험: 학습자 파일 + 숨은 채점 파일을 함께 컴파일하고, 테스트마다 실행해 출력을 비교한다 (engine.grade).
import { bootEngine, esc } from "../shared/boot.js";
import { createCodeEditor } from "../../core/code-editor.js";
import { createSymbolBar } from "../../core/symbol-bar.js";

const PROBLEMS = [
  {
    id: "add",
    label: "두 수 더하기 (메서드)",
    desc: "<code>Solution.Add(a, b)</code> 가 두 수를 더한 값을 <b>돌려주게</b> 만드세요. 출력은 채점 코드가 합니다.",
    file: "Solution.cs",
    starter: `public static class Solution
{
    // a 와 b 를 더한 값을 돌려주세요
    public static int Add(int a, int b)
    {
        return 0;
    }
}`,
    answer: `public static class Solution
{
    // a 와 b 를 더한 값을 돌려주세요
    public static int Add(int a, int b)
    {
        return a + b;
    }
}`,
    harness: `var p = Console.ReadLine().Split(' ');
Console.WriteLine(Solution.Add(int.Parse(p[0]), int.Parse(p[1])));`,
    tests: [
      { stdin: "1 2", expect: "3" },
      { stdin: "10 -4", expect: "6" },
      { stdin: "0 0", expect: "0" },
      { stdin: "-5 -5", expect: "-10", hidden: true },
    ],
  },
  {
    id: "evens",
    label: "짝수만 고르기 (List)",
    desc: "<code>Solution.Evens(xs)</code> 가 리스트에서 <b>짝수만 순서대로</b> 담은 새 리스트를 돌려주게 만드세요.",
    file: "Solution.cs",
    starter: `public static class Solution
{
    // 짝수만 골라 순서대로 돌려주세요
    public static List<int> Evens(List<int> xs)
    {
        var result = new List<int>();

        return result;
    }
}`,
    answer: `public static class Solution
{
    // 짝수만 골라 순서대로 돌려주세요
    public static List<int> Evens(List<int> xs)
    {
        var result = new List<int>();
        foreach (var x in xs)
        {
            if (x % 2 == 0) result.Add(x);
        }
        return result;
    }
}`,
    harness: `var xs = Console.ReadLine().Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(int.Parse).ToList();
Console.WriteLine(string.Join(",", Solution.Evens(xs)));`,
    tests: [
      { stdin: "1 2 3 4", expect: "2,4" },
      { stdin: "5 7 9", expect: "" },
      { stdin: "0 -2 3", expect: "0,-2" },
      { stdin: "8 8 1", expect: "8,8", hidden: true },
    ],
  },
  {
    id: "io",
    label: "이름과 나이 (입출력)",
    desc: "이름과 나이를 한 줄씩 읽어 <code>민수님은 내년에 13살</code> 처럼 출력하세요. (프로그램 전체를 씁니다 — 채점 코드 없음)",
    file: "Program.cs",
    starter: `string name = Console.ReadLine();
int age = int.Parse(Console.ReadLine());

// 여기에 출력 코드를 쓰세요
`,
    answer: `string name = Console.ReadLine();
int age = int.Parse(Console.ReadLine());

// 여기에 출력 코드를 쓰세요
Console.WriteLine($"{name}님은 내년에 {age + 1}살");`,
    harness: null,
    tests: [
      { stdin: "민수\n12", expect: "민수님은 내년에 13살" },
      { stdin: "지아\n7", expect: "지아님은 내년에 8살" },
      { stdin: "하준\n99", expect: "하준님은 내년에 100살", hidden: true },
    ],
  },
];

const $ = (id) => document.getElementById(id);
const lab = (window.__lab = window.__lab || {});
let current = PROBLEMS[0];
let grading = false;

const editor = (lab.editor = createCodeEditor($("editorHost"), { id: "code", gutterId: "gutter", onRun: () => grade(), onChange: () => scheduleCheck() }));
createSymbolBar($("symbar"), editor);

const engine = bootEngine({
  onReady() { if (!grading) setBtn("grade"); scheduleCheck(); },
  onState(s) { if (s === "restarting" && !grading) setBtn("wait"); },
});

function setBtn(mode) {
  const b = $("gradeBtn");
  b.disabled = mode === "wait";
  b.classList.toggle("stop", mode === "stop");
  b.querySelector(".run-icon").textContent = mode === "stop" ? "■" : "▶";
  $("gradeLabel").textContent = mode === "stop" ? "중지" : mode === "wait" ? "엔진 준비 중…" : "채점";
}

const files = () => {
  const list = [{ name: current.file, code: editor.value }];
  if (current.harness) list.push({ name: "Tests.cs", code: current.harness });
  return list;
};

// ── 실시간 검사 (학습자 파일만 밑줄) ──
let timer = 0, seq = 0;
function scheduleCheck() {
  clearTimeout(timer);
  editor.setDiagnostics([]);
  $("liveCheck").innerHTML = "";
  timer = setTimeout(async () => {
    if (!lab.ready) return;
    const code = editor.value, my = ++seq;
    const r = await engine.check(files());
    if (my !== seq || code !== editor.value || r.stopped) return;
    const ds = (r.diagnostics || []).filter((d) => d.file === current.file);
    editor.setDiagnostics(ds);
    const errs = ds.filter((d) => d.severity === "error");
    const other = (r.diagnostics || []).filter((d) => d.severity === "error" && d.file !== current.file);
    $("liveCheck").innerHTML = errs.length
      ? `<span class="e">오류 ${errs.length}개</span> ${errs[0].line}번째 줄: ${esc(errs[0].message)}`
      : other.length ? `<span class="w">채점 코드와 맞지 않음</span> ${esc(other[0].message)}`
      : `<span class="okc">✓ 문법 오류 없음</span>`;
  }, 450);
}

function loadProblem(p) {
  current = p;
  $("problems").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.id === p.id));
  $("desc").innerHTML = p.desc;
  $("fileName").textContent = p.file;
  $("harness").textContent = p.harness || "(없음 — 프로그램 전체를 학습자가 씁니다)";
  editor.value = p.starter;
  $("output").innerHTML = `<p class="placeholder">▶ 채점을 누르면 테스트 ${p.tests.length}개의 결과가 나옵니다.</p>`;
  $("status").textContent = "";
  scheduleCheck();
}

for (const p of PROBLEMS) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = p.label;
  b.dataset.id = p.id;
  b.addEventListener("click", () => loadProblem(p));
  $("problems").appendChild(b);
}

async function grade() {
  if (grading) { engine.stop(); return; }
  if (!lab.ready) return;
  grading = true;
  setBtn("stop");
  $("status").textContent = "채점 중…";
  $("status").className = "status busy";
  const r = await engine.grade(files(), current.tests.map(({ stdin, expect }) => ({ stdin, expect })));
  lab.lastGrade = r;
  grading = false;
  setBtn(lab.ready ? "grade" : "wait");
  render(r);
  if (window.matchMedia("(max-width: 899px)").matches) document.querySelector(".out-panel").scrollIntoView({ behavior: "smooth" });
}

function render(r) {
  const out = $("output");
  if (r.status === "stopped-by-user") {
    out.innerHTML = `<div class="box warn"><b>채점 중지</b><p>엔진을 다시 준비합니다.</p></div>`;
    $("status").textContent = "중지됨"; $("status").className = "status warn";
    return;
  }
  if (r.status === "compile-error") {
    const errs = r.diagnostics.filter((d) => d.severity === "error");
    editor.setDiagnostics(r.diagnostics.filter((d) => d.file === current.file));
    out.innerHTML = `<div class="box error"><b>컴파일 오류 ${errs.length}개</b><ul>` +
      errs.map((d) => `<li><small>${esc(d.file)}</small> ${d.line}번째 줄 ${esc(d.message)} <small>${d.id}</small></li>`).join("") + `</ul></div>`;
    $("status").textContent = "컴파일 오류"; $("status").className = "status bad";
    return;
  }
  if (r.status !== "ok") {
    out.innerHTML = `<div class="box error"><b>엔진 오류</b><p class="raw">${esc(JSON.stringify(r.error))}</p></div>`;
    return;
  }
  const all = r.passed === r.total;
  let html = `<div class="summary ${all ? "all" : "some"}"><b>${r.passed} / ${r.total}</b><span>통과 · 컴파일 ${r.compileMs}ms · 전체 ${r.totalMs}ms</span></div>`;
  html += `<table class="tests"><thead><tr><th>#</th><th>입력</th><th>기대</th><th>실제</th><th></th></tr></thead><tbody>`;
  r.tests.forEach((t, i) => {
    const spec = current.tests[i];
    const res = t.passed === true ? `<span class="pass">✓</span>` : t.passed === false ? `<span class="fail">✗</span>` : `<span class="na">-</span>`;
    const actual = t.status === "ok" ? `<pre>${esc(t.stdout.replace(/\n$/, "")) || "<span class=na>(없음)</span>"}</pre>`
      : `<span class="fail">${t.status === "stopped" ? "중단" : "실행 오류"}</span> ${esc(t.error ? t.error.friendly : "")}`;
    if (spec.hidden) {
      html += `<tr><td>${i + 1}</td><td colspan="3" class="hidden">숨은 테스트${t.passed === false ? " — 입력을 보여주지 않아요. 경계값(음수·0·같은 값)을 생각해 보세요" : ""}</td><td>${res}</td></tr>`;
    } else {
      html += `<tr><td>${i + 1}</td><td><pre>${esc(spec.stdin)}</pre></td><td><pre>${esc(spec.expect) || "<span class=na>(빈 줄)</span>"}</pre></td><td>${actual}</td><td>${res}</td></tr>`;
    }
  });
  html += `</tbody></table>`;
  out.innerHTML = html;
  $("status").textContent = all ? "전부 통과" : "일부 실패";
  $("status").className = "status " + (all ? "ok" : "warn");
}

$("gradeBtn").addEventListener("click", grade);
$("answerBtn").addEventListener("click", () => { editor.value = current.answer; scheduleCheck(); });
$("resetBtn").addEventListener("click", () => loadProblem(current));
loadProblem(PROBLEMS[0]);
setBtn("wait");
