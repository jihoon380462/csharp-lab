// Unity 시뮬레이터 실험: UnityLite(엔진 Unity 모드)를 실시간(약 60fps)으로 돌리고 장면을 캔버스에 그린다.
import { bootEngine, esc } from "../shared/boot.js";
import { createCodeEditor } from "../../core/code-editor.js";
import { createSymbolBar } from "../../core/symbol-bar.js";

const EXAMPLES = [
  {
    id: "move", label: "화살표로 움직이기",
    code: `using UnityEngine;

public class Player : MonoBehaviour
{
    public float speed = 5f;

    void Start()
    {
        GetComponent<SpriteRenderer>().color = Color.cyan;
        Debug.Log("시작! 화면을 누르고 방향키를 눌러 보세요");
    }

    void Update()
    {
        float h = Input.GetAxis("Horizontal");
        float v = Input.GetAxis("Vertical");
        transform.position += new Vector3(h, v, 0) * speed * Time.deltaTime;

        if (Input.GetKeyDown(KeyCode.Space))
        {
            Debug.Log("지금 위치: " + transform.position);
        }
    }
}`,
  },
  {
    id: "orbit", label: "빙글빙글 공전",
    code: `using UnityEngine;

public class Sun : MonoBehaviour
{
    void Start()
    {
        var r = GetComponent<SpriteRenderer>();
        r.color = Color.yellow;
        r.shape = Shape.Circle;
        transform.localScale = new Vector3(1.6f, 1.6f, 1);
    }
}

public class Planet : MonoBehaviour
{
    public float radius = 3.5f;
    public float speed = 1.5f;

    void Start()
    {
        GetComponent<SpriteRenderer>().color = new Color(0.3f, 0.6f, 1f);
    }

    void Update()
    {
        float t = Time.time * speed;
        transform.position = new Vector3(Mathf.Cos(t), Mathf.Sin(t), 0) * radius;
        transform.Rotate(0, 0, 180 * Time.deltaTime);
    }
}`,
  },
  {
    id: "bounce", label: "튀는 공",
    code: `using UnityEngine;

public class Ball : MonoBehaviour
{
    Vector3 velocity = new Vector3(4f, 0f, 0f);
    float gravity = -15f;
    int bounces = 0;

    void Start()
    {
        var r = GetComponent<SpriteRenderer>();
        r.shape = Shape.Circle;
        r.color = Color.magenta;
        transform.position = new Vector3(-6, 3, 0);
    }

    void Update()
    {
        velocity.y += gravity * Time.deltaTime;
        transform.position += velocity * Time.deltaTime;

        var p = transform.position;
        if (p.y < -4.5f) { p.y = -4.5f; velocity.y = -velocity.y * 0.85f; bounces++; Debug.Log("통! " + bounces + "번째"); }
        if (p.x > 7.5f || p.x < -7.5f) { velocity.x = -velocity.x; p.x = Mathf.Clamp(p.x, -7.5f, 7.5f); }
        transform.position = p;
    }
}`,
  },
  {
    id: "shoot", label: "스페이스로 총알 쏘기",
    code: `using UnityEngine;

public class Ship : MonoBehaviour
{
    int shots = 0;

    void Start()
    {
        var r = GetComponent<SpriteRenderer>();
        r.shape = Shape.Triangle;
        r.color = Color.green;
        transform.position = new Vector3(0, -4, 0);
    }

    void Update()
    {
        transform.position += Vector3.right * Input.GetAxis("Horizontal") * 6f * Time.deltaTime;

        if (Input.GetKeyDown(KeyCode.Space))
        {
            var bullet = new GameObject("총알" + (++shots));
            bullet.transform.position = transform.position + Vector3.up * 0.6f;
            bullet.transform.localScale = new Vector3(0.2f, 0.5f, 1);
            bullet.AddComponent<Bullet>();
        }
    }
}

[Prefab]   // 시뮬레이터 전용: 시작할 때 자동으로 만들지 않음 (코드에서 AddComponent 로 만듦)
public class Bullet : MonoBehaviour
{
    void Start() { GetComponent<SpriteRenderer>().color = Color.yellow; }

    void Update()
    {
        transform.Translate(0, 10f * Time.deltaTime, 0);
        if (transform.position.y > 5.5f)
        {
            Debug.Log(name + " 화면 밖으로");
            Destroy(gameObject);
        }
    }
}`,
  },
  {
    id: "chase", label: "따라오는 적",
    code: `using UnityEngine;

public class Player : MonoBehaviour
{
    void Start() { GetComponent<SpriteRenderer>().color = Color.cyan; }

    void Update()
    {
        var dir = new Vector3(Input.GetAxis("Horizontal"), Input.GetAxis("Vertical"), 0);
        transform.position += dir * 6f * Time.deltaTime;
    }
}

public class Enemy : MonoBehaviour
{
    Transform target;

    void Start()
    {
        var r = GetComponent<SpriteRenderer>();
        r.color = Color.red;
        r.shape = Shape.Circle;
        transform.position = new Vector3(6, 3, 0);
        target = GameObject.Find("Player").transform;
    }

    void Update()
    {
        transform.position = Vector3.MoveTowards(transform.position, target.position, 2.5f * Time.deltaTime);
        if (Vector3.Distance(transform.position, target.position) < 0.8f)
        {
            Debug.Log("잡혔다! " + Time.time.ToString("F1") + "초 버팀");
            transform.position = new Vector3(Random.Range(-7f, 7f), 4, 0);
        }
    }
}`,
  },
];

const $ = (id) => document.getElementById(id);
const lab = (window.__lab = window.__lab || {});
let playing = false;
let scene = [];          // 마지막 프레임 장면
let frames = 0, fpsT = performance.now(), fps = 0;

const editor = (lab.editor = createCodeEditor($("editorHost"), { id: "code", gutterId: "gutter", onRun: () => play(), onChange: () => scheduleCheck() }));
createSymbolBar($("symbar"), editor);

const out = $("output");
let consoleText = "";
function log(text) {
  consoleText += text;
  if (consoleText.length > 30000) consoleText = consoleText.slice(-20000);
  out.innerHTML = `<pre class="stdout">${esc(consoleText)}</pre>`;
  out.scrollTop = out.scrollHeight;
}

const engine = bootEngine({
  onReady() { if (!playing) setBtn("play"); scheduleCheck(); },
  onState(s) { if (s === "restarting" && !playing) setBtn("wait"); },
  onOutput(chunk) { log(chunk); },
  onFrame(s) {
    scene = parseScene(s);
    frames++;
    lab.frames = (lab.frames || 0) + 1;
    lab.scene = scene;
  },
});

function setBtn(mode) {
  const b = $("playBtn");
  b.disabled = mode === "wait";
  b.classList.toggle("stop", mode === "stop");
  b.querySelector(".run-icon").textContent = mode === "stop" ? "■" : "▶";
  $("playLabel").textContent = mode === "stop" ? "중지" : mode === "wait" ? "엔진 준비 중…" : "실행";
  $("testBtn").disabled = mode !== "play";
}

function setStatus(t, cls) { $("status").textContent = t; $("status").className = "status " + (cls || ""); }

// ── 실시간 검사 (Unity 모드) ──
let timer = 0, seq = 0;
function scheduleCheck() {
  clearTimeout(timer);
  editor.setDiagnostics([]);
  $("liveCheck").innerHTML = "";
  timer = setTimeout(async () => {
    if (!lab.ready) return;
    const code = editor.value, my = ++seq;
    const r = await engine.check(code, "unity");
    if (my !== seq || code !== editor.value || r.stopped) return;
    const ds = (r.diagnostics || []).filter((d) => d.file === "Program.cs");
    editor.setDiagnostics(ds);
    const errs = (r.diagnostics || []).filter((d) => d.severity === "error");
    $("liveCheck").innerHTML = errs.length
      ? `<span class="e">오류 ${errs.length}개</span> ${errs[0].line ? errs[0].line + "번째 줄: " : ""}${esc(errs[0].message)}`
      : `<span class="okc">✓ 문법 오류 없음</span>`;
  }, 450);
}

// ── 장면 그리기 ──
function parseScene(s) {
  const list = [];
  for (const line of s.split("\n")) {
    if (!line) continue;
    const [name, x, y, rot, sx, sy, shape, color, order] = line.split("\t");
    list.push({ name, x: +x, y: +y, rot: +rot, sx: +sx, sy: +sy, shape, color, order: +order });
  }
  return list.sort((a, b) => a.order - b.order);
}

const canvas = $("stage");
const ctx = canvas.getContext("2d");
function resizeCanvas() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(200, Math.round(r.width * dpr)), h = Math.round(w * 10 / 16);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
function hexToCss(hex) {
  const n = parseInt(hex.slice(1), 16);
  if (hex.length === 9) return `rgba(${(n >>> 24) & 255},${(n >>> 16) & 255},${(n >>> 8) & 255},${((n & 255) / 255).toFixed(3)})`;
  return hex;
}
function draw() {
  resizeCanvas();
  const W = canvas.width, H = canvas.height, unit = H / 10;   // 카메라 크기 5 (Unity 기본) → 세로 10칸
  ctx.fillStyle = "#0d0b12";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#1d1828";
  ctx.lineWidth = 1;
  for (let gx = Math.ceil(-W / 2 / unit); gx <= W / 2 / unit; gx++) { const px = W / 2 + gx * unit; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke(); }
  for (let gy = -5; gy <= 5; gy++) { const py = H / 2 - gy * unit; ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke(); }
  ctx.strokeStyle = "#2e2740";
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

  for (const o of scene) {
    ctx.save();
    ctx.translate(W / 2 + o.x * unit, H / 2 - o.y * unit);
    ctx.rotate(-o.rot * Math.PI / 180);
    ctx.scale(o.sx * unit, o.sy * unit);
    ctx.fillStyle = hexToCss(o.color);
    ctx.beginPath();
    if (o.shape === "Circle") ctx.arc(0, 0, 0.5, 0, Math.PI * 2);
    else if (o.shape === "Triangle") { ctx.moveTo(0, -0.5); ctx.lineTo(0.5, 0.5); ctx.lineTo(-0.5, 0.5); ctx.closePath(); }
    else ctx.rect(-0.5, -0.5, 1, 1);
    ctx.fill();
    ctx.restore();
  }
  if (!playing && !scene.length) {
    ctx.fillStyle = "#6f6789";
    ctx.font = `${Math.round(H / 22)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("▶ 실행을 누르세요", W / 2, H / 2 - unit * 0.3);
  }
  const now = performance.now();
  if (now - fpsT > 500) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; }
  $("hud").textContent = playing ? `${fps} fps · 오브젝트 ${scene.length}` : "";
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// ── 입력: 캔버스 키보드 + 화면 버튼 ──
const pressed = new Set();
const KEYMAP = { ArrowLeft: "LeftArrow", ArrowRight: "RightArrow", ArrowUp: "UpArrow", ArrowDown: "DownArrow", " ": "Space", Enter: "Return", Escape: "Escape", Shift: "LeftShift" };
function keyName(e) {
  if (KEYMAP[e.key]) return KEYMAP[e.key];
  if (/^[a-z]$/i.test(e.key)) return e.key.toUpperCase();
  if (/^[0-9]$/.test(e.key)) return "Alpha" + e.key;
  return null;
}
function pushInput() { lab.keys = [...pressed]; engine.setInput([...pressed]); }
canvas.addEventListener("keydown", (e) => { const k = keyName(e); if (!k) return; e.preventDefault(); if (!pressed.has(k)) { pressed.add(k); pushInput(); } });
canvas.addEventListener("keyup", (e) => { const k = keyName(e); if (!k) return; e.preventDefault(); pressed.delete(k); pushInput(); });
canvas.addEventListener("blur", () => { pressed.clear(); pushInput(); });
canvas.addEventListener("pointerdown", () => canvas.focus());
for (const b of $("keypad").querySelectorAll("button[data-key]")) {
  const k = b.dataset.key;
  const down = (e) => { e.preventDefault(); b.classList.add("on"); pressed.add(k); pushInput(); };
  const up = (e) => { e.preventDefault(); b.classList.remove("on"); pressed.delete(k); pushInput(); };
  b.addEventListener("pointerdown", down);
  b.addEventListener("pointerup", up);
  b.addEventListener("pointerleave", up);
  b.addEventListener("pointercancel", up);
}

// ── 실행 / 중지 ──
async function play() {
  if (playing) { engine.stop(); return; }
  if (!lab.ready) return;
  playing = true;
  scene = [];
  lab.scene = [];
  lab.frames = 0;
  consoleText = "";
  out.innerHTML = "";
  setBtn("stop");
  setStatus("실행 중", "busy");
  canvas.focus();
  pressed.clear(); pushInput();
  const r = await engine.runUnity(editor.value, { live: true });
  lab.lastResult = r;
  playing = false;
  setBtn(lab.ready ? "play" : "wait");
  showResult(r);
}

async function quickTest() {
  if (playing || !lab.ready) return;
  consoleText = "";
  out.innerHTML = "";
  setStatus("60프레임 시험 중…", "busy");
  const r = await engine.runUnity(editor.value, { live: false, frames: 60 });
  lab.lastResult = r;   // 출력은 실행 중에 onOutput 으로 이미 받음
  showResult(r, true);
}

function showResult(r, quick) {
  if (r.status === "stopped-by-user") { setStatus("중지됨", "warn"); return; }
  if (r.status === "compile-error") {
    editor.setDiagnostics(r.diagnostics.filter((d) => d.file === "Program.cs"));
    const errs = r.diagnostics.filter((d) => d.severity === "error");
    out.innerHTML += `<div class="box error"><b>컴파일 오류 ${errs.length}개</b><ul>` +
      errs.map((d) => `<li>${d.line ? d.line + "번째 줄 " : ""}${esc(d.message)} <small>${d.id}${d.file && d.file !== "Program.cs" ? " · " + esc(d.file) : ""}</small></li>`).join("") + `</ul></div>`;
    setStatus("컴파일 오류", "bad");
    return;
  }
  if (r.error) {
    out.innerHTML += `<div class="box ${r.status === "stopped" ? "warn" : "error"}"><b>${r.status === "stopped" ? "실행 중단" : "실행 중 오류"}</b>` +
      `<p>${r.error.line ? r.error.line + "번째 줄: " : ""}${esc(r.error.friendly)}</p>${r.error.message ? `<p class="raw">${esc(r.error.type)}: ${esc(r.error.message)}</p>` : ""}</div>`;
    setStatus(r.status === "stopped" ? "중단됨" : "실행 오류", r.status === "stopped" ? "warn" : "bad");
    return;
  }
  setStatus(quick ? `60프레임 완료 (${r.runMs}ms)` : "끝남", "ok");
}

// ── 예제 ──
function loadExample(ex) {
  if (playing) engine.stop();
  editor.value = ex.code;
  scene = [];
  $("examples").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.id === ex.id));
  scheduleCheck();
}
for (const ex of EXAMPLES) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = ex.label;
  b.dataset.id = ex.id;
  b.addEventListener("click", () => loadExample(ex));
  $("examples").appendChild(b);
}

$("playBtn").addEventListener("click", play);
$("testBtn").addEventListener("click", quickTest);
$("clearBtn").addEventListener("click", () => { consoleText = ""; out.innerHTML = ""; });
lab.examples = EXAMPLES;
loadExample(EXAMPLES[0]);
setBtn("wait");
