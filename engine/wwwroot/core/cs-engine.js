// C# 엔진 클라이언트 (메인 스레드용). 다른 페이지(예: 아카데미)에서도 이 파일 하나만 import 하면 된다.
//
//   import { createCsEngine } from "/csharp-lab/core/cs-engine.js";
//   const engine = createCsEngine({ onProgress, onReady, onWarm, onOutput, onState });
//   const result = await engine.run(code, stdin);   // 결과 객체 (status, stdout, diagnostics, error, compileMs, runMs)
//   engine.stop();                                  // 실행 중이면 강제 중지 후 엔진 자동 재시작
//
// status: ok | compile-error | runtime-error | stopped(무한 반복 등 자동 중단) | stopped-by-user | internal-error

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
        setState(pending.size ? "running" : "ready");
        cb("onReady", info);
      } else if (m.type === "warm") {
        info.warmMs = m.ms;
        cb("onWarm", m.ms);
      } else if (m.type === "output") {
        cb("onOutput", m.chunk);
      } else if (m.type === "result") {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (!pending.size && state === "running") setState("ready");
        if (p) p.resolve(JSON.parse(m.json));
      } else if (m.type === "error") {
        setState("failed");
        cb("onError", m.message);
      }
    };
    worker.onerror = (e) => { setState("failed"); cb("onError", e.message || "worker error"); };
  }

  start(false);

  return {
    get state() { return state; },
    get info() { return info; },
    run(code, stdin = "") {
      const id = ++seq;
      return new Promise((resolve) => {
        pending.set(id, { resolve, started: performance.now() });
        setState("running");
        worker.postMessage({ type: "run", id, code, stdin });
      });
    },
    stop() {
      if (!worker) return;
      worker.terminate();
      for (const [, p] of pending) {
        p.resolve({ status: "stopped-by-user", stdout: "", diagnostics: [], error: null, compileMs: 0, runMs: Math.round(performance.now() - p.started), totalMs: 0 });
      }
      pending.clear();
      start(true);
    },
  };
}
