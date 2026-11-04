# 아카데미 연결 설계 — C# 코스(타이핑 전용)에 이 엔진 붙이기

> 이 문서는 **csharp-lab 쪽 설계안**입니다. python-academy 저장소는 이 저장소 작업 중에 읽기만 하며(사용자 지시 2026-11-03), 실제 반영은 아카데미 쪽 작업 절차(그 저장소의 HANDOFF·workflow 규칙)로 따로 진행합니다.
> 기준: csharp-lab v0.3.0 / python-academy v2.3.x 구조(허브 + `courses/<id>/` + `core/runners/*.js` + 러너 인터페이스).

## 0. 결정 요약

| 항목 | 결정 |
|---|---|
| 입력 방식 | **타이핑만.** 블록·줄 끌기 없음. 텍스트 편집기 + 타자 연습 |
| 엔진 | csharp-lab 의 `core/` 모듈을 아카데미가 **경로로 불러 씀**(복사하지 않음). 같은 출처 `jihoon380462.github.io` 라 Worker·캐시 공유 |
| 쓰는 범위 | `FEATURES.md` ✅ 항목만 |
| 커리큘럼 | 파이썬 코스 흐름을 C# 으로 개조 (4절) |
| 저장·연동 | 아카데미 기존 방식 그대로(코스 id `csharp`) |

## 1. 엔진 연결 — 러너 `csharp`

아카데미에 새 러너 파일 하나(`core/runners/csharp.js`)가 아카데미 러너 인터페이스를 이 엔진으로 연결한다.

```js
const { createCsEngine } = await import("/csharp-lab/core/cs-engine.js");
```

| 아카데미 러너 인터페이스 | 이 엔진 |
|---|---|
| `load(onProgress)` | `createCsEngine({ onProgress, onReady })` — 첫 방문 약 8.4MB(gzip), 이후 캐시 |
| `run(submission, problem, onOutput)` | `engine.run(code, stdin)` 또는 여러 파일이면 `engine.runFiles(files, stdin)` + `onOutput` |
| 취소 | `engine.stop()` (Worker 종료 후 자동 재시작) |
| `grade(submission, problem)` | **`engine.grade(files, tests)`** — 컴파일 1번 + 테스트마다 새로 실행·비교 (2절) |
| 입력 중 오류 표시 | `engine.check(code)` — 진단만, 수십 ms |
| 구조 채점·다이어그램 | `engine.analyze(code, rules)` — 타입·관계 + 구조 규칙 결과 (2절, 4-1절) |
| `reset()` | 없음(실행마다 새로 올림) |
| `snapshot()` | 마지막 출력 + 진단 목록 |

**편집기**: 아카데미가 이미 CodeMirror 6 을 쓰므로 C# 강조만 추가해도 되고, 의존성 없이 가려면 csharp-lab `core/code-editor.js`(문법 색칠·오류 밑줄·줄 번호, `setDiagnostics`)를 그대로 써도 된다.
**폰 타이핑 보조**: `core/symbol-bar.js` (기호 칩, 짝 기호·커서 가운데·포커스 유지) — 타이핑 전용 코스라 폰에서 필수.
**오류 풀이**: 엔진이 한국어 Roslyn 메시지와 줄 번호를 준다. 아카데미 쪽에 초보자용 풀이 사전(오류 코드 → 쉬운 설명: CS1002 `;` 빠짐, CS0103 이름 오타, CS0029 타입 불일치, CS1513 `}` 짝, CS0165 값 넣기 전 사용, CS0246 없는 타입, CS1061 없는 멤버, CS0266 변환 필요, CS0161 return 빠짐, CS0019 연산자)을 얹는다.

**계약**: `createCsEngine` 와 결과 모양(REFERENCE.md 4절)은 고정. 바꿔야 하면 `core/v2/` 새 경로.

## 2. 채점

| 문제 형태 | 파일 | 테스트 |
|---|---|---|
| 출력형 (프로그램 전체) | 학습자 `Program.cs` 하나 | `{stdin, expect}` |
| 메서드형 | 학습자 `Solution.cs`(클래스·메서드) + 숨은 `Tests.cs`(최상위 문장으로 입력 읽어 호출·출력) | `{stdin, expect}` |
| 구조 조건 (「for 를 쓰세요」, 「인터페이스를 구현한 클래스 2개 이상」 등) | 학습자 파일 | `engine.analyze(files, rules)` 의 `rulesPassed === rulesTotal` (v0.4.0) |

- `engine.grade` 결과의 `tests[i].passed` · `stdout` · `error.friendly` 로 테스트별 표를 만든다(실험 페이지 `labs/grading/` 이 예시).
- 비교 규칙: 줄 끝 공백·마지막 빈 줄 무시(`Engine.NormalizeOutput`).
- 무한 반복은 테스트마다 10초 자동 중단 → 실패 처리.
- 정적 변수는 테스트마다 초기화(어셈블리를 새로 올림).

## 3. 화면

- 텍스트 문제 화면 그대로(지문 → 편집기 → 실행/제출 → 출력·테스트 결과). 블록·줄 끌기 단계는 숨김.
- 실행 중 ■ 중지, 실시간 출력, 입력하면서 오류 밑줄(0.45초 쉬면 검사).
- 코스 첫 진입 때 엔진 로딩 카드(진행률). 로딩 끝나면 바로 편집·실행 가능(예열은 뒤에서).

## 4. 커리큘럼 (파이썬 코스 개조안)

| 챕터 | 레슨 | 주제 |
|---|---|---|
| 0 시작 | C0 | C#과 .NET, **컴파일**(컴파일 오류 vs 실행 오류), 최상위 문장 |
| 0 | C1 | `Console.WriteLine`·`Write`, `;`·`{}`·대소문자, 주석 |
| 1 값 | C2 | 변수와 **타입 선언** `int double string bool char`, `var` |
| 1 | C3 | 연산자, 정수 나눗셈, `%`, 문자열 보간 `$"{x}"` |
| 1 | C4 | 입력과 변환 `Console.ReadLine()` `int.Parse` `TryParse` |
| 2 조건 | C5–C6 | `if/else`, 비교·논리, `switch` 문·식, 삼항 |
| 3 반복 | C7–C8 | `for while do-while`, `break continue`, 중첩 |
| 4 모음 | C9–C12 | 배열, `List<T>`, `Dictionary`, 문자열 다루기 |
| 5 메서드 | C13–C15 | 정의·반환형·`void`, 오버로딩·기본값·`ref/out`, 재귀 |
| 6 클래스 | C16–C18 | 클래스·생성자, 속성·접근 제한자·`static`, `struct record enum` |
| 7 객체지향 | C19–C20 | 상속·`virtual/override`, 인터페이스·추상·다형성 |
| 8 한 걸음 더 | C21–C24 | 예외, LINQ·람다, 제네릭·null, `async/await` |
| **9 디자인 패턴** | P1–P8 | 4-1절 |
| **10 Unity 맛보기** | U1–U6 | `MonoBehaviour`·`Start`·`Update`, `transform`·`Time.deltaTime`, `Input`, 생성·파괴, **게임 패턴**(오브젝트 풀·상태 머신·이벤트 버스·컴포넌트 조립) — **Unity 모드(UnityLite)** 사용, 실험 페이지 `labs/unity/` 가 시제품 |
| 실전 | X1–X3 | 인벤토리, 콘솔 RPG, 퀴즈 게임 |

- 문제 유형: 코드(출력 채점) · 메서드형 · 빈칸 · 버그 고치기 · 퀴즈(「이 코드는 컴파일될까?」 포함) · 타자 연습(비중 크게).
- Unity 챕터 채점: `engine.runUnity(code, { frames: 60, inputScript: "0-59:RightArrow" })` 로 고정 시간 실행 → `Debug.Log` 출력 비교(결정적). 예: 「60프레임 뒤 x 가 3.00」. 게임 패턴은 Unity 모드 `analyze(code, rules, "unity")` 로 구조도 본다(예: 풀 — `calls:"SetActive"` 2번 이상, `Queue` 로 품음; 상태 머신 — `uses:"switch"` + enum 1개).

### 4-1. 디자인 패턴 챕터 (P1–P8)

챕터 7(객체지향) 다음. 패턴 하나 = 「왜 필요한가(나쁜 코드 먼저)」 → 다이어그램과 함께 읽기 → 고쳐 쓰기 문제. 실험 페이지 `labs/patterns/` 와 `patterns.json`(24개, 코드·기대 출력·구조 규칙)이 그대로 문제 재료다.

| 레슨 | 패턴 | 문제 예 (출력 + 구조) |
|---|---|---|
| P1 왜 패턴인가 | — | if 덩어리 할인 계산을 보고 「새 할인이 생기면 어디를 고치나」 퀴즈 |
| P2 전략 | Strategy | if 버전 → 인터페이스+구현 2개로 바꾸기. 규칙: 구현 2개 이상인 인터페이스, 그 인터페이스를 품은 클래스, `if` 0개 |
| P3 상태 | State | 문 열림/닫힘을 상태 클래스로. 규칙: 상태 인터페이스 구현 2개, `if` 0개 |
| P4 옵저버 | Observer (event) | 체력이 바뀌면 UI·소리에 알리기. 규칙: `event` 1, 구독 람다 2 |
| P5 팩토리·싱글턴 | Factory Method · Singleton | 이름으로 적 만들기 / 설정 하나만. 규칙: 공통 부모 자식 2개, private 생성자 |
| P6 데코레이터·컴포지트 | Decorator · Composite | 커피 토핑, 폴더 크기. 규칙: 같은 인터페이스를 구현하며 품기 |
| P7 커맨드 | Command | 실행 취소. 규칙: Execute·Undo 인터페이스, `Pop` 호출 |
| P8 의존성 주입 | DI | 저장소를 생성자로 받기. 규칙: 인터페이스를 품음, `new` 로 구체 클래스 만들지 않기 |

- **채점 = 출력 + 구조.** 같은 출력이라도 패턴을 안 쓰면 구조 체크에서 떨어진다(v0.4.0 QA: if 버전 전략 → 출력 ✓, 구조 0/3).
- **화면**: 편집기 옆에 클래스 다이어그램(`core/class-diagram.js`)과 구조 체크 목록을 두고, 입력이 멈추면 0.5초 뒤 둘 다 갱신 → 「선이 생기는 것」이 즉각 보상.
- 나머지 패턴(어댑터·프록시·퍼사드·브리지·플라이웨이트·빌더·프로토타입·템플릿 메서드·이터레이터·책임 연쇄·중재자·메멘토·방문자·추상 팩토리)은 「패턴 도감」(문제 없이 실행·다이어그램만, 선택)으로.
- TODO.md T5(객체지향·설계 코스)와 겹친다 → 아카데미 쪽에서 「C# 코스 안 챕터」로 할지 「별도 코스」로 할지 결정 필요.

## 5. 검증 게이트 (아카데미 CI)

아카데미의 정답 검사(현재 CPython)는 C# 을 못 돈다 → csharp-lab 엔진 소스(`engine/Core`)를 데스크톱 .NET 에서 돌리는 검사 도구가 필요:
- csharp-lab 에 `tools/SolutionRunner`(후보): 문제 JSON 을 받아 정답 코드를 `Engine.GradeAsync` 로 채점해 전부 통과하는지 보고.
- 아카데미 CI: `actions/checkout`(repository `jihoon380462/csharp-lab`) → `setup-dotnet 10` → `dotnet run --project <csharp-lab>/tools/SolutionRunner -- problems.json`.

## 6. 단계

| 단계 | 내용 | 어디서 |
|---|---|---|
| L (끝남 v0.3.0) | 여러 파일·일괄 채점·진단만·편집기·기호 칩·Unity 모드 | csharp-lab |
| L2 (끝남 v0.4.0) | 구조 분석·구조 규칙·클래스 다이어그램·디자인 패턴 24개·Unity 게임 패턴 | csharp-lab |
| L3 | `tools/SolutionRunner` (출력 + 구조 규칙을 데스크톱에서 검사) | csharp-lab |
| C0 | 러너 `csharp.js` 연결, 코스 껍데기, 오류 풀이 사전, CI 정답 검사, 레슨 2개 | 아카데미 (그쪽 절차) |
| C1–C3 | 챕터 콘텐츠 | 아카데미 |

## 7. 위험

| 위험 | 대응 |
|---|---|
| 첫 로딩 8.4MB | 코스 진입 시에만, 진행률, 이후 캐시 |
| 폰 컴파일 시간 | 일괄 채점(컴파일 1번), 예열은 뒤에서 |
| csharp-lab 수정이 아카데미를 깨뜨림 | 계약 + 새 경로 규칙, QA 후에만 배포 |
| 라이브러리 제한(파일·네트워크 없음) | 콘솔 범위 커리큘럼, 범위 밖은 컴파일 오류로 안내 |
| ReadLine 이 미리 준 입력만 | 테스트 stdin 으로 충분. 대화형 입력은 실험 후보 |
