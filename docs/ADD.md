# ➕ 추가할 때 — 새 기능·케이스·라이브러리·예제 넣기

무엇을 넣든 순서는 같습니다: **실험(labs) → 케이스·QA → 검증 → 모음(FEATURES.md ✅) → 배포**.
위치를 찾을 땐 [REFERENCE.md](REFERENCE.md) 1절 색인, 고치거나 문제가 생기면 [MAINTAIN.md](MAINTAIN.md).

## 0. 공통 체크리스트 (무엇을 추가하든 끝에)

- [ ] `qa/cases.json`(코드 하나) 또는 `qa/api-cases.json`(여러 파일·채점·진단·Unity)에 케이스 추가 (엔진 동작이면 필수) — 1절, 10절
- [ ] 브라우저 전용 동작이면 `qa/browser/qa.js` 에 `mark(...)` 추가 — 7절
- [ ] 결과 모양(REFERENCE 4절)을 **지우거나 바꾸지 않았다** (추가만)
- [ ] `tools/ship.sh` → CI 데스크톱 테스트 통과 → 브라우저 QA `all` 실패 0 → 스크린샷 눈으로 확인
- [ ] 버전 올림 + `docs/CHANGELOG.md` — 15절
- [ ] 검증 끝난 것은 `FEATURES.md` ✅ 표에 — 8절
- [ ] `tools/deploy.sh`

---

## 1. 테스트 케이스 추가

`qa/cases.json` 에 항목 하나. 데스크톱(CI)과 브라우저 QA 가 둘 다 자동으로 돌린다.

```json
{ "id": "list-remove",
  "code": "var xs = new List<int>{1,2,3};\nxs.Remove(2);\nConsole.WriteLine(string.Join(\",\", xs));",
  "stdin": "",
  "expect": { "status": "ok", "stdoutEquals": "1,3\n" } }
```

`expect` 에 쓸 수 있는 것: `status` · `stdoutEquals`(전체 비교, 줄바꿈 `\n`) · `errorType`(예외 이름 또는 Timeout/TooDeep/OutputLimit) · `errorLine`(브라우저는 참고로만) · `diagLines`(컴파일 오류 줄 목록, 오름차순) · `hasWarning`.

- 버그를 고칠 땐 **고치기 전에** 재현 케이스부터 넣는다(실패 확인 → 고침 → 통과).
- 무한 반복 케이스는 10초씩 걸리니 꼭 필요한 것만.

## 2. 실험 기능 추가 (labs)

1. `engine/wwwroot/labs/<이름>/index.html` + `<이름>.js` 를 만든다. 공용 부팅(`../shared/boot.js`)을 쓰면 로딩 막대까지 자동 연결:
   ```html
   <link rel="stylesheet" href="../../lab.css" /><link rel="stylesheet" href="../shared/labs.css" />
   <!-- 로딩 막대: #loader #barFill #loaderPct #loaderText, 버전: #ver (labs/grading/index.html 참고) -->
   <script type="module" src="이름.js"></script>
   ```
   ```js
   import { bootEngine, esc } from "../shared/boot.js";
   import { createCodeEditor } from "../../core/code-editor.js";
   import { createSymbolBar } from "../../core/symbol-bar.js";
   const engine = bootEngine({ onReady() { /* 버튼 켜기 */ }, onOutput(chunk) {} });
   const ed = createCodeEditor(document.getElementById("editorHost"), { id: "code" });
   createSymbolBar(document.getElementById("symbar"), ed);
   ```
   QA 가 상태를 볼 수 있게 `window.__lab`(boot.js 가 `ready`·`warm`·`state`·`engine` 을 채움)에 마지막 결과 등을 넣어 둔다.
2. `FEATURES.md` 「🧪 실험 중」에 한 줄: `- <이름>: 무엇을 확인하려는지 (labs/<이름>/)`.
3. 실험실 메인 화면(`index.html`)에서 링크가 필요하면 하단에 추가.
4. 배포 후 주소: `https://jihoon380462.github.io/csharp-lab/labs/<이름>/`.

## 3. 엔진(.NET) 기능 추가

| 하고 싶은 것 | 고칠 곳 | 주의 |
|---|---|---|
| 결과에 정보 추가 | `Core/RunResult.cs` 에 속성 추가 → `Core/Engine.cs` 에서 채움 | 기존 필드 유지. JSON 은 자동(camelCase 소스 생성) |
| 실행 전 코드 변형 | `Core/GuardRewriter.cs` 같은 `CSharpSyntaxRewriter` | **줄바꿈 trivia 를 넣지 말 것**(줄 번호 보존). 케이스에 `errorLine` 으로 확인 |
| 새 JS 호출 함수 | `Browser/Exports.cs` 에 `[JSExport] public static ...` → `core/engine-worker.js` 의 `onmessage` 에 새 `type` → `core/cs-engine.js` 에 메서드 | 문자열·숫자·bool·`Task<string>` 이 안전. 복잡한 값은 JSON 문자열로 |
| .NET → JS 알림 | `Exports.cs` 에 `[JSImport("globalThis.<이름>")] static partial void ...` + worker 에서 `globalThis.<이름> = ...` | `labPostOutput` 이 예 |
| 컴파일 옵션 | `Engine.cs` `MakeCompilation`, `ParseOptions`, `GlobalUsingsSource` | 바꾸면 기존 케이스 전부 다시 확인 |

- `Core/` 에는 브라우저 의존 코드를 넣지 않는다(데스크톱 테스트가 깨짐). 브라우저 전용은 `Browser/`.
- 브라우저에서만 생기는 문제(단일 스레드·트리밍)는 데스크톱 테스트로 안 잡힌다 → 브라우저 QA 필수. 막고 기다리는 코드(`.Result`, `.Wait()`, `lock` 대기) 금지 — PITFALLS 2·3.

## 4. 학습자용 라이브러리 추가 (예: System.Text.Json)

**두 곳을 짝으로**:
1. `engine/LabRefs.props` → `<LabRefName Include="System.Text.Json" />` (컴파일 때 보임)
2. `engine/CsEngine.csproj` → `<TrimmerRootAssembly Include="System.Text.Json" />` (실행 때 남음)
3. `qa/cases.json` 에 그 라이브러리를 실제로 쓰는 케이스(컴파일 + 실행 결과 확인)
4. 빌드 후 `BUILD_INFO.txt` 에서 용량 증가 확인 → 크면 FEATURES/CHANGELOG 에 적기
5. REFERENCE.md 5절 라이브러리 목록 갱신

참조 어셈블리 이름은 .NET SDK 의 `packs/Microsoft.NETCore.App.Ref/<버전>/ref/net10.0/` 에 있는 파일 이름. 형식 전달(facade)만 있는 이름이면 실제 구현 어셈블리도 루트에 넣는다(PITFALLS 5).

## 5. 실행 오류 쉬운 설명 추가

`Core/Engine.cs` `Describe` 의 `switch` 에 한 줄:
```csharp
NotImplementedException => "아직 만들지 않은 기능을 불렀습니다.",
```
더 구체적인 예외를 위에 둔다(`ArgumentNullException` 이 `ArgumentException` 보다 먼저). 케이스에 `errorType` 으로 확인.

## 6. 실험실 예제 추가

`engine/wwwroot/examples.js` 의 `LAB_EXAMPLES` 에 `{ id, label, kind: 'normal'|'error', code, stdin? }`.
브라우저 QA 가 예제를 전부 실행한다: `normal` 은 `ok`, `error` 는 컴파일·실행 오류·중단 중 하나여야 통과.

## 7. 브라우저 QA 항목 추가

`qa/browser/qa.js` 의 PC 구역(또는 모바일 구역)에:
```js
const v = await page.eval(() => /* 페이지 안에서 확인할 값 */);
mark(조건, "항목 이름", 상세문자열);
```
페이지 상태는 `window.__lab`(`ready`, `warm`, `state`, `lastResult`, `engine`)로 볼 수 있다. 클릭은 `page.eval(() => document.getElementById(...).click())`, 키 입력은 `page.key("Enter", "Enter", 13, 수정키)`(Ctrl=2).

## 8. 검증된 기능을 FEATURES.md 로 옮기기

재사용할 코드를 `engine/wwwroot/core/`(웹) 또는 `engine/Core/`(.NET)로 옮기고 ✅ 표에 한 행:

| 기능 | 위치 | 검증 | 버전 |
|---|---|---|---|
| 무엇을 하는지 한 줄 | 파일·함수 | 어떤 케이스·QA 항목으로, 수치가 있으면 수치 | 처음 들어간 버전 |

「🧪 실험 중」에서 지우고, 사용법이 새로 생기면 REFERENCE.md 2·3절에도.

## 9. 문서 추가

| 내용 | 넣을 곳 |
|---|---|
| 새 API·설정·위치 | REFERENCE.md (해당 절 + 1절 색인) |
| 새 추가 절차 | 이 문서 |
| 새 문제와 해결 | PITFALLS.md (증상 → 원인 → 해결 → 검증) |
| 구조가 바뀜 | ARCHITECTURE.md |
| 다른 세션이 꼭 알아야 할 규칙 | 루트 CLAUDE.md (짧게) |

## 10. 엔진 API 케이스 추가 (`qa/api-cases.json`)

데스크톱 테스트와 브라우저 QA 가 둘 다 돌린다.

```json
{ "id": "grade-예", "kind": "grade",
  "files": [{ "name": "Solution.cs", "code": "..." }, { "name": "Tests.cs", "code": "..." }],
  "tests": [{ "stdin": "1 2", "expect": "3" }],
  "expect": { "status": "ok", "passed": [true], "stdouts": ["3\n"], "passedCount": 1 } }
```

| kind | 입력 필드 | expect 에 쓸 수 있는 것 |
|---|---|---|
| `runFiles` | `files`, `stdin` | 1절과 같음 + `errorFile`, `diagFiles` |
| `grade` | `files`, `tests[{stdin, expect}]` | `status`, `passed`(true/false/null 배열), `stdouts`, `testStatuses`, `passedCount`, `diagLines`, `diagFiles` |
| `check` | `files`, `mode`(console/unity) | `diagLines`, `diagFiles`, `diagIds` (오류만 봄) |
| `unity` | `code`, `options{frames, inputScript}` | 1절과 같음 (`stdoutEquals` 에 Debug.Log 출력) |

## 11. UnityLite(Unity 흉내) API 추가

1. `engine/Core/Libraries/UnityLite.csx` 의 `namespace UnityEngine` 에 실제 Unity 와 **같은 이름·모양**으로 추가(학습자가 나중에 진짜 Unity 에서 그대로 쓸 수 있게). 시뮬레이터 전용이면 주석에 「시뮬레이터 전용」.
2. 이 파일은 학습자 코드와 함께 컴파일된다 → 경고는 숨겨지지만 **오류는 학습자에게 보인다**. 이 파일만의 `using` 은 파일 안에 쓰면 학습자 코드에 영향 없음.
3. 화면에 그릴 게 늘면 `Scene.Snapshot()`(장면 문자열) 과 `labs/unity/unity.js` 의 `parseScene`·`draw` 를 함께 고친다. 장면 문자열 모양은 REFERENCE 4절에 적혀 있으니 같이 갱신.
4. `qa/api-cases.json` 에 `kind: "unity"` 케이스(고정 시간 + `inputScript` 로 결정적 출력) 추가.
5. REFERENCE 5-1절 지원 API 표 갱신.

## 12. 디자인 패턴 추가 (`labs/patterns`)

1. `tools/data/make_patterns.py` 에 `pat(id, 분류, 이름, 영어, 언제, 핵심, 코드, 기대출력, [규칙…])` 하나 추가. 분류는 `생성`·`구조`·`행위`·`설계` 중 하나(새 분류를 쓰면 선택 상자에 새 묶음이 생김).
2. `python3 tools/data/make_patterns.py` → `engine/wwwroot/labs/patterns/patterns.json` 갱신 (이 JSON 을 손으로 고치지 말 것).
3. 코드는 **최상위 문장을 맨 위**에(타입 선언보다 뒤에 오면 컴파일 오류). 기대 출력은 줄마다 `\n`, 마지막 줄도 `\n`.
4. 규칙은 패턴의 「핵심 모양」만 1~3개. 패턴을 안 쓴 버전(예: if 로 짠 것)이 **떨어지는지** 머릿속으로 확인하고, 중요한 반례는 `qa/api-cases.json` 에 `kind:"analyze"` + `rulesPassed` 로 넣는다.
5. 데스크톱 테스트가 패턴마다 「출력 일치 + 규칙 전부 통과」를, 브라우저 QA 가 「분석 성공 + 규칙 통과 + 다이어그램 상자 겹침 없음」을 자동으로 본다.

## 13. 구조 규칙 종류 추가 (TypeFilter 키 등)

1. `engine/Core/RunResult.cs` 의 `TypeFilter`(또는 `StructureRule`·`RelationFilter`)에 속성 추가 — JSON 은 camelCase 로 자동.
2. `engine/Core/Analyzer.cs` 의 `Match`(또는 `MatchRelation`·`Evaluate`)에 조건 추가.
3. 문법 사용 횟수 종류를 늘리려면 `CountFeatures` 의 `switch` 에 문법 노드 한 줄.
4. `qa/api-cases.json` 에 `kind:"analyze"` 케이스(맞는 코드·틀린 코드 둘 다) → REFERENCE 4-2절 표 갱신.

## 14. Unity 예제 추가

`engine/wwwroot/labs/unity/unity.js` 의 `EXAMPLES` 에 `{ id, label, desc, code }` (desc 는 예제 위 설명 줄). 결정적인 출력이 있으면 고정 시간 실행 결과를 `qa/api-cases.json` 에 `kind:"unity"` 로 고정(입력은 `inputScript`). 브라우저 QA 가 모든 예제를 30프레임 돌려 오류가 없는지 본다.

## 15. 버전 올리기

- `engine/Core/Engine.cs` `EngineVersion` 과 `engine/wwwroot/index.html` 의 `<span id="ver">` 를 **같이**.
- 기능 추가 0.x.0, 수정·문서 0.x.y.
- `docs/CHANGELOG.md` 맨 위에 `## vX.Y.Z — 날짜` + 바뀐 것.
