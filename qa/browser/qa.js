// 브라우저 QA: 헤드리스 크롬(CDP)으로 실험실 페이지를 열고 케이스·예제·편집기·중지·레이아웃·로딩 시간을 검사
//
//   node qa/browser/qa.js <serve 폴더> [cases.json] [스크린샷 폴더] [all|quick|mobile]
//
//   <serve 폴더> : 그 안에 csharp-lab/ 폴더(= build-output 브랜치 내용)가 있는 곳. tools/fetch-build.sh 가 만들어 준다.
//                  http(s) 주소를 주면 그 주소를 그대로 연다(로컬 서버 없이).
//   quick  = PC 화면만, mobile = 휴대폰 화면만, all = 둘 다
//   종료 코드 0 = 전부 통과. 결과 요약은 <스크린샷 폴더>/report.json
//
// 필요: Node 22 이상(내장 WebSocket), 크롬(/usr/bin/google-chrome 또는 CHROME 환경변수). npm 패키지 없음.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { launch, sleep } = require("./cdp");

const ROOT = process.argv[2];
const CASES = process.argv[3] || path.join(__dirname, "..", "cases.json");
const SHOTS = process.argv[4] || fs.mkdtempSync(path.join(os.tmpdir(), "lab-shots-"));
const MODE = process.argv[5] || "all";
if (!ROOT) { console.error("사용법: node qa/browser/qa.js <serve 폴더|URL> [cases.json] [스크린샷 폴더] [all|quick|mobile]"); process.exit(64); }
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".gz": "application/gzip", ".txt": "text/plain; charset=utf-8" };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, resp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
      const file = p.endsWith("/") ? path.join(p, "index.html") : p;
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { resp.writeHead(404); resp.end(); return; }
        const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
        if (req.headers["if-none-match"] === etag) { resp.writeHead(304, { etag }); resp.end(); return; }
        resp.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", etag, "cache-control": "max-age=600", "content-length": st.size });
        fs.createReadStream(file).pipe(resp);
      });
    });
    srv.listen(0, "127.0.0.1", () => res(srv));
  });
}

const readyState = () => window.__lab && ((window.__lab.ready && window.__lab.warm) || window.__lab.failed) &&
  ({ ready: __lab.ready, failed: __lab.failed || null, loadMs: Math.round(__lab.loadMs), warmMs: Math.round(__lab.warmMs), MB: +(__lab.bytes / 1048576).toFixed(2), enc: __lab.enc });

async function runCode(page, code, stdin) {
  await page.eval((code, stdin) => {
    const t = document.getElementById("code");
    t.value = code; t.dispatchEvent(new Event("input"));
    document.getElementById("stdin").value = stdin || "";
    window.__lab.lastResult = null;
    document.getElementById("runBtn").click();
  }, code, stdin || "");
  return page.waitFor(() => window.__lab.lastResult && !document.getElementById("runBtn").disabled && window.__lab.lastResult, 60000);
}

function check(e, r) {
  const p = [], soft = [];
  if (e.status && e.status !== r.status) p.push(`status ${r.status} != ${e.status}`);
  const out = (r.stdout || "").replace(/\r\n/g, "\n");
  if ("stdoutEquals" in e && e.stdoutEquals !== out) p.push(`stdout ${JSON.stringify(out)} != ${JSON.stringify(e.stdoutEquals)}`);
  if (e.errorType && (r.error && r.error.type) !== e.errorType) p.push(`errorType ${r.error && r.error.type} != ${e.errorType}`);
  if (e.errorLine && (r.error && r.error.line) !== e.errorLine) soft.push(`errorLine ${r.error && r.error.line} != ${e.errorLine}`);
  if (e.diagLines) {
    const lines = [...new Set((r.diagnostics || []).filter((d) => d.severity === "error").map((d) => d.line))].sort((a, b) => a - b);
    if (JSON.stringify(lines) !== JSON.stringify(e.diagLines)) p.push(`diagLines ${JSON.stringify(lines)} != ${JSON.stringify(e.diagLines)}`);
  }
  if (e.hasWarning && !(r.diagnostics || []).some((d) => d.severity === "warning")) p.push("경고 없음");
  if (e.errorFile && (r.error && r.error.file) !== e.errorFile) p.push(`errorFile ${r.error && r.error.file} != ${e.errorFile}`);
  const errs = (r.diagnostics || []).filter((d) => d.severity === "error");
  if (e.diagFiles) {
    const files = [...new Set(errs.map((d) => d.file))].sort();
    if (JSON.stringify(files) !== JSON.stringify(e.diagFiles)) p.push(`diagFiles ${JSON.stringify(files)} != ${JSON.stringify(e.diagFiles)}`);
  }
  if (e.diagIds) for (const id of e.diagIds) if (!errs.some((d) => d.id === id)) p.push(`진단 ${id} 없음`);
  return { p, soft };
}

function checkGrade(e, r) {
  const p = [];
  if (e.status && e.status !== r.status) p.push(`status ${r.status} != ${e.status}`);
  const tests = r.tests || [];
  const norm = (v) => (v === true ? "true" : v === false ? "false" : "null");
  if (e.passed && JSON.stringify(tests.map((t) => norm(t.passed))) !== JSON.stringify(e.passed.map(norm))) p.push(`passed ${JSON.stringify(tests.map((t) => t.passed))} != ${JSON.stringify(e.passed)}`);
  if (e.stdouts && JSON.stringify(tests.map((t) => t.stdout)) !== JSON.stringify(e.stdouts)) p.push(`stdouts ${JSON.stringify(tests.map((t) => t.stdout))}`);
  if (e.testStatuses && JSON.stringify(tests.map((t) => t.status)) !== JSON.stringify(e.testStatuses)) p.push(`testStatuses ${JSON.stringify(tests.map((t) => t.status))}`);
  if (e.passedCount !== undefined && r.passed !== e.passedCount) p.push(`passedCount ${r.passed} != ${e.passedCount}`);
  const c = check({ diagLines: e.diagLines, diagFiles: e.diagFiles, diagIds: e.diagIds }, r);
  return p.concat(c.p);
}

async function newPage(errors, tag) {
  const page = await launch();
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  page.on("Runtime.exceptionThrown", (e) => errors.push(`[${tag}] ${e.exceptionDetails.exception ? e.exceptionDetails.exception.description : e.exceptionDetails.text}`));
  page.on("Runtime.consoleAPICalled", (e) => { if (e.type === "error") errors.push(`[${tag} console] ` + e.args.map((a) => a.value || a.description).join(" ")); });
  return page;
}

(async () => {
  const remote = /^https?:/.test(ROOT);
  const srv = remote ? null : await serve();
  const base = remote ? ROOT : `http://127.0.0.1:${srv.address().port}/csharp-lab/`;
  const errors = [];
  const report = { base, cases: [], examples: [], checks: [], timings: {} };
  let fails = 0;
  const mark = (ok, name, detail = "") => { if (!ok) fails++; report.checks.push({ ok, name, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };

  if (MODE !== "mobile") {
    // ── 1) PC 화면 ──
    const page = await newPage(errors, "pc");
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
    await page.send("Page.navigate", { url: base });
    await sleep(500);
    await page.screenshot(`${SHOTS}/1-pc-loading.png`);
    const st = await page.waitFor(readyState, 300000);
    report.timings.pc = st;
    console.log("PC 로딩:", JSON.stringify(st));
    if (!st.ready) { console.log("엔진 로딩 실패:", st.failed, "\n", errors.join("\n")); process.exit(2); }
    await page.screenshot(`${SHOTS}/2-pc-ready.png`);
    console.log("진단:", await page.eval(() => window.__lab.diag));

    const cases = JSON.parse(fs.readFileSync(CASES, "utf8"));
    for (const c of cases) {
      const r = await runCode(page, c.code, c.stdin);
      const { p, soft } = check(c.expect, r);
      if (c.id === "compile-error") mark((r.diagnostics || []).some((d) => /[가-힣]/.test(d.message)), "컴파일 오류 메시지 한국어", (r.diagnostics || []).map((d) => d.message).join(" / "));
      if (p.length) fails++;
      report.cases.push({ id: c.id, ok: !p.length, problems: p, soft, compileMs: r.compileMs, runMs: r.runMs });
      console.log(`${p.length ? "FAIL" : "PASS"} ${c.id} (${r.compileMs}ms/${r.runMs}ms)${p.length ? " :: " + p.join("; ") + "\n   " + JSON.stringify(r).slice(0, 700) : ""}${soft.length ? "  [참고] " + soft.join("; ") : ""}`);
    }

    const exs = await page.eval(() => window.LAB_EXAMPLES.map((e) => ({ id: e.id, kind: e.kind })));
    for (const ex of exs) {
      await page.eval((id) => { document.querySelector(`.examples button[data-id="${id}"]`).click(); window.__lab.lastResult = null; document.getElementById("runBtn").click(); }, ex.id);
      const r = await page.waitFor(() => window.__lab.lastResult && !document.getElementById("runBtn").disabled && window.__lab.lastResult, 60000);
      const ok = ex.kind === "normal" ? r.status === "ok" : ["compile-error", "runtime-error", "stopped"].includes(r.status);
      if (!ok) fails++;
      report.examples.push({ id: ex.id, status: r.status, ok });
      console.log(`${ok ? "PASS" : "FAIL"} 예제 ${ex.id}: ${r.status} ${r.error ? r.error.type + " line=" + r.error.line : ""} | ${(r.stdout || "").replace(/\n/g, "⏎").slice(0, 70)}`);
      if (["class", "input", "compile-error", "runtime-error", "infinite", "recursion"].includes(ex.id)) await page.screenshot(`${SHOTS}/3-pc-ex-${ex.id}.png`);
    }

    // 줄 버튼 → 해당 줄 선택
    await page.eval(() => { document.querySelector('.examples button[data-id="compile-error"]').click(); window.__lab.lastResult = null; document.getElementById("runBtn").click(); });
    await page.waitFor(() => window.__lab.lastResult && !document.getElementById("runBtn").disabled && document.querySelector("button.line"));
    const sel = await page.eval(() => { document.querySelector("button.line").click(); const t = document.getElementById("code"); return t.value.slice(t.selectionStart, t.selectionEnd); });
    mark(sel.startsWith("int gold"), "오류 줄 버튼 → 코드 해당 줄 선택", JSON.stringify(sel));

    // Ctrl+Enter 실행
    await page.eval(() => { document.querySelector('.examples button[data-id="hello"]').click(); window.__lab.lastResult = null; document.getElementById("code").focus(); });
    await page.key("Enter", "Enter", 13, 2);
    const ce = await page.waitFor(() => window.__lab.lastResult && window.__lab.lastResult.status, 30000).catch(() => null);
    mark(ce === "ok", "Ctrl+Enter로 실행", String(ce));

    // Tab → 공백 4칸, Enter → 들여쓰기 유지
    const tab = await page.eval(() => { const t = document.getElementById("code"); t.value = "if (true) {"; t.setSelectionRange(t.value.length, t.value.length); t.focus(); return true; });
    await page.key("Enter", "Enter", 13);
    await page.key("Tab", "Tab", 9);
    const tv = await page.eval(() => document.getElementById("code").value);
    mark(tv === "if (true) {\n        ", "Enter 자동 들여쓰기 + Tab 4칸", JSON.stringify(tv));
    const gut = await page.eval(() => document.getElementById("gutter").textContent.trim().split("\n").length);
    mark(gut === 2, "줄 번호 갱신", `${gut}줄`);

    // ■ 중지: 무한 반복 실행 → 중지 버튼 → 엔진 재시작 → 다시 실행 가능
    const st1 = await page.eval(() => {
      const t = document.getElementById("code"); t.value = "int i = 0;\nwhile (true) { i++; if (i % 5000000 == 0) Console.WriteLine(i); }";
      window.__lab.lastResult = null;
      document.getElementById("runBtn").click();
      return document.getElementById("runLabel").textContent + "/" + document.getElementById("runBtn").disabled;
    });
    mark(st1 === "중지/false", "실행 중에는 버튼이 '중지'로 바뀜", st1);
    // 실행 중 화면 반응성: 메인 스레드 타이머 지연 측정
    const lag = await page.eval(() => new Promise((res) => { let worst = 0, last = performance.now(), n = 0; const id = setInterval(() => { const now = performance.now(); worst = Math.max(worst, now - last - 50); last = now; if (++n === 20) { clearInterval(id); res(Math.round(worst)); } }, 50); }));
    mark(lag < 150, "실행 중에도 화면이 멈추지 않음 (타이머 지연)", lag + "ms");
    const liveOut = await page.eval(() => (document.querySelector(".stdout.live") || {}).textContent || "");
    mark(/5000000/.test(liveOut), "실행 중 출력이 실시간으로 보임", JSON.stringify(liveOut.slice(0, 40)));
    await page.eval(() => document.getElementById("runBtn").click());
    const stopped = await page.waitFor(() => window.__lab.lastResult && window.__lab.lastResult.status, 10000);
    mark(stopped === "stopped-by-user", "■ 중지로 즉시 멈춤", stopped);
    const t1 = Date.now();
    await page.waitFor(() => window.__lab.ready && window.__lab.state === "ready" && !document.getElementById("runBtn").disabled, 120000);
    const restartMs = Date.now() - t1;
    const again = await runCode(page, "Console.WriteLine(\"재시작 후 실행\");");
    mark(again.status === "ok" && again.stdout === "재시작 후 실행\n", "중지 후 엔진 재시작·재실행", `재시작 ${restartMs}ms, ${again.status}`);
    report.timings.restartMs = restartMs;

    // 연속 실행 스트레스: 기다리지 않고 8번 연달아 요청
    const burst = await page.eval(async () => {
      const rs = await Promise.all([...Array(8)].map((_, i) => window.__lab.engine.run(`var xs = Enumerable.Range(0, ${i + 5}).ToList(); Console.Write(xs.Sum());`, "")));
      return rs.map((r) => r.status + ":" + r.stdout).join(" ");
    });
    mark(!/internal|error/.test(burst), "연달아 8번 실행 (대기열)", burst);

    // 실시간 출력 (await 사이사이 출력이 순서대로 나오는지)
    await page.eval(() => {
      const t = document.getElementById("code"); t.value = "for (int i = 1; i <= 3; i++) { Console.WriteLine($\"단계 {i}\"); await Task.Delay(400); }";
      window.__lab.lastResult = null; document.getElementById("runBtn").click();
    });
    await new Promise((r) => setTimeout(r, 650));
    const mid = await page.eval(() => (document.querySelector(".stdout.live") || {}).textContent || "");
    const fin = await page.waitFor(() => window.__lab.lastResult, 20000);
    mark(/단계 1/.test(mid) && !/단계 3/.test(mid) && fin.stdout === "단계 1\n단계 2\n단계 3\n", "async 실행 중 단계별 출력", JSON.stringify(mid));

    // ── 엔진 API 케이스 (qa/api-cases.json: runFiles · grade · check · unity) ──
    const apiCases = JSON.parse(fs.readFileSync(path.join(path.dirname(CASES), "api-cases.json"), "utf8"));
    for (const c of apiCases) {
      const r = await page.eval(async (c) => {
        const e = window.__lab.engine;
        if (c.kind === "runFiles") return e.runFiles(c.files, c.stdin || "");
        if (c.kind === "grade") return e.grade(c.files, c.tests);
        if (c.kind === "check") return e.check(c.files, c.mode || "console");
        if (c.kind === "unity") return e.runUnity(c.code, c.options);
      }, c);
      const probs = c.kind === "grade" ? checkGrade(c.expect, r) : check(c.expect, r).p.concat(check(c.expect, r).soft.filter((x) => c.expect.errorLine && x.startsWith("errorLine")));
      if (probs.length) fails++;
      report.cases.push({ id: "api:" + c.id, ok: !probs.length, problems: probs });
      console.log(`${probs.length ? "FAIL" : "PASS"} api:${c.id}${probs.length ? " :: " + probs.join("; ") + "\n   " + JSON.stringify(r).slice(0, 600) : ""}`);
    }

    // ── 편집기: 문법 색칠 · 실시간 오류 밑줄 · 고치면 사라짐 ──
    await page.eval(() => { const ed = window.__lab.editor; ed.value = 'int x = "글자";\nConsole.WriteLine(x);'; ed.textarea.dispatchEvent(new Event("input")); });
    const sqOn = await page.waitFor(() => document.querySelector(".cse-sq .sq-e") && document.querySelector("#gutter .e") && /오류/.test(document.getElementById("liveCheck").textContent) && document.getElementById("liveCheck").textContent, 15000).catch(() => null);
    mark(!!sqOn, "입력 중 오류 밑줄·줄 번호 표시·요약", String(sqOn).slice(0, 80));
    const hl = await page.eval(() => ({ k: document.querySelectorAll(".cse-hl .t, .cse-hl .k").length, s: document.querySelectorAll(".cse-hl .s").length, f: document.querySelectorAll(".cse-hl .f").length }));
    mark(hl.k > 0 && hl.s > 0 && hl.f > 0, "문법 색칠 (키워드·문자열·메서드)", JSON.stringify(hl));
    // 겹침 정렬: 밑줄 글자 위치가 textarea 글자 위치와 같은지 (첫 줄 '"글자"' 시작 x)
    const align = await page.eval(() => {
      const sq = document.querySelector(".cse-sq .sq-e").getBoundingClientRect();
      const ta = document.getElementById("code");
      const cs = getComputedStyle(ta);
      const m = document.createElement("canvas").getContext("2d");
      m.font = cs.fontSize + " " + cs.fontFamily;
      const expectX = ta.getBoundingClientRect().left + parseFloat(cs.paddingLeft) + m.measureText('int x = ').width;
      return Math.round(Math.abs(sq.left - expectX));
    });
    mark(align <= 2, "밑줄 위치가 글자와 맞음 (겹침 정렬)", align + "px 차이");
    await page.screenshot(`${SHOTS}/9-pc-squiggle.png`);
    await page.eval(() => { const ed = window.__lab.editor; ed.value = 'int x = 3;\nConsole.WriteLine(x);'; ed.textarea.dispatchEvent(new Event("input")); });
    const sqOff = await page.waitFor(() => /문법 오류 없음/.test(document.getElementById("liveCheck").textContent) && !document.querySelector(".cse-sq .sq-e"), 15000).catch(() => false);
    mark(!!sqOff, "고치면 밑줄이 사라짐");
    const checkMs = await page.eval(() => window.__lab.lastCheck && window.__lab.lastCheck.ms);
    report.timings.checkMs = checkMs;
    mark(checkMs !== undefined && checkMs < 1500, "실시간 검사 속도", checkMs + "ms");
    // { 사이 Enter → 블록으로 펼침
    await page.eval(() => { const ed = window.__lab.editor; ed.value = "if (true) {}"; ed.textarea.focus(); ed.textarea.setSelectionRange(11, 11); });
    await page.key("Enter", "Enter", 13);
    const blk = await page.eval(() => document.getElementById("code").value);
    mark(blk === "if (true) {\n    \n}", "{} 사이 Enter → 블록 펼침", JSON.stringify(blk));
    // 헤드리스 크롬은 마우스 장치가 없어 (hover:hover) 가 거짓일 수 있음 → CSS 규칙이 맞게 적용되는지로 확인
    const bar = await page.eval(() => ({ mouse: matchMedia("(hover:hover) and (pointer:fine)").matches, display: getComputedStyle(document.getElementById("symbar")).display }));
    mark(bar.mouse ? bar.display === "none" : bar.display !== "none", "기호 칩: 마우스 기기면 숨김, 터치면 보임 (CSS 규칙)", JSON.stringify(bar));
    await page.close();

    // ── 채점 실험 페이지 ──
    {
      const gp = await newPage(errors, "grading");
      await gp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
      await gp.send("Page.navigate", { url: base + "labs/grading/" });
      await gp.waitFor(() => window.__lab && window.__lab.ready, 120000);
      const gradeOnce = async () => {
        await gp.eval(() => { window.__lab.lastGrade = null; document.getElementById("gradeBtn").click(); });
        return gp.waitFor(() => window.__lab.lastGrade, 60000);
      };
      const g0 = await gradeOnce();
      mark(g0.status === "ok" && g0.passed < g0.total, "채점: 처음 코드는 일부 실패", `${g0.passed}/${g0.total}`);
      for (const id of ["add", "evens", "io"]) {
        await gp.eval((id) => { document.querySelector(`#problems button[data-id="${id}"]`).click(); document.getElementById("answerBtn").click(); }, id);
        const g = await gradeOnce();
        mark(g.status === "ok" && g.passed === g.total, `채점: 정답 → 전부 통과 (${id})`, `${g.passed}/${g.total}, 컴파일 ${g.compileMs}ms, 전체 ${g.totalMs}ms`);
        if (id === "evens") await gp.screenshot(`${SHOTS}/10-grading-pass.png`, true);
      }
      await gp.eval(() => { const ed = window.__lab.editor; document.querySelector('#problems button[data-id="add"]').click(); ed.value = ed.value.replace("return 0;", "return 0"); ed.textarea.dispatchEvent(new Event("input")); });
      const gc = await gradeOnce();
      mark(gc.status === "compile-error" && gc.diagnostics.some((d) => d.file === "Solution.cs"), "채점: 컴파일 오류는 학습자 파일 기준", gc.status);
      await gp.close();
    }

    // ── 디자인 패턴 페이지: 패턴마다 구조 체크 전부 통과 + 다이어그램 겹침 없음 ──
    {
      const pp = await newPage(errors, "patterns");
      await pp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
      await pp.send("Page.navigate", { url: base + "labs/patterns/" });
      await pp.waitFor(() => window.__lab && window.__lab.ready && window.__lab.patterns && window.__lab.lastAnalyze, 120000);
      const ids = await pp.eval(() => window.__lab.patterns.map((p) => p.id));
      const bad = [];
      let maxMs = 0;
      for (const id of ids) {
        const res = await pp.eval(async (id) => {
          window.__lab.lastAnalyze = null;
          const sel = document.getElementById("patternSel"); sel.value = id; sel.dispatchEvent(new Event("change"));
          for (let i = 0; i < 100 && !window.__lab.lastAnalyze; i++) await new Promise((r) => setTimeout(r, 50));
          const a = window.__lab.lastAnalyze, d = window.__lab.lastDiagram;
          if (!a || !d) return { id, err: "분석 없음" };
          const bx = d.boxes;
          let overlap = 0;
          for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) {
            const p = bx[i], q = bx[j];
            if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) overlap++;
          }
          const nan = d.edges.some((e) => /NaN|undefined/.test(e.d));
          const svgBoxes = document.querySelectorAll("#diagram .box").length;
          return { id, status: a.status, types: a.types.length, boxes: bx.length, svgBoxes, overlap, nan, rules: a.rulesPassed + "/" + a.rulesTotal, allRules: a.rulesPassed === a.rulesTotal, ms: a.ms, edges: d.edges.length };
        }, id);
        maxMs = Math.max(maxMs, res.ms || 0);
        const ok = !res.err && res.status === "ok" && res.types === res.boxes && res.svgBoxes === res.boxes && res.overlap === 0 && !res.nan && res.allRules && (id === "free" || res.edges > 0);
        if (!ok) bad.push(JSON.stringify(res));
        if (["strategy", "visitor", "composite", "mediator"].includes(id)) await pp.screenshot(`${SHOTS}/15-pattern-${id}.png`, true);
      }
      mark(bad.length === 0, `패턴 ${ids.length}개: 분석 성공·구조 체크 전부 통과·다이어그램 상자 겹침 없음`, bad.join(" | ").slice(0, 900) || `분석 최대 ${maxMs}ms`);
      report.timings.analyzeMaxMs = maxMs;

      // 채점: 전략 정답 → 출력·구조 모두 통과 / if 로 바꾼 버전 → 출력은 같아도 구조 실패
      const g1 = await pp.eval(async () => {
        const sel = document.getElementById("patternSel"); sel.value = "strategy"; sel.dispatchEvent(new Event("change"));
        await new Promise((r) => setTimeout(r, 300));
        window.__lab.lastGrade = null; document.getElementById("gradeBtn").click();
        for (let i = 0; i < 200 && !window.__lab.lastGrade; i++) await new Promise((r) => setTimeout(r, 50));
        const g = window.__lab.lastGrade;
        return { out: g.grade.tests[0].passed, rules: g.analyze.rulesPassed + "/" + g.analyze.rulesTotal, text: document.getElementById("status").textContent };
      });
      mark(g1.out === true && g1.rules === "3/3" && g1.text === "통과", "패턴 채점: 정답 → 출력·구조 통과", JSON.stringify(g1));
      const ifVersion = 'var cart = new Cart();\nConsole.WriteLine(cart.Pay(10000, "percent"));\nConsole.WriteLine(cart.Pay(10000, "amount"));\n\nclass Cart\n{\n    public int Pay(int price, string kind)\n    {\n        if (kind == "percent") return price * 90 / 100;\n        return price - 1500;\n    }\n}\n';
      const g2 = await pp.eval(async (code) => {
        const ed = window.__lab.editor; ed.value = code; ed.textarea.dispatchEvent(new Event("input"));
        window.__lab.lastGrade = null; document.getElementById("gradeBtn").click();
        for (let i = 0; i < 200 && !window.__lab.lastGrade; i++) await new Promise((r) => setTimeout(r, 50));
        const g = window.__lab.lastGrade;
        return { out: g.grade.tests[0].passed, rules: g.analyze.rulesPassed + "/" + g.analyze.rulesTotal, marks: [...document.querySelectorAll("#rules li.no")].length };
      }, ifVersion);
      mark(g2.out === true && g2.rules === "0/3" && g2.marks === 3, "패턴 채점: if 버전 → 출력은 맞아도 구조 0/3", JSON.stringify(g2));
      await pp.screenshot(`${SHOTS}/16-pattern-if-version.png`, true);
      // 입력 중 다이어그램 갱신: 클래스 하나 추가 → 상자 늘어남
      const grow = await pp.eval(async () => {
        const before = document.querySelectorAll("#diagram .box").length;
        const ed = window.__lab.editor; window.__lab.lastAnalyze = null;
        ed.value = ed.value + "\nclass Coupon : IDiscountX { }\ninterface IDiscountX { }\n"; ed.textarea.dispatchEvent(new Event("input"));
        for (let i = 0; i < 100 && !window.__lab.lastAnalyze; i++) await new Promise((r) => setTimeout(r, 50));
        return { before, after: document.querySelectorAll("#diagram .box").length, edges: window.__lab.lastDiagram.edges.length };
      });
      mark(grow.after === grow.before + 2 && grow.edges >= 1, "입력하면 다이어그램이 바로 바뀜", JSON.stringify(grow));
      // 상자 누르면 그 줄로
      const sel = await pp.eval(() => {
        document.querySelector('#diagram .box[data-name="Coupon"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
        const t = document.getElementById("code"); return t.value.slice(t.selectionStart, t.selectionEnd);
      });
      mark(/class Coupon/.test(sel), "다이어그램 상자 클릭 → 코드 줄 선택", JSON.stringify(sel));
      await pp.close();
    }

    // ── Unity 시뮬레이터 페이지 ──
    {
      const up = await newPage(errors, "unity");
      await up.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
      await up.send("Page.navigate", { url: base + "labs/unity/" });
      await up.waitFor(() => window.__lab && window.__lab.ready && !document.getElementById("playBtn").disabled, 120000);
      await up.eval(() => document.getElementById("playBtn").click());
      await up.waitFor(() => (window.__lab.frames || 0) > 0, 30000);
      await sleep(1000);
      const s1 = await up.eval(() => ({ frames: window.__lab.frames || 0, n: (window.__lab.scene || []).length, x: ((window.__lab.scene || [])[0] || {}).x }));
      mark(s1.frames > 30 && s1.n === 1, "Unity: 실시간 프레임이 돈다 (오브젝트 1개)", JSON.stringify(s1));
      const startLog = await up.eval(() => document.getElementById("output").textContent);
      mark(/시작!/.test(startLog), "Unity: Start 의 Debug.Log 가 실행 중에 바로 보임", JSON.stringify(startLog.slice(0, 40)));
      // 화면 버튼 ▶ 누르고 있기 → 오른쪽으로 이동
      await up.eval(() => document.querySelector('#keypad [data-key="RightArrow"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
      await sleep(700);
      await up.eval(() => document.querySelector('#keypad [data-key="RightArrow"]').dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
      const s2 = await up.eval(() => ((window.__lab.scene || [])[0] || {}).x);
      mark(s2 > (s1.x || 0) + 1, "Unity: 화면 버튼 입력으로 이동", `x ${s1.x} → ${s2}`);
      // 캔버스 키보드 입력 (Space → Debug.Log)
      await up.eval(() => document.getElementById("stage").focus());
      await up.keyDown(" ", "Space", 32);
      await sleep(150);
      await up.keyUp(" ", "Space", 32);
      await sleep(300);
      const log1 = await up.eval(() => document.getElementById("output").textContent);
      mark(/지금 위치/.test(log1), "Unity: 키보드 입력 + Debug.Log 실시간 출력", JSON.stringify(log1.slice(-60)));
      await up.screenshot(`${SHOTS}/11-unity-pc.png`);
      await up.eval(() => document.getElementById("playBtn").click());
      const st = await up.waitFor(() => window.__lab.lastResult && window.__lab.lastResult.status, 10000);
      mark(st === "stopped-by-user", "Unity: ■ 중지", st);
      // 총알 예제: Space 두 번 → 오브젝트 늘었다가 사라짐
      await up.waitFor(() => window.__lab.ready && !document.getElementById("playBtn").disabled, 60000);
      await up.eval(() => { document.querySelector('#examples button[data-id="shoot"]').click(); window.__lab.lastResult = null; document.getElementById("playBtn").click(); });
      await up.waitFor(() => (window.__lab.scene || []).some((o) => o.name === "Ship"), 30000);
      await sleep(300);
      await up.eval(() => { const b = document.querySelector('#keypad [data-key="Space"]'); b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });
      await sleep(150);
      await up.eval(() => { const b = document.querySelector('#keypad [data-key="Space"]'); b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); });
      const n2 = await up.waitFor(() => (window.__lab.scene || []).length >= 2 && window.__lab.scene.length, 3000).catch(() => 0);
      await sleep(1500);
      const n3 = await up.eval(() => (window.__lab.scene || []).length);
      const log2 = await up.eval(() => document.getElementById("output").textContent);
      mark(n2 >= 2 && n3 === 1 && /화면 밖으로/.test(log2), "Unity: 총알 생성(AddComponent)·삭제(Destroy)", `${n2} → ${n3}`);
      await up.eval(() => document.getElementById("playBtn").click());
      await up.waitFor(() => window.__lab.ready && !document.getElementById("playBtn").disabled, 60000);
      // ⏩ 60프레임(채점 모드) + 컴파일 오류 표시
      await up.eval(() => { document.querySelector('#examples button[data-id="move"]').click(); window.__lab.lastResult = null; document.getElementById("testBtn").click(); });
      const q = await up.waitFor(() => window.__lab.lastResult, 30000);
      mark(q.status === "ok" && /시작!/.test(q.stdout), "Unity: 60프레임 빠른 시험", q.status + " " + q.runMs + "ms");
      await up.eval(() => { const ed = window.__lab.editor; ed.value = ed.value.replace("float h", "flot h"); ed.textarea.dispatchEvent(new Event("input")); window.__lab.lastResult = null; document.getElementById("testBtn").click(); });
      const q2 = await up.waitFor(() => window.__lab.lastResult, 30000);
      mark(q2.status === "compile-error" && /오류/.test(await up.eval(() => document.getElementById("output").textContent)), "Unity: 컴파일 오류 표시", q2.status);
      // 모든 예제가 컴파일되는지 (실행 오류 없이 30프레임)
      const exRes = await up.eval(async () => {
        const out = [];
        for (const ex of window.__lab.examples) {
          const r = await window.__lab.engine.runUnity(ex.code, { live: false, frames: 30 });
          out.push(ex.id + ":" + r.status);
        }
        return out.join(" ");
      });
      mark(!/compile-error|runtime-error|internal|stopped/.test(exRes), "Unity: 예제 전부 30프레임 정상", exRes);
      // 예제 설명 줄 (패턴 예제)
      const desc = await up.eval(() => { document.querySelector('#examples button[data-id="pool"]').click(); const d = document.getElementById("exDesc"); return !d.hidden && d.textContent; });
      mark(!!desc && /오브젝트 풀/.test(desc), "Unity: 패턴 예제 설명 표시", String(desc).slice(0, 30));
      await up.screenshot(`${SHOTS}/14-unity-pattern-desc.png`);
      await up.close();
    }
  }

  if (MODE !== "quick") {
    // ── 2) 휴대폰 흉내: 390x844, CPU 4배 느림, 4G(20Mbps·지연 60ms), 캐시 없음 ──
    const page = await newPage(errors, "mobile");
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await page.send("Network.enable");
    await page.send("Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: (20 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 });
    await page.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    // 엔진은 Web Worker에서 돌기 때문에 워커에도 같은 조건(CPU·네트워크)을 건다
    report.workerThrottle = [];
    page.on("Target.attachedToTarget", async (p) => {
      const sid = p.sessionId;
      for (const [m, prm] of [["Network.enable", {}], ["Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: (20 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 }], ["Emulation.setCPUThrottlingRate", { rate: 4 }]]) {
        try { await page.send(m, prm, sid); report.workerThrottle.push(m + ":ok"); } catch (e) { report.workerThrottle.push(m + ":" + e.message.slice(0, 60)); }
      }
      try { await page.send("Runtime.runIfWaitingForDebugger", {}, sid); } catch {}
    });
    await page.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await page.send("Page.navigate", { url: base });
    await sleep(2500);
    await page.screenshot(`${SHOTS}/4-mobile-loading.png`);
    const st = await page.waitFor(readyState, 900000, 500);
    report.timings.mobileFirst = st;
    console.log("모바일 첫 방문 (4G·CPU 4배 느림):", JSON.stringify(st), "워커 조건:", report.workerThrottle.join(", "));
    await page.screenshot(`${SHOTS}/5-mobile-ready.png`, true);
    const r1 = await runCode(page, "Console.WriteLine(\"폰에서 실행\");");
    const linq = JSON.parse(fs.readFileSync(CASES, "utf8")).find((c) => c.id === "linq-collections").code;
    const r2 = await runCode(page, linq);
    report.timings.mobileRun = { hello: [r1.compileMs, r1.runMs], linq: [r2.compileMs, r2.runMs] };
    mark(r1.status === "ok" && r2.status === "ok", "모바일 실행", `hello ${r1.compileMs}+${r1.runMs}ms, LINQ ${r2.compileMs}+${r2.runMs}ms`);
    await page.eval(() => { document.querySelector('.examples button[data-id="runtime-error"]').click(); window.__lab.lastResult = null; document.getElementById("runBtn").click(); });
    await page.waitFor(() => window.__lab.lastResult && !document.getElementById("runBtn").disabled, 60000);
    await page.screenshot(`${SHOTS}/6-mobile-error.png`, true);
    const ov = await page.eval(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    mark(ov <= 0, "모바일 가로 넘침 없음", `${ov}px`);
    const runVisible = await page.eval(() => { const r = document.getElementById("runBtn").getBoundingClientRect(); return r.width > 300 && r.height >= 44; });
    mark(runVisible, "모바일 실행 버튼 크기(터치)");
    // 폰 기호 칩: 보이고, ( ) 를 누르면 () 넣고 커서는 가운데
    const chip = await page.eval(() => {
      const bar = document.getElementById("symbar");
      const vis = getComputedStyle(bar).display !== "none" && bar.getBoundingClientRect().height > 30;
      const ed = window.__lab.editor; ed.value = "Console.WriteLine"; ed.textarea.focus(); ed.textarea.setSelectionRange(17, 17);
      [...bar.querySelectorAll("button")].find((b) => b.textContent === "( )").click();
      [...bar.querySelectorAll("button")].find((b) => b.textContent === '" "').click();
      const t = ed.textarea;
      return { vis, value: t.value, caret: t.selectionStart, focused: document.activeElement === t };
    });
    mark(chip.vis && chip.value === 'Console.WriteLine("")' && chip.caret === 19, "모바일 기호 칩 (짝 기호·커서 가운데)", JSON.stringify(chip));
    await page.screenshot(`${SHOTS}/12-mobile-symbar.png`);

    await page.send("Page.reload", {});
    await sleep(300);
    const st2 = await page.waitFor(readyState, 900000, 300);
    report.timings.mobileRevisit = st2;
    console.log("모바일 재방문 (캐시):", JSON.stringify(st2));
    await page.close();

    // 모바일: 채점·Unity 페이지 화면
    for (const [name, url] of [["grading", "labs/grading/"], ["unity", "labs/unity/"], ["patterns", "labs/patterns/?p=visitor"]]) {
      const mp = await newPage(errors, "mobile-" + name);
      await mp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await mp.send("Page.navigate", { url: base + url });
      await mp.waitFor(() => window.__lab && window.__lab.ready, 120000);
      await sleep(800);
      const ov2 = await mp.eval(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      mark(ov2 <= 0, `모바일 ${name} 페이지 가로 넘침 없음`, ov2 + "px");
      await mp.screenshot(`${SHOTS}/13-mobile-${name}.png`, true);
      await mp.close();
    }
  }

  mark(errors.length === 0, "콘솔 오류 없음", errors.join(" | ").slice(0, 1500));
  console.log(`\n케이스 ${report.cases.filter((c) => c.ok).length}/${report.cases.length}, 예제 ${report.examples.filter((e) => e.ok).length}/${report.examples.length}, 실패 합계 ${fails}`);
  fs.writeFileSync(`${SHOTS}/report.json`, JSON.stringify(report, null, 2));
  if (srv) srv.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("QA 스크립트 오류:", e); process.exit(3); });
