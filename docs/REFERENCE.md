# 📖 찾아볼 때 — 레퍼런스

「어디 있지?」, 「이 함수 뭐 받지?」, 「결과에 뭐가 들어 있지?」를 찾는 문서입니다.
무언가를 **새로 넣을 땐** [ADD.md](ADD.md), **고치거나 관리할 땐** [MAINTAIN.md](MAINTAIN.md).

목차: 1 색인 · 2 웹 API(엔진·편집기·기호 칩·클래스 다이어그램) · 3 데스크톱 API · **4 결과 형식(계약)** · 5 지원 범위 · 5-1 Unity 모드 · 6 제한값 · 7 Worker 메시지 · 8 설정값·산출물 · 9 용어 · 10 자주 묻는 것

---

## 1. 색인 — 하고 싶은 것 → 어디

| 하고 싶은 것 / 찾는 것 | 파일 | 함수·위치 |
|---|---|---|
| C# 코드 컴파일·실행 (엔진 입구) | `engine/Core/Engine.cs` | `RunAsync`, `Run`(JSON), `RunWith` → `CompileAsync` + `ExecuteAsync` |
| 여러 파일 / 채점 / 진단만 / Unity 모드 | `engine/Core/Engine.cs` | `RunFilesAsync`, `GradeAsync`, `Check`, `RunUnityAsync` |
| 진단 모으기(파일별·라이브러리 오류만·줄 보정) | `engine/Core/Engine.cs` | `CollectDiagnostics` |
| 출력 비교 규칙 | `engine/Core/Engine.cs` | `NormalizeOutput` |
| Unity 흉내 라이브러리(UnityEngine API·프레임 루프) | `engine/Core/Libraries/UnityLite.csx` | `namespace UnityEngine`, `UnityLiteHost.Main` |
| 코드 편집기(색칠·밑줄·줄 번호) | `engine/wwwroot/core/code-editor.js` | `createCodeEditor`, `highlightCSharp` |
| 폰 기호 칩 | `engine/wwwroot/core/symbol-bar.js` | `createSymbolBar`, `DEFAULT_SYMBOLS` |
| 실험 페이지(채점·Unity)·공용 부팅 | `engine/wwwroot/labs/` | `grading/`, `unity/`, `shared/boot.js` |
| 엔진 API 테스트 케이스 | `qa/api-cases.json` | `kind`: runFiles · grade · check · unity · analyze |
| 구조 분석(타입·멤버·관계·문법 사용·호출) | `engine/Core/Analyzer.cs` | `Engine.Analyze`, `StructureAnalyzer.Fill` |
| 구조 규칙 평가 | `engine/Core/Analyzer.cs` | `StructureAnalyzer.Evaluate`, `Match`, `MatchRelation` |
| 구조 분석 결과·규칙 모양 | `engine/Core/RunResult.cs` | `AnalyzeResult`, `TypeModel`, `RelationModel`, `StructureRule`, `TypeFilter` |
| 클래스 다이어그램 그리기 | `engine/wwwroot/core/class-diagram.js` | `renderClassDiagram`, `classDiagramLegend`, `layout` |
| 디자인 패턴 24개 (코드·기대 출력·구조 규칙) | `engine/wwwroot/labs/patterns/patterns.json` ← `tools/data/make_patterns.py` 로 생성 | |
| 디자인 패턴 실험 페이지 | `engine/wwwroot/labs/patterns/` | `patterns.js` (`analyze`·`grade`) |
| Unity 게임 패턴 예제(풀·상태 머신·이벤트 버스·컴포넌트) | `engine/wwwroot/labs/unity/unity.js` | `EXAMPLES` 의 `pool` `fsm` `bus` `components` |
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
| `onOutput(chunk)` | 실행 중 출력 조각 (첫 출력은 바로, 이후 약 0.1초마다) | 문자열 |
| `onFrame(scene)` | Unity 실시간 모드: 프레임마다 | 장면 문자열 (4절 끝) |
| `onState(s)` | 상태 변화 | `loading · ready · running · restarting · failed` |
| `onError(msg)` | 엔진 로딩 실패 | 문자열 |

| 메서드·속성 | 설명 |
|---|---|
| `engine.run(code, stdin = "")` → `Promise<RunResult>` | 컴파일·실행. 연달아 불러도 순서대로. 로딩 중에 불러도 됨 |
| `engine.runFiles([{name, code}], stdin)` → `Promise<RunResult>` | 여러 파일 함께. 최상위 문장·Main 은 한 파일에만 |
| `engine.grade(files, [{stdin, expect}])` → `Promise<GradeResult>` | 컴파일 1번, 테스트마다 새로 실행·비교. `files` 에 문자열을 주면 `Program.cs` 하나 |
| `engine.check(codeOrFiles, mode = "console")` → `Promise<CheckResult>` | 진단만(실행 안 함). 대기열을 거치지 않아 실행 중에도 응답. `mode: "unity"` 는 UnityLite 포함 |
| `engine.analyze(codeOrFiles, rules = null, mode = "console")` → `Promise<AnalyzeResult>` | 구조 분석(실행 안 함, 대기열 우회). `rules` 를 주면 구조 규칙 채점(4-1절) |
| `engine.runUnity(code, {live, frames, inputScript, fixedDelta, seed})` → `Promise<RunResult>` | Unity 모드(5-1절). `live:true` 면 중지할 때까지 안 끝남 |
| `engine.setInput(["LeftArrow","Space"])` | Unity 실시간 모드: 지금 눌린 키(KeyCode 이름) |
| `engine.stop()` | 실행 중이면 즉시 중지(Worker 종료) → 진행 중 `run` 은 `stopped-by-user` → 엔진 자동 재시작 |
| `engine.state` | 현재 상태 문자열 |
| `engine.info` | 마지막 `onReady` 값 + `warmMs` |

- Worker 는 같은 출처에서만 생성 가능 → 다른 도메인은 `build-output` 을 통째로 복사해 올려 쓴다.
- `<script type="module">` 에서만 import 가능.

### 2-1. 편집기 — `core/code-editor.js`

```js
import { createCodeEditor } from "/csharp-lab/core/code-editor.js";
const ed = createCodeEditor(hostDiv, { value, onChange(code) {}, onRun() {}, id: "code", gutterId: "gutter", label: "C# 코드" });
```

| 멤버 | 설명 |
|---|---|
| `ed.value` (읽기/쓰기) | 코드. 쓰면 밑줄은 지워짐 |
| `ed.setDiagnostics(list)` | `[{severity:'error'|'warning', line, column, endLine, endColumn, message}]` → 물결 밑줄 + 줄 번호 색 + 줄 번호에 마우스 올리면 메시지 |
| `ed.selectLine(n)` / `ed.focus()` | 줄 선택·스크롤 / 포커스 |
| `ed.insert(text, back)` | 커서 자리에 넣기(실행 취소 가능), `back` 만큼 커서를 뒤로 |
| `ed.textarea` / `ed.el` | 내부 textarea / 바깥 요소 |

- **높이는 host 에 정한다**(예 `.editor { height: 280px }`). 편집기 CSS 는 처음 만들 때 `<style>` 로 자동으로 들어감. 색은 `--cse-*` CSS 변수로 바꿀 수 있음.
- 키: Tab(4칸·여러 줄 들여쓰기), Shift+Tab(내어쓰기), Enter(들여쓰기 유지, `{` 뒤 한 칸 더, `{|}` 사이면 블록 펼침), 빈 줄에서 `}` 는 한 단계 내어쓰기, Ctrl/Cmd+Enter = `onRun`.
- 실시간 검사 붙이기: `onChange` 에서 0.45초 쉬면 `engine.check(code)` → 코드가 그대로면 `ed.setDiagnostics(결과.diagnostics)` (실험실 `lab.js` 의 `scheduleCheck`).

### 2-2. 폰 기호 칩 — `core/symbol-bar.js`

```js
import { createSymbolBar } from "/csharp-lab/core/symbol-bar.js";
createSymbolBar(barDiv, ed, { symbols /* 생략하면 DEFAULT_SYMBOLS */, always: false });
```

- 칩: `;` `{ }` `( )` `" "` `[ ]` `< >` `=` `==` `=>` `.` `,` `$"{}"` `+` `++` `&&` `||` `!` `'` `Tab` `◀` `▶`. 짝 기호는 커서를 가운데에, 선택한 글자가 있으면 감쌈.
- 누를 때 포커스를 뺏지 않아 폰 키보드가 내려가지 않음.
- 마우스 기기(`hover:hover` + `pointer:fine`)에서는 숨김. `always:true` 면 항상 보임.
- 항목 모양: `{label, text, back}` 또는 `{label, open, close}` 또는 `{label, move: ±1}`.

### 2-3. 클래스 다이어그램 — `core/class-diagram.js`

```js
import { renderClassDiagram, classDiagramLegend } from "/csharp-lab/core/class-diagram.js";
const r = await engine.analyze(code);                       // 구조 분석 결과
const d = renderClassDiagram(hostDiv, r, { onSelect: (t) => ed.selectLine(t.line) });
legendDiv.innerHTML = classDiagramLegend();
```

| 옵션 | 뜻 |
|---|---|
| `members` | `"auto"`(기본: 화면에 다 들어가면 멤버까지, 넘치면 이름만) · `true` · `false` |
| `onSelect(type)` | 상자를 누르면 (type.line 으로 편집기 이동 등) |
| `minWidth` | 이보다 좁게 줄이지 않고 가로 스크롤 (기본 560) |
| `emptyText` | 타입이 없을 때 문구 |

- 돌려주는 값: `{ boxes:[{name,x,y,w,h}], edges:[{from,to,kind,d}], width, height, members, compact }` — QA 가 겹침·선 검사에 씀.
- 배치: 부모(상속·구현 대상)가 위, 자식이 아래. 계층에 안 걸린 타입은 자기를 품는(has·creates) 타입 아래 줄. 줄 안 순서는 이웃 평균 위치로 다듬음.
- 선: 상속 실선+빈 삼각형, 구현 점선+빈 삼각형, 가짐 실선+빈 마름모(품는 쪽, 여럿이면 `*`), 생성 점선 화살표 «create», 사용 점점선 화살표. 같은 두 타입 사이엔 중요한 것 하나(상속·구현 > 가짐 > 생성 > 사용), 상속이 있으면 사용 선은 생략. 자기 자신 관계는 오른쪽 고리.
- 상자: «interface»·«abstract»·«record»·«enum»·«static» 표시, 추상은 기울임, static 멤버는 밑줄, 접근 `+ - # ~`. 학습자 타입이 아닌 부모·인터페이스는 상자 안에 `▷ 부모` `◁ 인터페이스`.
- 글꼴은 `style="font:..."` 로 넣으므로 글꼴 이름은 작은따옴표(PITFALLS 18).

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
| `Task<RunResult> RunFilesAsync(IReadOnlyList<SourceFile> files, string? stdin = "")` | 여러 파일 |
| `Task<GradeResult> GradeAsync(files, IReadOnlyList<TestCase> tests)` | 채점 |
| `CheckResult Check(files, string? mode = "console")` | 진단만 (동기) |
| `AnalyzeResult Analyze(files, IReadOnlyList<StructureRule>? rules = null, string? mode = "console")` | 구조 분석 + 구조 규칙 (동기) |
| `Task<RunResult> RunUnityAsync(string code, UnityOptions? options)` | Unity 모드 (데스크톱에서는 고정 시간 모드로 쓰면 됨) |
| `string NormalizeOutput(string)` | 출력 비교용 정리 |
| `UnityInputProvider` / `UnityFrameSink` | Unity 실시간 모드 입력·장면 통로 (브라우저가 설정) |
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

진단 항목에는 `file`(어느 파일, 위치 없으면 `""`), 실행 오류에는 `error.file` 도 있다(0.3.0 추가).

**GradeResult** (`grade`): `status`(`ok` 컴파일 성공·테스트 실행함 · `compile-error` · `internal-error` · JS stop 이면 `stopped-by-user`), `diagnostics`, `error`, `tests[]`, `passed`(통과 수), `total`, `compileMs`, `totalMs`
- `tests[i]` = **TestResult**: `status`(RunResult 와 같은 값), `stdout`, `outputTruncated`, `error`, `passed`(expect 가 있으면 true/false, 없으면 null), `runMs`

**CheckResult** (`check`): `diagnostics`, `ms` (+ JS stop/준비 전이면 `stopped`/`notReady`)

**UnityOptions** (`runUnity`): `frames`(0 = 멈출 때까지, 실시간 전용), `live`(true = 약 60fps·실제 시간·화면 입력), `fixedDelta`(고정 모드 `Time.deltaTime`, 기본 1/60), `inputScript`(고정 모드 입력 대본 `"0-59:RightArrow;60:Space+UpArrow"`, 프레임 0부터·양끝 포함), `seed`(고정 모드 `Random` 시드)

### 4-1. 구조 분석 (`analyze`) — AnalyzeResult

| 필드 | 뜻 |
|---|---|
| `status` | `ok` · `compile-error` (오류가 있어도 분석 가능한 만큼 채움. `Main` 없음(CS5001)은 오류로 안 침) |
| `diagnostics` | check 와 같음 |
| `types[]` | **TypeModel** `{name, simpleName, kind(class·interface·record·struct·record struct·enum·delegate), isAbstract, isSealed, isStatic, generic, baseType, interfaces[], container, file, line, members[]}` |
| `types[].members[]` | **MemberModel** `{name, kind(method·constructor·property·field·const·event·value), access(+ - # ~), type, params, isStatic, isAbstract, isVirtual, isOverride, line}` — 컴파일러가 만든 것 제외, record 위치 매개변수 속성은 포함 |
| `relations[]` | **RelationModel** `{from, to, kind, many, via}` — 학습자 타입끼리만. kind: `inherits`(상속·인터페이스 확장) · `implements` · `has`(필드·속성, 주 생성자 매개변수를 메서드에서 쓰면) · `creates`(본문의 new) · `uses`(메서드 매개변수·반환 타입). `many` = 배열·List·Dictionary 등 모음 |
| `features` | 문법 사용 횟수 `{if, switch, for, foreach, while, do, lambda, yield, event, new, try, throw, ternary, lock, linq, pattern, recursion}` (0 이면 빠짐) |
| `calls` | 메서드 호출 횟수 `{메서드이름: 횟수}` |
| `rules[]` · `rulesPassed` · `rulesTotal` | 규칙을 줬을 때: **RuleResult** `{id, text, passed, actual, detail}` (detail 예: 「지금 1개 · 필요: 2개 이상」) |
| `ms` | 걸린 시간 (PC 약 2~150ms) |

### 4-2. 구조 규칙 (StructureRule)

규칙 하나 = `text`(학습자에게 보일 문장) + 아래 중 **하나** + `min`/`max`(생략하면 `min` 1, `max` 만 있으면 `min` 0):

| 종류 | 세는 것 | 예 |
|---|---|---|
| `count: TypeFilter` | 조건에 맞는 타입 수 | `{"text":"구현 클래스 2개 이상인 인터페이스","count":{"kind":"interface","subtypes":2}}` |
| `relation: {from, to, kind}` | 조건에 맞는 관계 수 | `{"text":"Cart 가 IDiscount 를 품음","relation":{"from":"Cart","to":"IDiscount","kind":"has"}}` |
| `uses: "if"` | 문법 사용 횟수 (`features` 키) | `{"text":"if 없이","uses":"if","max":0}` |
| `calls: "Pop"` | 메서드 호출 횟수 | `{"text":"Pop 으로 꺼내기","calls":"Pop"}` |

**TypeFilter** (모두 AND):

| 키 | 값 | 뜻 |
|---|---|---|
| `kind` | `class`(record 포함) · `interface` · `abstract` · `abstraction`(인터페이스 또는 추상) · `concrete` · `record` · `struct` · `enum` · `static` · `sealed` | 종류 |
| `name` | 이름 | |
| `implements` / `inherits` / `extends` | 이름 | 직접 구현한 인터페이스 / 부모 클래스 / 둘 중 하나. 제네릭은 `IEnumerable` 처럼 `<>` 앞만 써도 됨 |
| `member` (+ `memberKind`) | 이름 | 그 이름의 멤버가 있음 (`memberKind`: method·property·field·event·constructor) |
| `privateConstructor` | true | 생성자가 있고 전부 public/internal 이 아님 |
| `subtypes` | 숫자 | 이 타입을 상속·구현한 학습자 타입이 n개 이상 |
| `has` / `creates` | 이름 · `self` | 그 타입을 품음 / new 함 (`self` = 자기 자신) |
| `returnsSelf` | 숫자 | 자기 타입을 돌려주는 메서드 n개 이상 (메서드 연결) |
| `abstractMembers` | 숫자 | abstract 멤버 n개 이상 |

이름 자리: 정확한 이름 · `"*"`(아무거나, `implements:"*"` = 인터페이스가 하나라도) · `"/정규식/"`. **relation** 의 `kind` 는 `inherits` · `implements` · `extends`(둘 다) · `has` · `creates` · `uses` · `*`, `to:"self"` = 자기 자신.

규칙 예시 묶음은 `tools/data/make_patterns.py` (패턴 24개 × 1~3개).

**장면 문자열** (`onFrame`): 오브젝트마다 한 줄, 탭 구분 `이름 x y 회전z 크기x 크기y 모양(Square|Circle|Triangle) 색(#rrggbbaa) 순서` — 화면 좌표는 Unity 와 같이 y 위쪽, 카메라 세로 10칸(크기 5).

`stopped` 일 때 `error.type`: `Timeout` · `TooDeep` · `OutputLimit`. 이때도 `line` 이 나올 수 있다(멈춘 반복문·메서드 위치).

**규칙**: 필드를 지우거나 이름·의미를 바꾸지 않는다. 추가는 괜찮다. 깨야 하면 `core/v2/` 새 경로(→ MAINTAIN.md 4절).

---

## 5. 지원 범위 (학습자 코드)

**된다**: C# 13 문법 전체(최상위 문장, 클래스·struct·record·enum·인터페이스·제네릭·람다·패턴·switch 식·튜플·yield·async/await), 고전 `static void Main(string[] args)`, 기본 using 7개(`System`, `System.Collections.Generic`, `System.IO`, `System.Linq`, `System.Text`, `System.Threading`, `System.Threading.Tasks`), `Console.ReadLine`(stdin 한 줄씩, 다 읽으면 null).

**라이브러리(참조 12개, `LabRefs.props`)**: System.Runtime · Collections · Collections.Concurrent · Console · Linq · Memory · ObjectModel · Runtime.Numerics · Text.RegularExpressions · Threading · Threading.Tasks · Runtime.Extensions
→ 기본 타입, List/Dictionary/HashSet/Queue/Stack/PriorityQueue/LinkedList/Sorted*/Concurrent*/ObservableCollection, LINQ, StringBuilder, Regex, BigInteger, Span, Math, Random, DateTime, TimeSpan, Stopwatch, MemoryStream, 예외 전부.

**안 된다**: 파일·네트워크(`File`, `HttpClient` → 컴파일 오류), `unsafe`, 스레드 직접 생성, `Console.ReadKey/Clear/색상`(실행 오류 「브라우저 환경에서는 지원하지 않는 기능」), 실행 중 대화형 입력.

### 5-1. Unity 모드 (UnityLite)

학습자 코드와 `UnityLite.cs`(엔진 리소스)를 함께 컴파일하고, `UnityLiteHost.Main` 이 프레임 루프를 돈다.

| 항목 | 내용 |
|---|---|
| 기본 using | `UnityEngine`, `System.Collections.Generic`, `System.Linq` (`System` 은 없음 — 넣으면 `Random`·`Object` 가 겹치는 것도 실제 Unity 와 같음) |
| 장면 시작 | **MonoBehaviour 클래스마다 오브젝트 하나 자동 생성**(이름 = 클래스 이름). `[Prefab]`(시뮬레이터 전용) 붙인 클래스·추상 클래스는 제외 |
| 호출 순서 | `Awake`(AddComponent 때) → 다음 프레임 시작에 `Start` → 매 프레임 `Update` → `LateUpdate` → 프레임 끝에 `Destroy` 처리(`OnDestroy`) |
| 지원 API | `MonoBehaviour`(`print`), `GameObject`(`new GameObject(이름)`, `AddComponent<T>`, `GetComponent<T>`, `SetActive`, `Find`, `FindGameObjectsWithTag`, `tag`), `Component`(`transform`, `gameObject`, `name`, `GetComponent`), `Object.Destroy`·`FindObjectOfType(s)`, `Transform`(`position`, `localScale`, `eulerAngles`, `Translate`(Self/World), `Rotate`, `right`, `up`, `LookAt2D`), `SpriteRenderer`(`color`, `shape`*, `sortingOrder`), `Vector2`/`Vector3`(연산자·`magnitude`·`normalized`·`Distance`·`Dot`·`Lerp`·`MoveTowards`), `Color`, `Mathf`(삼각함수·`Clamp`·`Lerp`·`Round` 등), `Time`(`deltaTime`·`time`·`frameCount`·`timeScale`), `Input`(`GetKey`/`GetKeyDown`/`GetKeyUp`·`GetAxis`/`GetAxisRaw` Horizontal·Vertical·`anyKey`), `KeyCode`(방향키·Space·A–Z·숫자 등), `Random`(`Range` 정수/실수·`value`·`insideUnitCircle`·`InitState`), `Debug.Log/LogWarning/LogError` |
| 실제 Unity 와 다른 점 | 2D 화면만(z 무시), 물리·충돌·코루틴·UI 없음, 그림 대신 모양(`shape`*), `GetAxis` 가 부드럽게 변하지 않음(-1·0·1), Update 에서 오류가 나면 실행을 멈춤 |
| 제한 | 프레임 하나(Update 한 번)가 2초를 넘으면 `stopped`/`Timeout`. 고정 모드 프레임 수 최대 20,000 |
| 최상위 문장 | 쓰면 컴파일 오류 `LAB002`(프레임 루프가 실행되지 않으므로) |

`*` 시뮬레이터 전용 API.

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
| | `runFiles` | `{ id, files, stdin }` |
| | `grade` | `{ id, files, tests }` |
| | `check` | `{ id, files, mode }` — 대기열 우회, 바로 응답 |
| | `analyze` | `{ id, files, rules, mode }` — 대기열 우회, 바로 응답 |
| | `runUnity` | `{ id, code, options }` |
| | `input` | `{ keys }` — Unity 실시간 입력 (응답 없음) |
| Worker → 페이지 | `progress` | `{ bytes, files, enc }` |
| | `ready` | `{ version, loadMs, diag, enc, bytes, files }` |
| | `warm` | `{ ms }` |
| | `output` | `{ chunk }` |
| | `frame` | `{ scene }` (Unity 실시간) |
| | `result` | `{ id, json }` (json = 4절 결과 문자열: RunResult · GradeResult · CheckResult · AnalyzeResult) |
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
| UnityLite | 이 엔진의 Unity 흉내 라이브러리(`Core/Libraries/UnityLite.csx`). Unity 모드에서 학습자 코드와 함께 컴파일됨 |
| 구조 분석·구조 규칙 | 실행하지 않고 코드 모양(타입·관계·문법)을 뽑아, 「인터페이스를 구현한 클래스 2개 이상」 같은 조건으로 채점하는 것 |
| 채점 파일(하네스) | 학습자에게 숨기고 같이 컴파일하는 파일(예 `Tests.cs`). 입력을 읽어 학습자 메서드를 부르고 출력 |
| build-output | CI 가 빌드 결과를 올려 두는 브랜치. QA 와 배포가 같은 파일을 씀 |

---

## 10. 자주 묻는 것

- **폰에서 얼마나 걸리나?** v0.1(14MB) 실측 첫 방문 약 6초. v0.2 는 8.4MB + 예열을 뒤로 → 더 짧아야 정상(실측 필요).
- **엔진 버전 확인?** 실험실 화면 맨 위 `vX.Y.Z`, 또는 `onReady(info).version`.
- **오류 메시지가 영어로 나온다?** 한국어 리소스가 안 올라온 것 → `info.diag` 에 `ko=…이 필요합니다` 가 있는지 확인 (MAINTAIN.md 3절).
- **다른 도메인/오프라인에서 쓰려면?** `build-output` 브랜치 전체를 그대로 복사해 정적 호스팅.
