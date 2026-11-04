// 실험 페이지 공용: 엔진 만들기 + 로딩 막대(#loader #barFill #loaderPct #loaderText #ver) 연결
import { createCsEngine } from "../../core/cs-engine.js";

export function bootEngine(extra = {}) {
  const $ = (id) => document.getElementById(id);
  const fmtMs = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(1) + "초" : Math.round(ms) + "ms");
  const lab = (window.__lab = window.__lab || {});
  const engine = createCsEngine({
    ...extra,
    onProgress(p) {
      const pct = Math.floor(p.ratio * 100);
      $("barFill").style.width = pct + "%";
      $("loaderPct").textContent = pct + "%";
      $("loaderText").textContent = `엔진 내려받는 중… ${(p.bytes / 1048576).toFixed(1)}MB`;
      extra.onProgress && extra.onProgress(p);
    },
    onReady(info) {
      lab.ready = true;
      $("ver").textContent = "엔진 v" + info.version;
      $("loader").classList.add("done");
      $("loaderText").textContent = `준비 완료 · ${fmtMs(info.loadMs)}`;
      extra.onReady && extra.onReady(info);
    },
    onWarm(ms) {
      lab.warm = true;
      extra.onWarm && extra.onWarm(ms);
    },
    onState(s) {
      lab.state = s;
      if (s === "restarting") { lab.ready = false; $("loader").classList.remove("done"); $("loaderText").textContent = "엔진 다시 준비 중…"; }
      extra.onState && extra.onState(s);
    },
    onError(msg) {
      lab.failed = msg;
      $("loader").classList.add("failed");
      $("loaderText").textContent = "엔진을 불러오지 못했습니다: " + msg;
      extra.onError && extra.onError(msg);
    },
  });
  lab.engine = engine;
  return engine;
}

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
