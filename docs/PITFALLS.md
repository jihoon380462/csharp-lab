# 함정과 해결 — 브라우저에서 .NET/Roslyn 돌리기

실제로 부딪힌 문제와 해결법. 증상(오류 메시지)으로 검색해서 쓰세요. 대상: .NET 8~10 WebAssembly(Mono), Roslyn 4.x.

---

### 1. `Console.In` 을 읽거나 `Console.SetIn` 하면 PlatformNotSupportedException
- **원인**: 브라우저 런타임에는 표준 입력이 없어서 `Console.In` getter 가 막혀 있다.
- **해결**: 입력은 `StringReader` 로 넣되, `SetIn` 이 실패하면 `Console` 의 private static 필드 `s_in` 을 리플렉션으로 직접 설정. 원래 값도 `try { Console.In } catch {}` 로 조심해서 읽는다. → `Engine.SetConsoleIn`

### 2. 최상위 `await` / `async Task Main` 이 "Cannot wait on monitors on this runtime" 로 실패
- **원인**: 컴파일러가 만든 진입점 `<Main>` 은 동기 래퍼라서 `.GetAwaiter().GetResult()` 로 **막고 기다린다**. 단일 스레드 브라우저에서는 막고 기다리기가 불가능.
- **해결**: 진입점 이름이 `<Main>` 이면 같은 타입에서 Task 를 돌려주는 `<Main>$`(최상위 문장) 또는 `Main` 을 찾아 직접 호출하고 `await`. → `Engine.ResolveAsyncEntry`

### 3. Roslyn `Emit` 이 가끔 "Cannot wait on monitors" (스택에 `DebugSourceDocument.GetSourceInfo`)
- **원인**: PDB 를 만들 때 Roslyn 이 소스 체크섬을 `Task.Run` 으로 계산하고 `.Result` 로 기다린다. 대기열 상태에 따라 인라인 실행이 안 되면 막고 기다리기 → 실패. 실행을 **연달아** 요청할 때(이전 작업 직후) 잘 생긴다.
- **해결**: `Emit` 직전에 `await Task.Delay(1)` 로 한 번 양보(쌓인 작업 처리)하고, 그래도 PlatformNotSupportedException 이면 한 번 더 시도. (`#pragma checksum` 을 붙여도 해결되지 않았음 — 남겨 두었지만 효과 없음)
- **검증**: 중지 직후 실행, 기다리지 않고 8번 연속 실행 → 전부 정상.

### 4. 한국어 Roslyn 메시지(위성 어셈블리)를 쓰려는데 `InvariantGlobalization` 이 켜져 있으면 엔진이 깨짐
- **증상**: 위성 어셈블리를 불러온 뒤 JSInterop 이 `CultureNotFoundException: ... ko is an invalid culture identifier` 로 실패.
- **원인**: invariant 모드에서는 문화권 이름 `ko` 자체를 만들 수 없는데, 위성 어셈블리 이름에 `Culture=ko` 가 들어 있다.
- **해결**: `InvariantGlobalization=false`, `SatelliteResourceLanguages=ko`, ICU 는 필요한 조각만(`applicationCulture: 'ko'` → `icudt_CJK.dat`). JS 에서 `.withConfig({ loadAllSatelliteResources: true })`. 메시지는 `diagnostic.GetMessage(new CultureInfo("ko"))`.

### 5. 트리밍 후 학습자 코드가 `TypeLoadException: Could not resolve type ... from typeref (expected class 'System.DivideByZeroException' in assembly 'System.Runtime')`
- **원인**: 학습자 코드는 참조 어셈블리(System.Runtime 등)를 보고 컴파일되므로, 실행 때 `System.Runtime` 의 **형식 전달(type forward)** 이 필요하다. 트리머가 엔진이 안 쓰는 전달을 지웠다.
- **해결**: `TrimmerRootAssembly` 에 구현(`System.Private.CoreLib`, `System.Collections`, `System.Linq` …)뿐 아니라 **facade**(`System.Runtime`, `System.Runtime.Extensions`, `System.Threading.Tasks`)도 넣는다. 참조 목록(`LabRefs.props`)과 항상 짝으로.
- **검증 케이스**: `qa/cases.json` 의 `bcl-coverage`(예외 10종·컬렉션·정규식·BigInteger 등).

### 6. `CS8055: Cannot emit debug information for a source text without encoding`
- **해결**: PDB 를 만들 거면 모든 `SyntaxTree` 를 `encoding: Encoding.UTF8` 로 만든다(직접 만든 보조 트리 포함).

### 7. 실행 오류에 줄 번호가 없다 (브라우저)
- **원인**: Mono(WebAssembly)는 PDB 를 같이 로드해도 `StackTrace` 문자열에 `:line N` 을 안 붙인다(데스크톱 CoreCLR 은 붙임).
- **해결**: PDB 를 따로 Emit 해 두고, `new StackTrace(ex).GetFrames()` 에서 학습자 어셈블리 프레임의 `GetILOffset()` + 메서드 토큰 → `MetadataReader`(Portable PDB) 의 시퀀스 포인트로 줄을 계산. → `Engine.FindUserLine`
- 감시 코드를 넣어도 줄이 안 밀리게: 삽입 노드에 줄바꿈 trivia 를 넣지 않는다(`GuardRewriter`).

### 8. 트리밍 환경에서 `JsonSerializer` 가 리플렉션 비활성 예외
- **해결**: `JsonSerializerContext` 소스 생성기 사용(`[JsonSerializable(typeof(RunResult))]`, camelCase 는 `JsonSourceGenerationOptions`).

### 9. Blazor 로 만들면 Web Worker 에서 못 돌린다 / 실행 중 화면이 멈춘다
- **해결**: Blazor 대신 `Microsoft.NET.Sdk.WebAssembly` + `[JSExport]`. Worker 에서 `import { dotnet } from "../_framework/dotnet.js"` → `dotnet.create()` → `getAssemblyExports(mainAssemblyName)`. 중지는 `worker.terminate()` 후 재생성.
- 실행 중 출력을 실시간으로: .NET 쪽 `[JSImport("globalThis.labPostOutput")]` 를 Writer 에서 0.1초마다 호출 → Worker 가 `postMessage`.

### 10. .NET 의 리소스 로더로 압축본 받기
- `dotnet.withResourceLoader((type, name, defaultUri) => ...)` 에서 `.js`/`.json` 은 `defaultUri` 문자열을 그대로 돌려주고, 나머지는 `fetch(defaultUri + ".br" | ".gz")` → `DecompressionStream` → `new Response(buf, {headers:{'content-type': 'application/wasm'}})`.
- `DecompressionStream("brotli")` 는 브라우저마다 지원이 다르다 → `try { new DecompressionStream("brotli") }` 로 확인하고 gzip 으로 대체. (헤드리스 크롬 153 은 brotli 미지원이었음)

### 11. Blazor(.NET 8)에서 엔진 로딩 중 진행률이 파일 개수 기준이라 엉뚱함
- **해결**: 빌드 때 압축본 합계를 `lab-size.json` 에 적어 두고 받은 바이트로 계산.

### 12. 헤드리스 크롬의 CPU·네트워크 제한(CDP)이 Web Worker 에는 안 걸린다
- `Emulation.setCPUThrottlingRate`, `Network.emulateNetworkConditions` 는 Worker 세션에서 "Not supported". 페이지 수준 네트워크 제한은 Worker 의 fetch 에도 일부 적용되는 것으로 보였음.
- → 폰 성능 수치는 **실제 기기에서** 확인한다(v0.1 실측: 폰 첫 방문 약 6초).

### 13. MSBuild 가 `이름.cs.txt` 리소스를 체코어(cs) 위성 리소스로 만든다
- **증상**: `GetManifestResourceStream("lib.UnityLite.cs")` 가 null (엔진 리소스 없음).
- **원인**: `AssignCulture` 가 끝에서 두 번째 확장자 `.cs` 를 문화권 이름(체코어)으로 보고 `cs/` 위성 어셈블리로 보냄.
- **해결**: 확장자를 `.csx` 로 바꾸고 `<WithCulture>false</WithCulture>`, `LogicalName` 을 직접 지정. → `engine/LabRefs.props`

### 14. 겹침 편집기가 납작해지거나 글자와 밑줄이 어긋난다
- 편집기 CSS 가 `<style>` 로 나중에 들어가서 host 요소의 같은 우선순위 규칙(예: `height`)을 덮어썼다 → 편집기 CSS 에는 높이를 두지 않고 host 가 정한다.
- textarea 와 layer 의 글꼴·크기·줄 높이·padding·`tab-size`·`white-space` 가 하나라도 다르면 어긋난다. 페이지 CSS 가 `#code` 같은 id 로 textarea 만 바꾸면 깨짐(실험실 v0.2 의 `#code` 규칙을 지운 이유). QA 「겹침 정렬」이 픽셀 차이를 잰다.

### 15. 실행 중 출력이 늦게(또는 끝날 때까지) 안 보인다
- 0.1초 간격으로만 보내면 「한 번 출력하고 오래 계산」하는 코드의 첫 줄이 끝까지 안 보인다 → 첫 출력은 바로 보내고, `Flush()` 도 전송으로. Unity 모드는 프레임마다 `Console.Out.Flush()`.

### 16. Unity 모드 자동 생성에 `MonoBehaviour` 자체가 끼어든다
- `typeof(MonoBehaviour).IsAssignableFrom(t)` 는 자기 자신도 참 → `t.IsSubclassOf(...)` + `t.Namespace != "UnityEngine"`. 케이스 `unity-autospawn-count` 로 확인.

### 17. 키를 아주 짧게 눌렀다 떼면 Unity 입력이 안 먹을 수 있다
- 입력은 프레임마다(약 16ms) 읽는다. 누름과 뗌이 같은 프레임 사이에 다 지나가면 그 프레임엔 안 눌린 것으로 보인다(자동 검사에서 keyDown/keyUp 사이에 150ms 를 둔 이유). 실제 사람 손으로는 거의 생기지 않음. 확실히 하려면 「이번 프레임 사이에 눌렸던 키」를 따로 모아 보내는 방식으로 바꿀 수 있다(후보).

### 18. SVG 에 `style="font:12px "D2Coding",..."` 를 넣으면 글꼴이 안 먹는다
- **원인**: 큰따옴표가 속성 값을 끊는다 → 브라우저가 나머지를 버리고 기본 글꼴로 그림. 상자 폭은 고정폭 글꼴로 재서 글자와 어긋남.
- **해결**: 글꼴 이름은 작은따옴표로. → `core/class-diagram.js` `FAMILY`

### 19. 클래스만 있는 코드를 분석하면 CS5001(Main 없음)
- 실행용 컴파일 옵션(ConsoleApplication)을 같이 써서 생김. 구조 분석에서는 CS5001 을 빼고 판단한다. (실행·채점에서는 그대로 오류)

### 20. record 의 위치 매개변수 속성·IEquatable
- `record R(B Item)` 의 `Item` 속성은 컴파일러가 만든 것으로 표시될 수 있어 「직접 쓴 멤버」 판단에서 빠질 수 있다 → record 의 속성은 소스 위치가 있으면 포함. record 는 `IEquatable<R>` 을 자동 구현하므로 인터페이스 목록에서 뺀다.

### 21. QA 중 build-output 폴더의 파일을 손으로 고치면 다음 `fetch-build` 가 멈춘다
- git 이 「바뀐 파일이 있어 전환 못 함」으로 멈추고 **예전 빌드로 QA** 하게 된다 → `fetch-build.sh` 는 `checkout -f` 로 덮어씀.

### 기타
- Roslyn `concurrentBuild: true` 는 단일 스레드에서 의미 없음 → `false`.
- 학습자 코드 출력이 무한하면 메모리가 터진다 → Writer 에 상한(10만 자) 두고 넘으면 예외.
- `catch (Exception)` 으로 감시 예외를 삼키는 코드 → 감시기를 "한번 걸리면 계속 던지는" 상태로.
- GitHub Pages 는 `_framework` 처럼 밑줄 폴더를 Jekyll 이 숨긴다 → Actions 배포(`upload-pages-artifact`)를 쓰면 Jekyll 을 안 거친다(`.nojekyll` 도 넣어 둠).
