(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const codeEl = $("code"), gutterEl = $("gutter"), stdinEl = $("stdin");
  const runBtn = $("runBtn"), runLabel = $("runLabel");
  const outputEl = $("output"), statusEl = $("status");

  const lab = (window.__lab = { ready: false, bytes: 0, loaded: 0, total: 0, loadMs: 0, warmMs: 0, lastResult: null });
  const t0 = performance.now();

  // ───────── 편집기 ─────────
  function updateGutter() {
    const lines = codeEl.value.split("\n").length;
    let s = "";
    for (let i = 1; i <= lines; i++) s += i + "\n";
    gutterEl.textContent = s;
  }
  codeEl.addEventListener("input", updateGutter);
  codeEl.addEventListener("scroll", () => { gutterEl.scrollTop = codeEl.scrollTop; });
  codeEl.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: en, value } = codeEl;
      codeEl.value = value.slice(0, s) + "    " + value.slice(en);
      codeEl.selectionStart = codeEl.selectionEnd = s + 4;
      updateGutter();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run();
    } else if (e.key === "Enter") {
      // 윗줄 들여쓰기 유지
      e.preventDefault();
      const { selectionStart: s, selectionEnd: en, value } = codeEl;
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const indent = (value.slice(lineStart, s).match(/^\s*/) || [""])[0];
      const extra = value.slice(lineStart, s).trimEnd().endsWith("{") ? "    " : "";
      const ins = "\n" + indent + extra;
      codeEl.value = value.slice(0, s) + ins + value.slice(en);
      codeEl.selectionStart = codeEl.selectionEnd = s + ins.length;
      updateGutter();
    }
  });

  function selectLine(line) {
    const lines = codeEl.value.split("\n");
    if (line < 1 || line > lines.length) return;
    let start = 0;
    for (let i = 0; i < line - 1; i++) start += lines[i].length + 1;
    codeEl.focus();
    codeEl.setSelectionRange(start, start + lines[line - 1].length);
    const lh = parseFloat(getComputedStyle(codeEl).lineHeight) || 20;
    codeEl.scrollTop = Math.max(0, (line - 3) * lh);
  }

  // ───────── 예제 ─────────
  const exWrap = $("examples");
  function loadExample(ex) {
    codeEl.value = ex.code;
    stdinEl.value = ex.stdin || "";
    if (ex.stdin) $("stdinBox").open = true;
    updateGutter();
    codeEl.scrollTop = 0;
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
    const label = { ok: ["성공", "ok"], "compile-error": ["컴파일 오류", "bad"], "runtime-error": ["실행 오류", "bad"], stopped: ["중단됨", "warn"], "internal-error": ["엔진 오류", "bad"] }[r.status] || [r.status, ""];
    setStatus(label[0], label[1]);
  }

  // ───────── 실행 ─────────
  let running = false;
  async function run() {
    if (!lab.ready || running) return;
    running = true;
    runBtn.disabled = true;
    runLabel.textContent = "실행 중…";
    setStatus("실행 중…", "busy");
    outputEl.classList.add("dim");
    // 버튼 상태가 화면에 그려진 뒤 실행 (엔진이 메인 스레드를 잠깐 점유함)
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    try {
      const json = await DotNet.invokeMethodAsync("CsEngine", "Run", codeEl.value, stdinEl.value);
      const r = JSON.parse(json);
      lab.lastResult = r;
      render(r);
    } catch (err) {
      lab.lastResult = { status: "js-error", message: String(err) };
      outputEl.innerHTML = `<div class="box error"><b>엔진 호출 실패</b><p class="raw">${esc(String(err))}</p></div>`;
      setStatus("엔진 오류", "bad");
    } finally {
      outputEl.classList.remove("dim");
      running = false;
      runBtn.disabled = false;
      runLabel.textContent = "실행";
    }
  }
  runBtn.addEventListener("click", run);

  // ───────── 엔진 로딩 (gzip 압축본을 받아 브라우저에서 풀기) ─────────
  const canGunzip = typeof DecompressionStream === "function";
  const barFill = $("barFill"), loaderPct = $("loaderPct"), loaderText = $("loaderText");

  function progress() {
    const pct = lab.total ? Math.min(99, Math.floor((lab.loaded / lab.total) * 100)) : 0;
    barFill.style.width = pct + "%";
    loaderPct.textContent = pct + "%";
    loaderText.textContent = `엔진 내려받는 중… ${fmtMB(lab.bytes)}`;
    $("mBytes").textContent = fmtMB(lab.bytes);
  }

  async function countingFetch(url, type) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status + " " + url);
    const reader = res.body.getReader();
    const counted = new ReadableStream({
      async pull(ctrl) {
        const { done, value } = await reader.read();
        if (done) { ctrl.close(); return; }
        lab.bytes += value.byteLength;
        progress();
        ctrl.enqueue(value);
      },
    });
    return counted;
  }

  async function loadResource(type, defaultUri) {
    const ctype = type === "dotnetwasm" || defaultUri.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
    try {
      let body;
      if (canGunzip) {
        try {
          body = (await countingFetch(defaultUri + ".gz", type)).pipeThrough(new DecompressionStream("gzip"));
        } catch {
          body = await countingFetch(defaultUri, type);
        }
      } else {
        body = await countingFetch(defaultUri, type);
      }
      // 끝까지 받아서 Response로 넘김 (wasm 스트리밍 컴파일을 위해 content-type 지정)
      const buf = await new Response(body).arrayBuffer();
      return new Response(buf, { headers: { "content-type": ctype } });
    } finally {
      lab.loaded++;
      progress();
    }
  }

  async function countResources() {
    try {
      const boot = await (await fetch("_framework/blazor.boot.json", { cache: "no-cache" })).json();
      const res = boot.resources || {};
      let n = 0;
      for (const k of ["assembly", "runtime", "icu", "wasmNative", "jsModuleRuntime", "jsModuleNative", "satelliteResources"]) {
        const v = res[k];
        if (!v) continue;
        if (k === "satelliteResources") { for (const c of Object.values(v)) n += Object.keys(c).length; }
        else n += Object.keys(v).length;
      }
      lab.total = Math.max(n, 1);
    } catch { lab.total = 60; }
  }

  async function boot() {
    await countResources();
    try {
      await Blazor.start({
        applicationCulture: "ko",
        loadBootResource(type, name, defaultUri) {
          if (type === "dotnetjs" || type === "manifest" || type === "configuration" ||
              type === "js-module-threads" || defaultUri.endsWith(".js") || defaultUri.endsWith(".json")) {
            return defaultUri;
          }
          return loadResource(type, defaultUri);
        },
      });
    } catch (err) {
      loaderText.textContent = "엔진을 불러오지 못했습니다: " + err;
      $("loader").classList.add("failed");
      lab.failed = String(err);
      return;
    }
    // 컴파일 오류 메시지를 한국어로: Roslyn 한국어 리소스 불러오기 (실패해도 영어로 동작)
    const diagnose = async () => { try { return await DotNet.invokeMethodAsync("CsEngine", "Diagnose"); } catch (e) { return String(e); } };
    lab.diag = await diagnose();
    if (!/ko=.*[가-힣]/.test(lab.diag)) {
      try {
        const rt = (Blazor.runtime && Blazor.runtime.INTERNAL) || (globalThis.getDotnetRuntime && getDotnetRuntime(0).INTERNAL);
        if (rt && rt.loadSatelliteAssemblies) await rt.loadSatelliteAssemblies(["ko"]);
      } catch (e) { console.warn("한국어 리소스 로딩 실패", e); }
      lab.diag = "[after load] " + (await diagnose());
    }
    lab.loadMs = performance.now() - t0;
    $("mLoad").textContent = fmtMs(lab.loadMs);
    $("ver").textContent = "v" + (await DotNet.invokeMethodAsync("CsEngine", "GetVersion"));

    barFill.style.width = "100%";
    loaderPct.textContent = "100%";
    loaderText.textContent = "컴파일러 예열 중…";
    const w0 = performance.now();
    await new Promise((r) => setTimeout(r, 30));
    await DotNet.invokeMethodAsync("CsEngine", "Warmup");
    lab.warmMs = performance.now() - w0;
    $("mWarm").textContent = fmtMs(lab.warmMs);

    loaderText.textContent = `준비 완료 · ${fmtMs(lab.loadMs + lab.warmMs)} 걸림`;
    $("loader").classList.add("done");
    lab.ready = true;
    runBtn.disabled = false;
    runLabel.textContent = "실행";
  }

  boot();
})();
