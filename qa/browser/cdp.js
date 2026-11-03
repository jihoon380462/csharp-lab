// 외부 패키지 없이 크롬 DevTools 프로토콜(CDP)로 페이지를 조작하는 최소 도구
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-chrome-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(process.env.CHROME || "/usr/bin/google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--no-first-run", "--disable-gpu",
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--no-proxy-server", "about:blank",
  ], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === "page");
      if (target) break;
    } catch {}
    await sleep(100);
  }
  if (!target) throw new Error("크롬 실행 실패");
  const page = await connect(target.webSocketDebuggerUrl);
  page.close = async () => { try { page.ws.close(); } catch {} proc.kill("SIGKILL"); await sleep(300); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
  return page;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const listeners = [];
    const page = {
      ws,
      send(method, params = {}, sessionId) {
        return new Promise((res, rej) => {
          const mid = ++id;
          pending.set(mid, { res, rej, method });
          ws.send(JSON.stringify(sessionId ? { id: mid, method, params, sessionId } : { id: mid, method, params }));
        });
      },
      on(method, fn) { listeners.push({ method, fn }); },
      async eval(fnOrExpr, ...args) {
        const expr = typeof fnOrExpr === "function" ? `(${fnOrExpr})(...${JSON.stringify(args)})` : fnOrExpr;
        const r = await page.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error("eval: " + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
        return r.result.value;
      },
      async waitFor(fn, timeout = 60000, interval = 150) {
        const end = Date.now() + timeout;
        while (Date.now() < end) {
          try { const v = await page.eval(fn); if (v) return v; } catch {}
          await sleep(interval);
        }
        throw new Error("waitFor 시간 초과: " + fn.toString().slice(0, 120));
      },
      async screenshot(file, fullPage = false) {
        let clip;
        if (fullPage) {
          const m = await page.send("Page.getLayoutMetrics");
          const s = m.cssContentSize || m.contentSize;
          clip = { x: 0, y: 0, width: s.width, height: s.height, scale: 1 };
        }
        const r = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: fullPage, ...(clip ? { clip } : {}) });
        fs.writeFileSync(file, Buffer.from(r.data, "base64"));
      },
      keyDown(key, code, keyCode) { return page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode }); },
      keyUp(key, code, keyCode) { return page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode }); },
      async key(key, code, keyCode, modifiers = 0) {
        await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode, modifiers });
        await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode, modifiers });
      },
    };
    ws.onopen = () => resolve(page);
    ws.onerror = (e) => reject(e);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        msg.error ? p.rej(new Error(p.method + ": " + msg.error.message)) : p.res(msg.result);
      } else if (msg.method) {
        for (const l of listeners) if (l.method === msg.method) l.fn(msg.params, msg.sessionId);
      }
    };
  });
}

module.exports = { launch, sleep };
