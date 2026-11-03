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

**계약**: `createCsEngine` 와 결과 모양(docs/REFERENCE.md 4절)은 아카데미가 의존한다. 바꿔야 하면 `core/v2/` 새 경로로 내고 기존 경로는 남긴다.

### 알려진 제약

- 쓸 수 있는 라이브러리: `LabRefs.props`의 12개 (System, 컬렉션, LINQ, 정규식, BigInteger, 비동기 등). 파일·네트워크·리플렉션은 안 됨 (컴파일 오류로 안내).
- `Console.ReadKey`, `Console.Clear`, 색상 변경은 브라우저에서 지원 안 됨 (실행 오류로 안내).
- Console.ReadLine은 실행 전에 적어 둔 입력값만 읽음 (실행 중 대화형 입력은 아직 없음).

---

## 🧪 실험 중

(없음)

## 💡 실험 후보

- 실행 중 대화형 입력 (Console.ReadLine이 화면에서 입력을 기다림)
- 입력하면서 바로 오류 밑줄 표시 (실행 버튼 없이)
- 문법 색칠(구문 강조) 편집기
- 자동 완성 (멤버 목록)
- 채점: 예상 출력 비교 / 테스트 코드로 정답 판정
- 변수 값 추적·한 줄씩 실행 시각화
