// C# 엔진 Web Worker — .NET 런타임 + Roslyn을 백그라운드 스레드에서 돌린다.
// 화면(메인 스레드)과는 메시지로만 대화한다. 사용법은 cs-engine.js 참고.
import { dotnet } from "../_framework/dotnet.js";

const post = (m) => self.postMessage(m);
const t0 = performance.now();

// ── 압축본 받기: brotli(가능하면) → gzip → 원본 ──
const supports = (fmt) => { try { new DecompressionStream(fmt); return true; } catch { return false; } };
const ENC = typeof DecompressionStream !== "function" ? null : supports("brotli") ? "br" : "gz";
let bytes = 0, files = 0, lastPost = 0;

function progress(force) {
  const now = performance.now();
  if (!force && now - lastPost < 80) return;
  lastPost = now;
  post({ type: "progress", bytes, files, enc: ENC });
}

async function fetchCounted(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status + " " + url);
  const reader = res.body.getReader();
  return new ReadableStream({
    async pull(ctrl) {
      const { done, value } = await reader.read();
      if (done) { ctrl.close(); return; }
      bytes += value.byteLength;
      progress();
      ctrl.enqueue(value);
    },
  });
}

async function loadResource(defaultUri, wasm) {
  try {
    let body;
    if (ENC) {
      try {
        body = (await fetchCounted(defaultUri + "." + ENC)).pipeThrough(new DecompressionStream(ENC === "br" ? "brotli" : "gzip"));
      } catch {
        body = await fetchCounted(defaultUri);
      }
    } else {
      body = await fetchCounted(defaultUri);
    }
    const buf = await new Response(body).arrayBuffer();
    return new Response(buf, { headers: { "content-type": wasm ? "application/wasm" : "application/octet-stream" } });
  } finally {
    files++;
    progress(true);
  }
}

// .NET 쪽(Exports)이 부르는 함수들
globalThis.labPostOutput = (chunk) => post({ type: "output", chunk });          // 실행 중 출력 조각
globalThis.labPostFrame = (scene) => post({ type: "frame", scene });             // Unity 모드: 프레임 장면
let inputKeys = "";
globalThis.labGetInput = () => inputKeys;                                        // Unity 모드: 지금 눌린 키

let api = null;
let chain = Promise.resolve();
const enqueue = (fn) => (chain = chain.then(fn, fn));

async function boot() {
  const runtime = await dotnet
    .withApplicationCulture("ko")
    .withConfig({ loadAllSatelliteResources: true })
    .withResourceLoader((type, name, defaultUri) => {
      if (defaultUri.endsWith(".js") || defaultUri.endsWith(".mjs") || defaultUri.endsWith(".json")) return defaultUri;
      return loadResource(defaultUri, type === "dotnetwasm" || defaultUri.endsWith(".wasm"));
    })
    .create();
  const exp = await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName);
  api = exp.CsEngine.Exports;

  // 한국어 오류 메시지 리소스 확인 (자동으로 안 올라왔으면 직접 로딩)
  let diag = api.Diagnose();
  if (!/ko=.*[가-힣]/.test(diag)) {
    try {
      const internal = runtime.INTERNAL || (globalThis.getDotnetRuntime && globalThis.getDotnetRuntime(0).INTERNAL);
      if (internal && internal.loadSatelliteAssemblies) await internal.loadSatelliteAssemblies(["ko"]);
    } catch (e) { /* 영어 메시지로 동작 */ }
    diag = "[after load] " + api.Diagnose();
  }
  progress(true);
  post({ type: "ready", version: api.GetVersion(), loadMs: performance.now() - t0, diag, enc: ENC, bytes, files });

  // 첫 컴파일은 느리므로 미리 한 번 (실행 요청이 오면 이 뒤에 줄을 선다)
  enqueue(async () => {
    const w0 = performance.now();
    await api.Warmup();
    post({ type: "warm", ms: performance.now() - w0 });
  });
}

const errorJson = (e) => JSON.stringify({ status: "internal-error", stdout: "", diagnostics: [], error: { type: "WorkerError", message: String(e), friendly: "엔진 내부 오류가 났습니다." }, compileMs: 0, runMs: 0, totalMs: 0 });

// 실행 계열(대기열에 줄 섬): 이름 → (api, 메시지) → Promise<JSON 문자열>
const RUNNERS = {
  run: (a, m) => a.Run(m.code, m.stdin || ""),
  runFiles: (a, m) => a.RunFiles(JSON.stringify(m.files), m.stdin || ""),
  grade: (a, m) => a.Grade(JSON.stringify(m.files), JSON.stringify(m.tests || [])),
  runUnity: (a, m) => a.RunUnity(m.code, JSON.stringify(m.options || {})),
};

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === "input") { inputKeys = (m.keys || []).join(","); return; }
  if (m.type === "check" || m.type === "analyze") {
    // 진단만·구조 분석: 실행이 없고 동기라서 대기열을 거치지 않는다(실행 중에도 응답)
    let json;
    const empty = { diagnostics: [], types: [], relations: [], features: {}, calls: {}, rules: [], rulesPassed: 0, rulesTotal: 0, ms: 0 };
    try {
      if (!api) json = JSON.stringify({ ...empty, notReady: true });
      else if (m.type === "check") json = api.Check(JSON.stringify(m.files), m.mode || "console");
      else json = api.Analyze(JSON.stringify(m.files), m.rules ? JSON.stringify(m.rules) : "", m.mode || "console");
    } catch (e) { json = JSON.stringify({ ...empty, error: String(e) }); }
    post({ type: "result", id: m.id, json });
    return;
  }
  const runner = RUNNERS[m.type];
  if (!runner) return;
  enqueue(async () => {
    let json;
    try { json = await runner(api, m); } catch (e) { json = errorJson(e); }
    post({ type: "result", id: m.id, json });
  });
};

boot().catch((e) => post({ type: "error", message: String(e && e.stack || e) }));
