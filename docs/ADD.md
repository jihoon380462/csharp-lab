# ➕ 추가할 때 — 새 기능·케이스·라이브러리·예제 넣기

무엇을 넣든 순서는 같습니다: **실험(labs) → 케이스·QA → 검증 → 모음(FEATURES.md ✅) → 배포**.
위치를 찾을 땐 [REFERENCE.md](REFERENCE.md) 1절 색인, 고치거나 문제가 생기면 [MAINTAIN.md](MAINTAIN.md).

## 0. 공통 체크리스트 (무엇을 추가하든 끝에)

- [ ] `qa/cases.json` 에 케이스 추가 (엔진 동작이면 필수) — 1절
- [ ] 브라우저 전용 동작이면 `qa/browser/qa.js` 에 `mark(...)` 추가 — 7절
- [ ] 결과 모양(REFERENCE 4절)을 **지우거나 바꾸지 않았다** (추가만)
- [ ] `tools/ship.sh` → CI 데스크톱 테스트 통과 → 브라우저 QA `all` 실패 0 → 스크린샷 눈으로 확인
- [ ] 버전 올림 + `docs/CHANGELOG.md` — 10절
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

1. `engine/wwwroot/labs/<이름>/index.html` 을 만든다. 엔진 불러오기:
   ```html
   <script type="module">
     import { createCsEngine } from "../../core/cs-engine.js";
     const engine = createCsEngine({ onReady: () => console.log("ready") });
     const r = await engine.run('Console.WriteLine("lab");');
   </script>
   ```
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

## 10. 버전 올리기

- `engine/Core/Engine.cs` `EngineVersion` 과 `engine/wwwroot/index.html` 의 `<span id="ver">` 를 **같이**.
- 기능 추가 0.x.0, 수정·문서 0.x.y.
- `docs/CHANGELOG.md` 맨 위에 `## vX.Y.Z — 날짜` + 바뀐 것.
