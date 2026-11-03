// C# 엔진 클라이언트 (메인 스레드용). 다른 페이지(예: 아카데미)에서도 이 파일 하나만 import 하면 된다.
//
//   import { createCsEngine } from "/csharp-lab/core/cs-engine.js";
//   const engine = createCsEngine({ onProgress, onReady, onWarm, onOutput, onState, onFrame });
//   await engine.run(code, stdin)                    → RunResult   (코드 하나)
//   await engine.runFiles([{name, code}], stdin)     → RunResult   (여러 파일)
//   await engine.grade([{name, code}], [{stdin, expect}]) → GradeResult (컴파일 1번, 테스트마다 실행·비교)
//   await engine.check(codeOrFiles, mode)            → CheckResult (진단만, 실행 안 함 — 입력 중 오류 밑줄용)
//   await engine.runUnity(code, {live, frames, inputScript}) → RunResult (UnityLite 프레임 루프)
//   engine.setInput(["LeftArrow", "Space"])          (Unity 실시간 모드: 지금 눌린 키)
//   engine.stop()                                    (실행 중이면 강제 중지 후 엔진 자동 재시작)
//
// status: ok | compile-error | runtime-error | stopped(무한 반복 등 자동 중단) | stopped-by-user | internal-error
// 결과 모양은 docs/REFERENCE.md 4절 (계약 — 바꾸지 말 것)

const here = new URL(".", import.meta.url);           // .../core/
const siteRoot = new URL("../", here);                // .../csharp-lab/

export function createCsEngine(opts = {}) {
  const cb = (name, ...a) => { try { opts[name] && opts[name](...a); } catch (e) { console.error(e); } };
  let worker = null;
  let state = "loading";           // loading | ready | running | restarting | failed
  let expected = null;             // { gzBytes, brBytes }
  let pending = new Map();         // id → { resolve }
  let seq = 0;
  let info = {};

  const setState = (s) => { state = s; cb("onState", s); };

  fetch(new URL("lab-size.json", siteRoot)).then((r) => r.json()).then((j) => (expected = j)).catch(() => {});

  function start(isRestart) {
    setState(isRestart ? "restarting" : "loading");
    worker = new Worker(new URL("engine-worker.js", here), { type: "module" });
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === "progress") {
        const total = expected ? (m.enc === "br" ? expected.brBytes : expected.gzBytes) : 0;
        cb("onProgress", { bytes: m.bytes, files: m.files, ratio: total ? Math.min(0.99, m.bytes / total) : 0, enc: m.enc });
      } else if (m.type === "ready") {
        info = { version: m.version, loadMs: m.loadMs, diag: m.diag, enc: m.enc, bytes: m.bytes, files: m.files };
        setState([...pending.values()].some((x) => x.counts) ? "running" : "ready");
        cb("onReady", info);
      } else if (m.type === "warm") {
        info.warmMs = m.ms;
        cb("onWarm", m.ms);
      } else if (m.type === "output") {
        cb("onOutput", m.chunk);
      } else if (m.type === "frame") {
        cb("onFrame", m.scene);
      } else if (m.type === "result") {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (![...pending.values()].some((x) => x.counts) && state === "running") setState("ready");
        if (p) p.resolve(JSON.parse(m.json));
      } else if (m.type === "error") {
        setState("failed");
        cb("onError", m.message);
      }
    };
    worker.onerror = (e) => { setState("failed"); cb("onError", e.message || "worker error"); };
  }

  start(false);

  // 실행 계열 요청: 상태를 running 으로 (check 는 상태를 바꾸지 않음)
  function request(msg, counts = true) {
    const id = ++seq;
    return new Promise((resolve) => {
      pending.set(id, { resolve, started: performance.now(), counts, kind: msg.type });
      if (counts) setState("running");
      worker.postMessage({ ...msg, id });
    });
  }

  const asFiles = (x) => (typeof x === "string" ? [{ name: "Program.cs", code: x }] : x);

  return {
    get state() { return state; },
    get info() { return info; },
    run: (code, stdin = "") => request({ type: "run", code, stdin }),
    runFiles: (files, stdin = "") => request({ type: "runFiles", files, stdin }),
    grade: (files, tests) => request({ type: "grade", files: asFiles(files), tests }),
    check: (codeOrFiles, mode = "console") => request({ type: "check", files: asFiles(codeOrFiles), mode }, false),
    runUnity: (code, options = {}) => request({ type: "runUnity", code, options }),
    setInput: (keys) => { if (worker) worker.postMessage({ type: "input", keys: keys || [] }); },
    stop() {
      if (!worker) return;
      worker.terminate();
      for (const [, p] of pending) {
        const runMs = Math.round(performance.now() - p.started);
        if (p.kind === "check") p.resolve({ diagnostics: [], ms: 0, stopped: true });
        else if (p.kind === "grade") p.resolve({ status: "stopped-by-user", diagnostics: [], error: null, tests: [], passed: 0, total: 0, compileMs: 0, totalMs: runMs });
        else p.resolve({ status: "stopped-by-user", stdout: "", diagnostics: [], error: null, compileMs: 0, runMs, totalMs: 0 });
      }
      pending.clear();
      start(true);
    },
  };
}
