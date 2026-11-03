# 📖 찾아볼 때 — 레퍼런스

「어디 있지?」, 「이 함수 뭐 받지?」, 「결과에 뭐가 들어 있지?」를 찾는 문서입니다.
무언가를 **새로 넣을 땐** [ADD.md](ADD.md), **고치거나 관리할 땐** [MAINTAIN.md](MAINTAIN.md).

목차: 1 색인 · 2 웹 API · 3 데스크톱 API · **4 결과 형식(계약)** · 5 지원 범위 · 6 제한값 · 7 Worker 메시지 · 8 설정값·산출물 · 9 용어 · 10 자주 묻는 것

---

## 1. 색인 — 하고 싶은 것 → 어디

| 하고 싶은 것 / 찾는 것 | 파일 | 함수·위치 |
|---|---|---|
| C# 코드 컴파일·실행 (엔진 입구) | `engine/Core/Engine.cs` | `RunAsync`, `Run`(JSON), `RunCore` |
| 컴파일 옵션(언어 버전, using, 경고) | `engine/Core/Engine.cs` | `ParseOptions`, `GlobalUsingsSource`, `MakeCompilation` |
| 학습자 코드가 볼 수 있는 라이브러리 | `engine/LabRefs.props` | `LabRefName` 목록 |
| 실행 때 남겨 둘 라이브러리 구현(트리밍 제외) | `engine/CsEngine.csproj` | `TrimmerRootAssembly` |
| 무한 반복·재귀 감시 코드 삽입 | `engine/Core/GuardRewriter.cs` | `Visit*Statement`, `WrapDepth` |
| 감시기 본체(시간·깊이 검사) | `engine/Core/Engine.cs` | `GuardSource`(`__LabGuard` 클래스 문자열) |
| 제한값(10초·2,000단계·10만 자) | `engine/Core/Engine.cs` | `TimeLimitMs`, `MaxDepth`, `MaxOutputChars` |
| 콘솔 출력 받기·상한·실시간 전송 | `engine/Core/CappedWriter.cs` | `Check`, `Pump` |
| 콘솔 입력(ReadLine) 연결 | `engine/Core/Engine.cs` | `SetConsoleIn` |
| async Main / 최상위 await 처리 | `engine/Core/Engine.cs` | `ResolveAsyncEntry` |
| 실행 오류 쉬운 설명 문구 | `engine/Core/Engine.cs` | `Describe` (예외 종류별 switch) |
| 실행 오류 줄 번호 계산 | `engine/Core/Engine.cs` | `FindUserLine` |
| 컴파일 오류 한국어 메시지·줄 번호 | `engine/Core/Engine.cs` | `ToInfo` |
| 결과 모양(필드) | `engine/Core/RunResult.cs` | `RunResult`, `DiagnosticInfo`, `ErrorInfo` |
| JS 에서 부르는 .NET 함수 | `engine/Browser/Exports.cs` | `[JSExport]` 4개 |
| 페이지에서 엔진 쓰는 모듈 | `engine/wwwroot/core/cs-engine.js` | `createCsEngine` |
| Worker(런타임 시작·압축 풀기·대기열) | `engine/wwwroot/core/engine-worker.js` | `boot`, `loadResource`, `enqueue` |
| 실험실 화면 동작 | `engine/wwwroot/lab.js` | `run`, `render`, 엔진 콜백 |
| 실험실 예제 | `engine/wwwroot/examples.js` | `LAB_EXAMPLES` |
| 테스트 케이스 | `qa/cases.json` | 항목별 `expect` |
| 데스크톱 테스트 실행기 | `tests/EngineTests/Program.cs` | `Check` |
| 브라우저 QA | `qa/browser/qa.js` | `mark(...)` 항목들 |
| 빌드·용량 기록·결과물 저장 | `.github/workflows/build.yml` | |
| 배포 | `.github/workflows/deploy.yml`, `tools/deploy.sh` | |
| 검증된 기능 목록 | `FEATURES.md` | ✅ 표 |
| 겪었던 문제와 해결 | `docs/PITFALLS.md` | 증상으로 검색 |

---

## 2. 웹 API — `core/cs-engine.js`

```js
import { createCsEngine } from "/csharp-lab/core/cs-engine.js";   // 같은 사이트(jihoon380462.github.io) 안에서
const engine = createCsEngine(options);
```

| options | 언제 불림 | 받는 값 |
|---|---|---|
| `onProgress(p)` | 내려받는 중 (자주) | `{ ratio: 0~0.99, bytes, files, enc: 'br'|'gz'|null }` |
| `onReady(info)` | 실행 가능해짐 (재시작 때도) | `{ version, loadMs, diag, enc, bytes, files }` |
| `onWarm(ms)` | 컴파일러 예열 끝 | 걸린 ms |
| `onOutput(chunk)` | 실행 중 출력 조각 (약 0.1초마다) | 문자열 |
| `onState(s)` | 상태 변화 | `loading · ready · running · restarting · failed` |
| `onError(msg)` | 엔진 로딩 실패 | 문자열 |

| 메서드·속성 | 설명 |
|---|---|
| `engine.run(code, stdin = "")` → `Promise<결과>` | 컴파일·실행. 연달아 불러도 순서대로. 로딩 중에 불러도 됨. 결과는 4절 |
| `engine.stop()` | 실행 중이면 즉시 중지(Worker 종료) → 진행 중 `run` 은 `stopped-by-user` → 엔진 자동 재시작 |
| `engine.state` | 현재 상태 문자열 |
| `engine.info` | 마지막 `onReady` 값 + `warmMs` |

- Worker 는 같은 출처에서만 생성 가능 → 다른 도메인은 `build-output` 을 통째로 복사해 올려 쓴다.
- `<script type="module">` 에서만 import 가능.

---

## 3. 데스크톱 API — `CsEngine.Engine` (engine/Core)

프로젝트에 넣는 법:
```xml
<Import Project="경로/csharp-lab/engine/LabRefs.props" />
<ItemGroup>
  <Compile Include="경로/csharp-lab/engine/Core/*.cs" LinkBase="CsEngine" />
  <PackageReference Include="Microsoft.CodeAnalysis.CSharp" Version="4.14.0" />
</ItemGroup>
```
.NET 10 SDK 필요. 예: `tests/EngineTests/EngineTests.csproj`.

| 멤버 | 설명 |
|---|---|
| `Task<RunResult> RunAsync(string code, string? stdin = "")` | 컴파일·실행, 결과 객체 |
| `Task<string> Run(string code, string? stdin)` | 같은 일, JSON 문자열(브라우저용) |
| `string ToJson(RunResult)` | 결과 → JSON (camelCase) |
| `Task<string> Warmup()` | 작은 코드 한 번 컴파일(첫 컴파일 지연 줄이기), ms 문자열 |
| `string GetVersion()` / `EngineVersion` | 엔진 버전 |
| `string Diagnose()` | 진단 문자열(문화권, 한국어 리소스 여부) |
| `Action<string>? OutputSink` | 실행 중 출력 조각을 받을 곳(없으면 끝에 한 번에) |
| `TimeLimitMs` `MaxDepth` `MaxOutputChars` | 제한값 상수 (6절) |

```csharp
RunResult r = await Engine.RunAsync("Console.WriteLine(1 + 2);");
// r.Status == "ok", r.Stdout == "3\n"
```

- 실행하는 동안 `Console.Out/Error/In` 을 바꿔 끼운다(끝나면 복원). 동시에 두 개 돌리지 않는다.

---

## 4. 결과 형식 (계약 — 다른 프로젝트가 의존)

JS 는 camelCase, C# 은 PascalCase.

| 필드 | 타입 | 뜻 |
|---|---|---|
| `status` | string | `ok` · `compile-error` · `runtime-error` · `stopped`(자동 중단) · `stopped-by-user`(JS stop) · `internal-error` |
| `stdout` | string | 출력 전체 (오류 직전까지 포함) |
| `outputTruncated` | bool | 출력 상한으로 잘림 |
| `diagnostics` | 배열 | 컴파일 오류·경고 `{severity:'error'|'warning', id:'CS1002', line, column, endLine, endColumn, message}` (1부터, 한국어). 오류 먼저, 최대 30개 |
| `error` | 객체 또는 null | 실행 오류 `{type, message(원문), friendly(쉬운 한국어), line(학습자 코드 줄, 모르면 null)}` |
| `compileMs` `runMs` `totalMs` | number | 시간 |
| `emitRetried` | bool | 내부 재시도 여부 (PITFALLS 3) |

`stopped` 일 때 `error.type`: `Timeout` · `TooDeep` · `OutputLimit`. 이때도 `line` 이 나올 수 있다(멈춘 반복문·메서드 위치).

**규칙**: 필드를 지우거나 이름·의미를 바꾸지 않는다. 추가는 괜찮다. 깨야 하면 `core/v2/` 새 경로(→ MAINTAIN.md 4절).

---

## 5. 지원 범위 (학습자 코드)

**된다**: C# 13 문법 전체(최상위 문장, 클래스·struct·record·enum·인터페이스·제네릭·람다·패턴·switch 식·튜플·yield·async/await), 고전 `static void Main(string[] args)`, 기본 using 7개(`System`, `System.Collections.Generic`, `System.IO`, `System.Linq`, `System.Text`, `System.Threading`, `System.Threading.Tasks`), `Console.ReadLine`(stdin 한 줄씩, 다 읽으면 null).

**라이브러리(참조 12개, `LabRefs.props`)**: System.Runtime · Collections · Collections.Concurrent · Console · Linq · Memory · ObjectModel · Runtime.Numerics · Text.RegularExpressions · Threading · Threading.Tasks · Runtime.Extensions
→ 기본 타입, List/Dictionary/HashSet/Queue/Stack/PriorityQueue/LinkedList/Sorted*/Concurrent*/ObservableCollection, LINQ, StringBuilder, Regex, BigInteger, Span, Math, Random, DateTime, TimeSpan, Stopwatch, MemoryStream, 예외 전부.

**안 된다**: 파일·네트워크(`File`, `HttpClient` → 컴파일 오류), `unsafe`, 스레드 직접 생성, `Console.ReadKey/Clear/색상`(실행 오류 「브라우저 환경에서는 지원하지 않는 기능」), 실행 중 대화형 입력.

---

## 6. 제한값

| 제한 | 값 | 상수 | 넘으면 |
|---|---|---|---|
| 실행 시간 | 10초 | `TimeLimitMs` | `stopped` / `Timeout` |
| 재귀 깊이 | 2,000 | `MaxDepth` | `stopped` / `TooDeep` |
| 출력 | 100,000자 | `MaxOutputChars` | `stopped` / `OutputLimit`, `outputTruncated` |
| 진단 개수 | 30 | `RunCore` 의 `Take(30)` | 나머지 생략 |

감시는 반복문 본문 앞 `Tick()`, 메서드·로컬 함수·생성자의 `Enter()/Exit()` (줄바꿈 없이 삽입 → 줄 번호 보존). `catch` 로 삼켜도 계속 다시 던짐.

---

## 7. Worker 메시지 (cs-engine.js ↔ engine-worker.js)

| 방향 | `type` | 내용 |
|---|---|---|
| 페이지 → Worker | `run` | `{ id, code, stdin }` |
| Worker → 페이지 | `progress` | `{ bytes, files, enc }` |
| | `ready` | `{ version, loadMs, diag, enc, bytes, files }` |
| | `warm` | `{ ms }` |
| | `output` | `{ chunk }` |
| | `result` | `{ id, json }` (json = 4절 결과 문자열) |
| | `error` | `{ message }` (부팅 실패) |

중지는 메시지가 아니라 `worker.terminate()`.

---

## 8. 설정값·산출물

| 이름 | 위치 | 값·뜻 |
|---|---|---|
| 대상 프레임워크 | `CsEngine.csproj` | `net10.0`, SDK `Microsoft.NET.Sdk.WebAssembly` |
| Roslyn | `CsEngine.csproj`, 테스트 csproj | `Microsoft.CodeAnalysis.CSharp 4.14.0` (둘 다 같게) |
| 언어 버전 | `Engine.cs` `ParseOptions` | C# 13 |
| 문화권 | csproj `InvariantGlobalization=false`, `SatelliteResourceLanguages=ko`, worker `withApplicationCulture('ko')` | 한국어 메시지 |
| 트리밍 | csproj `PublishTrimmed=true`, `TrimMode=full` + `TrimmerRootAssembly` | |
| `lab-size.json` | 빌드 결과 루트 | `{gzBytes, brBytes}` — 진행률 분모 |
| `BUILD_INFO.txt` | 빌드 결과 루트 | 커밋·시각·테스트 결과·용량·큰 파일·파일 목록 |
| `TEST_RESULT.txt` | 빌드 결과 루트 | 데스크톱 테스트 출력 |
| `build-output` 브랜치 | GitHub | 마지막 빌드 결과물 (QA·배포 입력) |
| 배포 주소 | | https://jihoon380462.github.io/csharp-lab/ |

---

## 9. 용어

| 용어 | 뜻 |
|---|---|
| Roslyn | C# 컴파일러 라이브러리(`Microsoft.CodeAnalysis`). 코드 → 문법 트리 → 진단 → 실행 파일(PE) |
| 참조 어셈블리 | 컴파일할 때만 보는 「타입 목록」 파일. 실행 코드는 없음 |
| 트리밍 | 빌드 때 안 쓰는 코드를 지워 용량 줄이기. 학습자 코드가 쓸 것은 루트로 지정해 남김 |
| facade(형식 전달) | 「이 타입은 저 어셈블리에 있다」만 적힌 어셈블리(예 System.Runtime) |
| webcil | .NET WebAssembly 가 쓰는 어셈블리 포장 형식(.wasm 확장자) |
| PDB / 시퀀스 포인트 | 디버그 정보 / IL 위치 ↔ 소스 줄 대응표. 실행 오류 줄 번호 계산에 씀 |
| Web Worker | 브라우저의 백그라운드 스레드. 여기서 엔진이 돌아 화면이 안 멈춤 |
| 예열(Warmup) | 첫 컴파일이 느려서 로딩 직후 작은 코드를 미리 한 번 컴파일하는 것 |
| build-output | CI 가 빌드 결과를 올려 두는 브랜치. QA 와 배포가 같은 파일을 씀 |

---

## 10. 자주 묻는 것

- **폰에서 얼마나 걸리나?** v0.1(14MB) 실측 첫 방문 약 6초. v0.2 는 8.4MB + 예열을 뒤로 → 더 짧아야 정상(실측 필요).
- **엔진 버전 확인?** 실험실 화면 맨 위 `vX.Y.Z`, 또는 `onReady(info).version`.
- **오류 메시지가 영어로 나온다?** 한국어 리소스가 안 올라온 것 → `info.diag` 에 `ko=…이 필요합니다` 가 있는지 확인 (MAINTAIN.md 3절).
- **다른 도메인/오프라인에서 쓰려면?** `build-output` 브랜치 전체를 그대로 복사해 정적 호스팅.
