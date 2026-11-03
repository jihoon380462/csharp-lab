# 사용 설명서 — C# 실행 엔진

C# 코드를 받아 **컴파일(Roslyn) → 실행 → 결과(출력·오류·줄 번호)** 를 돌려주는 엔진입니다.
같은 엔진 코드(`engine/Core/`)를 두 가지로 씁니다.

| 어디서 | 어떻게 | 대표 사용처 |
|---|---|---|
| 웹 페이지 | `core/cs-engine.js` 를 import → Web Worker 안에서 .NET 10 WebAssembly 로 실행 | 실험실 화면, 파이썬 아카데미 C# 코스 |
| 데스크톱 .NET | `engine/Core/*.cs` 를 프로젝트에 포함 → `Engine.RunAsync` 직접 호출 | 데스크톱 테스트(`tests/EngineTests`), 정답 검사 도구 |

---

## 1. 웹 페이지에서 쓰기

### 1-1. 불러오기

엔진은 `https://jihoon380462.github.io/csharp-lab/` 에 배포되어 있습니다. 같은 사이트(`jihoon380462.github.io`) 아래의 다른 페이지는 경로로 바로 불러옵니다.

```js
import { createCsEngine } from "/csharp-lab/core/cs-engine.js";
```

- Web Worker 는 **같은 출처(origin)** 에서만 만들 수 있습니다. 다른 도메인에서 쓰려면 csharp-lab 의 빌드 결과물(`build-output` 브랜치 전체)을 그 사이트에 복사해 올리세요. 폴더 구조(`core/`, `_framework/`, `lab-size.json`)만 유지하면 됩니다.
- 모듈 스크립트(`<script type="module">`)에서 써야 합니다.

### 1-2. 만들기와 실행

```js
const engine = createCsEngine({
  onProgress: (p) => { /* 내려받는 중: p.ratio(0~1), p.bytes, p.files, p.enc('br'|'gz') */ },
  onReady:    (info) => { /* 실행 가능: info.version, info.loadMs, info.enc */ },
  onWarm:     (ms) => { /* 컴파일러 예열 끝 (몰라도 됨 — 실행 요청은 예열 뒤로 자동으로 줄 섬) */ },
  onOutput:   (chunk) => { /* 실행 중 출력 조각 (약 0.1초마다) */ },
  onState:    (s) => { /* loading | ready | running | restarting | failed */ },
  onError:    (msg) => { /* 엔진을 못 불러옴 */ },
});

const r = await engine.run('Console.WriteLine("안녕");', /* 입력값(stdin) */ "");
if (r.status === "ok") console.log(r.stdout);
```

- `run(code, stdin)` 은 Promise. 여러 번 연달아 불러도 순서대로 하나씩 실행됩니다(대기열).
- 엔진이 아직 로딩 중이어도 `run` 을 부를 수 있고, 준비되면 실행됩니다.

### 1-3. 중지

```js
engine.stop();
```

- 실행 중인 Worker 를 바로 끝내고, 엔진을 자동으로 다시 띄웁니다(PC 약 0.5초, 파일은 캐시에서).
- 진행 중이던 `run` 은 `status: "stopped-by-user"` 로 끝납니다(그때까지의 출력은 `onOutput` 으로 이미 받은 것).

### 1-4. 실험실 화면 참고

`engine/wwwroot/lab.js` 가 위 API 로 만든 실제 화면입니다(진행률 막대, 실행/중지 버튼, 실시간 출력, 오류 줄 클릭 이동).

---

## 2. 데스크톱 .NET 에서 쓰기

```xml
<!-- 내 프로젝트 .csproj -->
<Import Project="경로/csharp-lab/engine/LabRefs.props" />   <!-- 학습자 코드용 참조 어셈블리 포함 -->
<ItemGroup>
  <Compile Include="경로/csharp-lab/engine/Core/*.cs" LinkBase="CsEngine" />
  <PackageReference Include="Microsoft.CodeAnalysis.CSharp" Version="4.14.0" />
</ItemGroup>
```

```csharp
using CsEngine;

RunResult r = await Engine.RunAsync("Console.WriteLine(1 + 2);", stdin: "");
Console.WriteLine(r.Status);   // ok
Console.WriteLine(r.Stdout);   // 3
string json = Engine.ToJson(r); // 브라우저와 같은 JSON
```

- `tests/EngineTests` 가 이렇게 쓰는 예입니다(`qa/cases.json` 을 돌려 기대값 비교).
- .NET 10 SDK 필요(`LabRefs.props` 가 SDK 안의 참조 팩 경로를 씀).
- 실행 중 콘솔 출력은 엔진이 잠시 가로챕니다(`Console.SetOut`). 실행이 끝나면 원래대로 돌려놓습니다. 동시에 두 개를 돌리지 마세요(콘솔이 프로세스 전체 공유).

---

## 3. 학습자 코드에서 되는 것 / 안 되는 것

**된다**
- C# 13 문법 전체: 최상위 문장, 클래스·구조체·record·enum·인터페이스·제네릭·람다·패턴 매칭·`switch` 식·튜플·`yield`·`async/await`(`Task.Delay` 포함)
- 고전적인 `class Program { static void Main(string[] args) }` 도 됨
- 기본 using: `System`, `System.Collections.Generic`, `System.IO`, `System.Linq`, `System.Text`, `System.Threading`, `System.Threading.Tasks` (콘솔 앱과 같음)
- 라이브러리(참조 어셈블리 12개, `engine/LabRefs.props`): 기본 타입·컬렉션(List, Dictionary, HashSet, Queue, Stack, PriorityQueue, LinkedList, Sorted*, Concurrent*, ObservableCollection)·LINQ·문자열·StringBuilder·정규식·BigInteger·Span·Math·Random·DateTime·TimeSpan·Stopwatch·MemoryStream·예외 전부
- `Console.ReadLine()` — `run(code, stdin)` 의 stdin 을 한 줄씩 읽음. 다 읽으면 `null`

**안 된다** (컴파일 오류 또는 실행 오류로 안내됨)
- 파일·네트워크(`File`, `HttpClient`), 리플렉션 내보내기, `unsafe`, 스레드 직접 만들기
- `Console.ReadKey`, `Console.Clear`, 색상 변경(브라우저 콘솔에 없음 → 실행 오류 「브라우저 환경에서는 지원하지 않는 기능」)
- 실행 중 대화형 입력(미리 준 stdin 만 읽음)

라이브러리를 늘리려면 `docs/DEVELOPMENT.md` 5절.

---

## 4. 결과 형식 (계약 — 다른 프로젝트가 의존함)

`run()`(JS) / `Engine.RunAsync()`(C#) 결과. JS 에서는 camelCase.

| 필드 | 타입 | 뜻 |
|---|---|---|
| `status` | string | `ok` · `compile-error` · `runtime-error` · `stopped`(자동 중단) · `stopped-by-user`(JS 의 stop) · `internal-error` |
| `stdout` | string | 출력 전체 (오류가 나기 전까지 출력된 것 포함) |
| `outputTruncated` | bool | 출력이 상한(10만 자)을 넘어 잘림 |
| `diagnostics` | array | 컴파일 오류·경고 `{severity:'error'|'warning', id:'CS1002', line, column, endLine, endColumn, message}` — 줄·칸은 1부터, 메시지는 한국어 |
| `error` | object\|null | 실행 오류 `{type:'IndexOutOfRangeException', message(원문), friendly(쉬운 한국어 설명), line(학습자 코드 줄, 모르면 null)}` |
| `compileMs` `runMs` `totalMs` | number | 걸린 시간 |
| `emitRetried` | bool | 내부 재시도 여부(진단용) |

`stopped` 일 때 `error.type`: `Timeout`(10초) · `TooDeep`(재귀 2,000단계) · `OutputLimit`(출력 10만 자).

**규칙**: 필드를 지우거나 이름·의미를 바꾸지 않는다. 추가는 괜찮다. 바꿔야 하면 `core/v2/` 새 경로로 낸다.

---

## 5. 보호 장치와 제한값

| 제한 | 값 | 위치 |
|---|---|---|
| 실행 시간 | 10초 | `Engine.TimeLimitMs` |
| 재귀 깊이 | 2,000 | `Engine.MaxDepth` |
| 출력 | 100,000자 | `Engine.MaxOutputChars` |

- 시간·재귀 제한은 컴파일 전에 코드에 감시 호출을 넣어 구현(`GuardRewriter.cs`): 모든 반복문 본문 앞에 `Tick()`, 메서드·로컬 함수·생성자에 `Enter()/Exit()`. 줄바꿈을 넣지 않으므로 **오류 줄 번호는 원본 그대로**.
- 학습자가 `catch` 로 감시 예외를 삼켜도 한번 걸리면 다음 `Tick()` 마다 다시 던져서 결국 멈춥니다.
- 웹에서는 이와 별개로 사용자가 언제든 `stop()` 가능(Worker 종료).

---

## 6. 이 저장소에서 다른 C# 작업에 가져갈 만한 것

| 필요한 것 | 볼 곳 |
|---|---|
| 런타임에 C# 코드 컴파일·실행 (Roslyn) | `engine/Core/Engine.cs` (`MakeCompilation`, Emit, `Assembly.Load`, 진입점 찾기) |
| 컴파일 전 코드 변형 (문법 트리 재작성) | `engine/Core/GuardRewriter.cs` |
| 실행 오류 → 원본 줄 번호 (PDB 시퀀스 포인트) | `Engine.FindUserLine` |
| 브라우저에서 .NET 돌리기 (Blazor 없이, Web Worker) | `engine/CsEngine.csproj`, `engine/Browser/Exports.cs`, `engine/wwwroot/core/engine-worker.js` |
| WebAssembly 용량 줄이기 (트리밍 + 루트 지정 + 참조 어셈블리 골라 넣기 + brotli) | `CsEngine.csproj`, `LabRefs.props`, `docs/PITFALLS.md` |
| 브라우저 .NET 함정 모음 | `docs/PITFALLS.md` |
| 외부 패키지 없이 헤드리스 크롬 자동 검사 | `qa/browser/cdp.js`, `qa/browser/qa.js` |
| GitHub Actions 로 빌드만 하고 QA 후 수동 배포 | `.github/workflows/build.yml`, `deploy.yml` |
