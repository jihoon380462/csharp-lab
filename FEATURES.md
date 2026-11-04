# 기능 모음 (C# 실험실)

이 저장소는 **실험실**입니다. 여러 기능을 시도해 보고, QA를 통과해 로직이 검증된 기능만 이 문서의 "✅ 검증 완료"로 옮겨 모아 둡니다.
아카데미(python-academy)에 C# 코스를 붙일 때는 여기 "✅ 검증 완료"에 있는 것만 가져다 씁니다.

## 규칙

- 새 기능은 `engine/wwwroot/labs/<기능이름>/` 에서 실험한다. 상태: 🧪 실험 중
- QA(데스크톱 테스트 + 브라우저 PC·모바일)를 통과하면 `engine/wwwroot/core/`(재사용 모듈) 또는 엔진(`engine/*.cs`)으로 옮기고 아래 표에 ✅로 기록한다.
- 각 항목에는 **어디에 있는지 / 어떻게 쓰는지 / 무엇으로 검증했는지**를 적는다.
- 배포는 QA 통과 후에만 (build → build-output 브랜치에서 QA → deploy 수동 실행).

---

## ✅ 검증 완료

| 기능 | 위치 | 검증 | 버전 |
|---|---|---|---|
| 브라우저 안 C# 컴파일·실행 (Roslyn + .NET 10 WebAssembly) | `engine/Core/Engine.cs` | 문법·표준 라이브러리 케이스 37개 (`qa/cases.json`) 데스크톱+브라우저 통과 | 0.1.0 → 0.2.0 |
| 한국어 컴파일 오류 메시지 + 오류 줄 번호 | `Core/Engine.cs` (ToInfo), 화면 `lab.js` | 컴파일 오류 케이스, 줄 클릭 시 코드 선택 | 0.1.0 |
| 실행 오류 줄 번호 + 쉬운 설명 (PDB로 줄 계산) | `Core/Engine.cs` (FindUserLine, Describe) | 배열 범위·0 나누기·null·형식 변환 케이스 | 0.1.0 |
| 무한 반복 / 무한 재귀 / 출력 폭주 자동 중단 | `engine/Core/GuardRewriter.cs`, `Core/Engine.cs` (__LabGuard), `Core/CappedWriter.cs` | 반복문 안 try/catch로 삼키는 경우까지 중단 확인, 중단 후 다음 실행 정상 | 0.1.0 (제한 5초 → 10초) |
| Console.ReadLine 입력 (미리 적은 입력값을 한 줄씩) | `Core/Engine.cs` (SetConsoleIn) | 입력 케이스 | 0.1.0 |
| 최상위 await / async Main | `Core/Engine.cs` (ResolveAsyncEntry) | async 케이스, 단계별 출력 | 0.1.0 |
| 백그라운드 실행 (Web Worker) — 실행 중에도 화면이 안 멈춤 | `core/engine-worker.js` | 무한 반복 중 화면 타이머 지연 0~1ms | 0.2.0 |
| ■ 중지 버튼 (워커 종료 후 엔진 자동 재시작) | `core/cs-engine.js` (stop) | 중지 즉시 멈춤, 재시작 약 0.5초(PC) 후 재실행 정상 | 0.2.0 |
| 실행 중 출력 실시간 표시 | `Core/CappedWriter.cs` (Pump) → `Browser/Exports.cs` (PostOutput) → 워커 → 화면 | 긴 반복·await 사이 출력이 순서대로 나옴 | 0.2.0 |
| 연속 실행 대기열 | `core/engine-worker.js` (enqueue) | 기다리지 않고 8번 연달아 실행 모두 정상 | 0.2.0 |
| 컴파일러 예열을 뒤에서 진행 (로딩 끝나면 바로 편집·실행 요청 가능) | `core/engine-worker.js` | 예열 중 실행 요청 시 예열 뒤 자동 실행 | 0.2.0 |
| 로딩 용량 절감 14.3MB → 8.4MB (gzip) | `CsEngine.csproj` (트리밍 + 루트 지정), `LabRefs.props` (참조 어셈블리 12개만) | 표준 라이브러리 확인 케이스 (bcl-coverage) | 0.2.0 |
| brotli 압축 자동 사용 (브라우저가 지원하면, 6.6MB) | `core/engine-worker.js` | 지원 안 하는 브라우저는 gzip으로 자동 대체 | 0.2.0 |
| 데스크톱 .NET 에서 엔진 직접 사용 (`Engine.RunAsync` → `RunResult`) | `engine/Core/*.cs` + `LabRefs.props` | `tests/EngineTests` 가 이 방식으로 케이스 전부 실행 (CI) | 0.2.1 |
| 여러 파일 컴파일·실행 (`runFiles`) — 진단·실행 오류에 파일 이름 | `Core/Engine.cs` (RunFilesAsync), `core/cs-engine.js` | api-cases `runfiles-*` 3개 (두 번째 파일 오류 줄·파일까지) | 0.3.0 |
| 일괄 채점 (`grade`) — 컴파일 1번, 테스트마다 새로 올려 실행(정적 변수 초기화), 출력 비교 | `Core/Engine.cs` (GradeAsync, NormalizeOutput) | api-cases `grade-*` 4개, 실험 페이지 3문제 정답 전부 통과·처음 코드 일부 실패 | 0.3.0 |
| 진단만 (`check`) — 실행 없이 오류·경고, 실행 중에도 응답 | `Core/Engine.cs` (Check), `core/engine-worker.js` (대기열 우회) | api-cases `check-*` 3개, PC 약 15ms | 0.3.0 |
| 코드 편집기 — 문법 색칠·오류 밑줄·줄 번호 표시·자동 들여쓰기·`{}` 펼침 (라이브러리 없음) | `core/code-editor.js` | 밑줄 위치 오차 0px, 입력 중 밑줄·고치면 사라짐, 블록 펼침 | 0.3.0 |
| 폰 기호 칩 (짝 기호·커서 가운데·키보드 유지, 마우스 기기면 숨김) | `core/symbol-bar.js` | 모바일 QA: `( )`·`" "` 넣기·커서 위치·포커스 유지 | 0.3.0 |
| 구조 분석 (`analyze`) — 타입·멤버·관계(상속·구현·가짐·생성·사용)·문법 사용 횟수·호출 횟수, 실행 안 함·대기열 우회 | `Core/Analyzer.cs`, `core/cs-engine.js` | api-cases `analyze-*` 6개 (주 생성자 붙잡음·record·모음·Unity 모드·오류 코드), PC 2~150ms | 0.4.0 |
| 구조 규칙 채점 — 「구현 2개 이상인 인터페이스」「if 없이」 등 (TypeFilter·relation·uses·calls) | `Core/Analyzer.cs` (Evaluate), 형식 REFERENCE 4-2절 | 패턴 24개 규칙 전부 통과(데스크톱·브라우저), if 버전 전략은 출력 ✓·구조 0/3 | 0.4.0 |
| 클래스 다이어그램 (계층 배치·UML 선·좁으면 이름만·클릭 → 코드 줄) | `core/class-diagram.js` | 패턴 25개 상자 겹침 0·선 좌표 정상, 입력 즉시 갱신, 상자 클릭 줄 선택, 모바일 가로 넘침 없음 | 0.4.0 |
| 디자인 패턴 24개 데이터 (GoF 22 + DI + 리플렉션 팩토리: 코드·설명·기대 출력·구조 규칙) | `labs/patterns/patterns.json` ← `tools/data/make_patterns.py` | 데스크톱 테스트에서 매번 출력·규칙 확인 | 0.4.0 |
| Unity 모드 (UnityLite): MonoBehaviour·Start·Update·Transform·Input·Time·Debug·Vector·Mathf·Random·생성/파괴 | `Core/Libraries/UnityLite.csx`, `Core/Engine.cs` (RunUnityAsync), `labs/unity/` | api-cases `unity-*` 7개(이동·생성/파괴·오류 줄·프레임 시간 초과), 실시간 60fps·화면 버튼·키보드·중지, 예제 5개 | 0.3.0 |

### 재사용 방법 (다른 페이지에서) — 자세한 건 docs/REFERENCE.md 2·3절

같은 GitHub Pages 주소(`jihoon380462.github.io`) 아래라면 엔진을 그대로 불러 쓸 수 있습니다.

```js
import { createCsEngine } from "/csharp-lab/core/cs-engine.js";

const engine = createCsEngine({
  onProgress: (p) => {/* p.ratio(0~1), p.bytes */},
  onReady: (info) => {/* 실행 가능 */},
  onOutput: (chunk) => {/* 실행 중 출력 조각 */},
});
const r = await engine.run('Console.WriteLine("hi");', /* 입력값 */ "");
// r.status: ok | compile-error | runtime-error | stopped | stopped-by-user | internal-error
// r.stdout, r.diagnostics[{line, message}], r.error{line, friendly}
engine.stop(); // 실행 중지
```

채점·진단·Unity·편집기 사용법은 docs/REFERENCE.md 2절, 아카데미 연결 설계는 docs/ACADEMY.md.

**계약**: `createCsEngine` 와 결과 모양(docs/REFERENCE.md 4절)은 아카데미가 의존한다. 바꿔야 하면 `core/v2/` 새 경로로 내고 기존 경로는 남긴다.

### 알려진 제약

- 쓸 수 있는 라이브러리: `LabRefs.props`의 12개 (System, 컬렉션, LINQ, 정규식, BigInteger, 비동기 등). 파일·네트워크·리플렉션은 안 됨 (컴파일 오류로 안내).
- `Console.ReadKey`, `Console.Clear`, 색상 변경은 브라우저에서 지원 안 됨 (실행 오류로 안내).
- Console.ReadLine은 실행 전에 적어 둔 입력값만 읽음 (실행 중 대화형 입력은 아직 없음).

---

## 🧪 실험 중

| 실험 | 페이지 | 상태 |
|---|---|---|
| 채점 화면 (테스트별 표·숨은 테스트) | `labs/grading/` | 엔진 API 는 ✅, 화면은 아카데미용 시제품 |
| Unity 시뮬레이터 화면 (캔버스·화면 키·콘솔) + 게임 패턴 예제 4개(오브젝트 풀·상태 머신·이벤트 버스·컴포넌트 조립) | `labs/unity/` | 엔진(Unity 모드)은 ✅, 예제 출력은 api-cases `unity-pattern-*` 로 고정, 화면은 시제품 |
| 디자인 패턴 화면 (선택·설명·편집기·실시간 다이어그램·구조 체크·채점) | `labs/patterns/` | 엔진·다이어그램은 ✅, 화면은 아카데미용 시제품 |

## 💡 실험 후보

- 정답 검사 도구 `tools/SolutionRunner` (아카데미 CI 용, docs/ACADEMY.md 5절) — 출력 + 구조 규칙
- 다이어그램: 시퀀스 다이어그램(메서드 호출 순서), 객체 그래프(실행 중 어떤 객체가 누구를 품는지)
- Unity 모드 구조 규칙 예시 묶음(게임 패턴 문제용)
- 실행 중 대화형 입력 (Console.ReadLine 이 화면에서 입력을 기다림)
- 자동 완성 (멤버 목록)
- 변수 값 추적·한 줄씩 실행 시각화
- Unity 모드: 충돌(간단한 원·사각 겹침), 코루틴(`StartCoroutine`), 텍스트 UI
