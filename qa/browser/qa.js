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
  return { p, soft };
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
    await page.close();
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

    await page.send("Page.reload", {});
    await sleep(300);
    const st2 = await page.waitFor(readyState, 900000, 300);
    report.timings.mobileRevisit = st2;
    console.log("모바일 재방문 (캐시):", JSON.stringify(st2));
    await page.close();
  }

  mark(errors.length === 0, "콘솔 오류 없음", errors.join(" | ").slice(0, 1500));
  console.log(`\n케이스 ${report.cases.filter((c) => c.ok).length}/${report.cases.length}, 예제 ${report.examples.filter((e) => e.ok).length}/${report.examples.length}, 실패 합계 ${fails}`);
  fs.writeFileSync(`${SHOTS}/report.json`, JSON.stringify(report, null, 2));
  if (srv) srv.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("QA 스크립트 오류:", e); process.exit(3); });
