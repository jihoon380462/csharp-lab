// C# 실험실 화면. 엔진은 core/cs-engine.js(백그라운드 Web Worker), 편집기는 core/code-editor.js, 폰 기호 칩은 core/symbol-bar.js.
import { createCsEngine } from "./core/cs-engine.js";
import { createCodeEditor } from "./core/code-editor.js";
import { createSymbolBar } from "./core/symbol-bar.js";

{
  const $ = (id) => document.getElementById(id);
  const stdinEl = $("stdin");
  const runBtn = $("runBtn"), runLabel = $("runLabel");
  const outputEl = $("output"), statusEl = $("status"), liveEl = $("liveCheck");

  const lab = (window.__lab = { ready: false, warm: false, bytes: 0, loadMs: 0, warmMs: 0, lastResult: null, restarts: 0, checks: 0, lastCheck: null });
  const t0 = performance.now();

  // ───────── 편집기 (문법 색칠·오류 밑줄·줄 번호) + 폰 기호 칩 ─────────
  const editor = (lab.editor = createCodeEditor($("editorHost"), {
    id: "code",
    gutterId: "gutter",
    onRun: () => run(),
    onChange: () => scheduleCheck(),
  }));
  const codeEl = editor.textarea;
  createSymbolBar($("symbar"), editor);
  const selectLine = (line) => editor.selectLine(line);

  // ───────── 실시간 검사: 입력이 멈추고 0.45초 뒤 진단만 받아 밑줄 표시 ─────────
  let checkTimer = 0, checkSeq = 0;
  function scheduleCheck() {
    clearTimeout(checkTimer);
    editor.setDiagnostics([]);   // 글자가 바뀌면 예전 밑줄은 위치가 어긋나므로 바로 지움
    liveEl.innerHTML = "";
    checkTimer = setTimeout(doCheck, 450);
  }
  async function doCheck() {
    if (!lab.ready) { checkTimer = setTimeout(doCheck, 500); return; }
    const code = codeEl.value;
    const my = ++checkSeq;
    const r = await engine.check(code);
    if (my !== checkSeq || code !== codeEl.value || r.stopped || r.notReady) return;   // 그사이 또 고쳤으면 버림
    lab.checks++;
    lab.lastCheck = r;
    const ds = (r.diagnostics || []).filter((d) => !d.file || d.file === "Program.cs");
    editor.setDiagnostics(ds);
    const errs = ds.filter((d) => d.severity === "error");
    const warns = ds.filter((d) => d.severity === "warning");
    if (!code.trim()) { liveEl.innerHTML = ""; return; }
    if (errs.length) {
      const d = errs[0];
      liveEl.innerHTML = `<span class="e">오류 ${errs.length}개</span>${lineBtn(d.line)}${esc(d.message)}`;
    } else if (warns.length) {
      liveEl.innerHTML = `<span class="w">경고 ${warns.length}개</span>${lineBtn(warns[0].line)}${esc(warns[0].message)}`;
    } else {
      liveEl.innerHTML = `<span class="okc">✓ 문법 오류 없음</span>`;
    }
    liveEl.querySelectorAll("button.line").forEach((b) => b.addEventListener("click", () => selectLine(+b.dataset.line)));
  }

  // ───────── 예제 ─────────
  const exWrap = $("examples");
  function loadExample(ex) {
    editor.value = ex.code;
    stdinEl.value = ex.stdin || "";
    if (ex.stdin) $("stdinBox").open = true;
    scheduleCheck();
    exWrap.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.id === ex.id));
  }
  for (const ex of window.LAB_EXAMPLES) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = ex.label;
    b.dataset.id = ex.id;
    if (ex.kind === "error") b.classList.add("err");
    b.addEventListener("click", () => loadExample(ex));
    exWrap.appendChild(b);
  }
  loadExample(window.LAB_EXAMPLES[0]);

  // ───────── 출력 ─────────
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtMs = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(1) + "초" : Math.round(ms) + "ms");
  const fmtMB = (b) => (b / 1048576).toFixed(1) + "MB";

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = "status " + (cls || "");
  }

  const lineBtn = (n) => (n > 0 ? `<button class="line" data-line="${n}">${n}번째 줄</button> ` : "");

  function render(r) {
    let html = "";
    if (r.status === "stopped-by-user") {
      if (liveText) html += `<pre class="stdout">${esc(liveText)}</pre>`;
      html += `<div class="box warn"><b>실행 중지</b><p>■ 중지 버튼으로 멈췄습니다. 엔진을 다시 준비하는 동안 잠시 기다려 주세요.</p></div>`;
      outputEl.innerHTML = html;
      $("mCompile").textContent = "-";
      $("mRun").textContent = fmtMs(r.runMs);
      setStatus("직접 중지함", "warn");
      return;
    }
    if (r.status === "compile-error") editor.setDiagnostics((r.diagnostics || []).filter((d) => !d.file || d.file === "Program.cs"));
    if (r.stdout) html += `<pre class="stdout">${esc(r.stdout)}</pre>`;
    if (r.outputTruncated) html += `<p class="note">… 출력이 너무 길어 잘렸습니다.</p>`;

    const errors = (r.diagnostics || []).filter((d) => d.severity === "error");
    const warns = (r.diagnostics || []).filter((d) => d.severity === "warning");
    if (errors.length) {
      html += `<div class="box error"><b>컴파일 오류 ${errors.length}개</b><ul>` +
        errors.map((d) => `<li>${lineBtn(d.line)}${esc(d.message)} <small>${d.id}</small></li>`).join("") +
        `</ul></div>`;
    }
    if (r.error) {
      const e = r.error;
      const cls = r.status === "stopped" ? "warn" : "error";
      const where = lineBtn(e.line || 0);
      html += `<div class="box ${cls}"><b>${r.status === "stopped" ? "실행 중단" : "실행 중 오류"}</b>` +
        `<p>${where}${esc(e.friendly)}</p>` +
        (e.message ? `<p class="raw">${esc(e.type)}: ${esc(e.message)}</p>` : "") + `</div>`;
    }
    if (warns.length) {
      html += `<details class="box warnlist"><summary>경고 ${warns.length}개</summary><ul>` +
        warns.map((d) => `<li>${lineBtn(d.line)}${esc(d.message)} <small>${d.id}</small></li>`).join("") +
        `</ul></details>`;
    }
    if (!html) html = `<p class="placeholder">(출력 없음)</p>`;
    outputEl.innerHTML = html;
    outputEl.querySelectorAll("button.line").forEach((b) => b.addEventListener("click", () => selectLine(+b.dataset.line)));

    $("mCompile").textContent = fmtMs(r.compileMs);
    $("mRun").textContent = r.status === "compile-error" ? "-" : fmtMs(r.runMs);
    const label = { ok: ["성공", "ok"], "compile-error": ["컴파일 오류", "bad"], "runtime-error": ["실행 오류", "bad"], stopped: ["중단됨", "warn"], "stopped-by-user": ["직접 중지함", "warn"], "internal-error": ["엔진 오류", "bad"] }[r.status] || [r.status, ""];
    setStatus(label[0], label[1]);
  }

  // ───────── 실행 / 중지 ─────────
  let running = false, liveText = "", livePre = null, tickTimer = 0;

  function setRunButton(mode) {
    // mode: wait(엔진 준비 중) | run | stop
    runBtn.classList.toggle("stop", mode === "stop");
    runBtn.disabled = mode === "wait";
    runBtn.querySelector(".run-icon").textContent = mode === "stop" ? "■" : "▶";
    runLabel.textContent = mode === "stop" ? "중지" : mode === "wait" ? "엔진 준비 중…" : "실행";
  }

  async function run() {
    if (running) { engine.stop(); return; }
    if (engine.state === "loading" || engine.state === "restarting" || engine.state === "failed") return;
    running = true;
    liveText = "";
    outputEl.innerHTML = `<pre class="stdout live"></pre>`;
    livePre = outputEl.firstChild;
    setRunButton("stop");
    const started = performance.now();
    const tick = () => {
      const s = (performance.now() - started) / 1000;
      setStatus(lab.warm ? `실행 중… ${s.toFixed(1)}초` : `컴파일러 예열 기다리는 중… ${s.toFixed(1)}초`, "busy");
    };
    tick();
    tickTimer = setInterval(tick, 100);
    const r = await engine.run(codeEl.value, stdinEl.value);
    clearInterval(tickTimer);
    lab.lastResult = r;
    running = false;
    livePre = null;
    render(r);
    if (engine.state === "ready") setRunButton("run"); else setRunButton("wait");
    if (window.matchMedia("(max-width: 899px)").matches) {
      document.querySelector(".out-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  runBtn.addEventListener("click", run);

  // ───────── 엔진 ─────────
  const barFill = $("barFill"), loaderPct = $("loaderPct"), loaderText = $("loaderText"), loader = $("loader");

  const engine = (lab.engine = createCsEngine({
    onProgress(p) {
      const pct = Math.floor(p.ratio * 100);
      barFill.style.width = pct + "%";
      loaderPct.textContent = pct + "%";
      loaderText.textContent = `엔진 내려받는 중… ${fmtMB(p.bytes)}`;
      lab.bytes = p.bytes;
      $("mBytes").textContent = fmtMB(p.bytes) + (p.enc ? ` (${p.enc})` : "");
    },
    onReady(info) {
      lab.loadMs = info.loadMs;
      lab.diag = info.diag;
      lab.enc = info.enc;
      lab.ready = true;
      $("ver").textContent = "v" + info.version;
      $("mLoad").textContent = fmtMs(info.loadMs);
      barFill.style.width = "100%";
      loaderPct.textContent = "100%";
      loader.classList.add("done");
      loader.classList.remove("failed");
      loaderText.textContent = lab.warm ? `준비 완료 · ${fmtMs(info.loadMs)}` : `준비 완료 · ${fmtMs(info.loadMs)} (컴파일러 예열은 뒤에서 진행)`;
      if (!running) setRunButton("run");
    },
    onWarm(ms) {
      lab.warm = true;
      lab.warmMs = ms;
      $("mWarm").textContent = fmtMs(ms);
      loaderText.textContent = `준비 완료 · 로딩 ${fmtMs(lab.loadMs)} + 예열 ${fmtMs(ms)}`;
    },
    onOutput(chunk) {
      liveText += chunk;
      if (livePre) {
        livePre.textContent = liveText.length > 20000 ? "…" + liveText.slice(-20000) : liveText;
        outputEl.scrollTop = outputEl.scrollHeight;
      }
    },
    onState(s) {
      lab.state = s;
      if (s === "restarting") {
        lab.restarts++;
        lab.ready = false;
        lab.warm = false;
        loader.classList.remove("done");
        loaderText.textContent = "엔진 다시 준비 중…";
        if (!running) setRunButton("wait");
      }
    },
    onError(msg) {
      lab.failed = msg;
      loader.classList.add("failed");
      loaderText.textContent = "엔진을 불러오지 못했습니다: " + msg;
      setRunButton("wait");
    },
  }));
  setRunButton("wait");
}
