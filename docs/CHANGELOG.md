# CHANGELOG

## v0.4.0 — 2026-11-04
- 엔진: **구조 분석**(`analyze`) — 타입·멤버·관계(상속·구현·가짐·생성·사용)·문법 사용 횟수·호출 횟수. **구조 규칙 채점**(타입 조건·관계·문법·호출, min/max). Worker 대기열 우회(실행 중에도 응답).
- 웹 모듈: `core/class-diagram.js` — 클래스 다이어그램(부모 위·자식 아래 배치, UML 선, 좁은 화면은 이름만, 상자 클릭 → 코드 줄).
- 실험 페이지 `labs/patterns/` — 디자인 패턴 24개(GoF 22 + DI + 리플렉션 팩토리): 설명·코드·입력 중 다이어그램/구조 체크 갱신·채점(출력 + 구조). 데이터 `patterns.json`(생성 `tools/data/make_patterns.py`).
- Unity 시뮬레이터: 게임 패턴 예제 4개(오브젝트 풀·상태 머신·이벤트 버스·컴포넌트 조립) + 예제 설명 줄.
- 테스트: 데스크톱이 패턴 24개 출력·규칙을 매번 확인, api-cases +10(analyze 6·Unity 패턴 4), 브라우저 QA 에 패턴 페이지(25개 분석·겹침·채점 반례·입력 갱신·클릭) 추가. `fetch-build.sh` 는 강제 전환.
- 문서: REFERENCE 2-3·4-1·4-2절(다이어그램·분석 결과·구조 규칙), ADD 12~14절, ACADEMY 디자인 패턴 챕터·Unity 게임 패턴, PITFALLS 18~21.

## v0.3.0 — 2026-11-03
- 엔진: **여러 파일**(`runFiles`) · **일괄 채점**(`grade`: 컴파일 1번 + 테스트마다 새로 올려 실행·출력 비교) · **진단만**(`check`, 실행 중에도 응답) · **Unity 모드**(`runUnity`, UnityLite 라이브러리 + 프레임 루프, 실시간/고정 시간·입력 대본).
- 결과에 파일 이름(`diagnostics[].file`, `error.file`) 추가. 데스크톱 API `RunFilesAsync`·`GradeAsync`·`Check`·`RunUnityAsync`.
- 웹 모듈: `core/code-editor.js`(문법 색칠·오류 밑줄·줄 번호·자동 들여쓰기), `core/symbol-bar.js`(폰 기호 칩). 실험실 화면에 입력 중 실시간 검사.
- 실험 페이지: `labs/grading/`(채점), `labs/unity/`(Unity 시뮬레이터: 캔버스·화면 키·예제 5개).
- 실행 중 첫 출력은 바로 보냄(이전엔 0.1초 뒤 다음 출력이 있어야 보였음).
- 테스트: `qa/api-cases.json`(16개, 데스크톱·브라우저 공용), 브라우저 QA 에 편집기·기호 칩·채점·Unity 항목.
- 문서: `docs/ACADEMY.md`(아카데미 연결 설계, 아카데미 저장소는 건드리지 않음).

## v0.2.1 — 2026-11-03
- 저장소 정리: 엔진 소스를 `engine/Core/`(플랫폼 무관: Engine·GuardRewriter·RunResult·CappedWriter)와 `engine/Browser/`(JSExport·Main)로 분리.
- 데스크톱용 타입 API `Engine.RunAsync(code, stdin) → RunResult`, `Engine.ToJson` 추가 (기존 `Run` 은 그대로 JSON 문자열).
- 문서(목적별): `CLAUDE.md`(다른 세션 첫 안내), `docs/README.md`(안내) · 🔎 `REFERENCE.md`(찾아볼 때) · ➕ `ADD.md`(추가할 때) · 🔧 `MAINTAIN.md`(유지보수할 때) · `ARCHITECTURE.md` · `PITFALLS.md`.
- 브라우저 QA 스크립트를 저장소로(`qa/browser/`), 도구 `tools/ship.sh`·`fetch-build.sh`·`deploy.sh`, 실험 자리 `engine/wwwroot/labs/`.

## v0.2.0 — 2026-11-03
- .NET 8 Blazor → **.NET 10 WebAssembly SDK + Web Worker**. 실행 중에도 화면이 안 멈춤.
- ■ 중지 버튼(Worker 종료 후 자동 재시작), 실행 중 출력 실시간 표시, 연속 실행 대기열.
- 로딩 14.3MB → 8.4MB(gzip): 트리밍 + 실행용 루트 지정, 참조 어셈블리 12개만 포함, brotli 자동 사용(지원 브라우저).
- 컴파일러 예열을 뒤에서 진행(로딩 끝나면 바로 실행 요청 가능).
- 자동 중단 시간 5초 → 10초.
- 수정: 연속 실행 시 Roslyn Emit 대기 실패(양보 + 재시도), 트리밍으로 지워진 형식 전달(facade 루트 지정).

## v0.1.0 — 2026-11-03
- 첫 시제품: Blazor WebAssembly(.NET 8) + Roslyn 으로 브라우저 안 C# 컴파일·실행.
- 한국어 컴파일 오류 + 줄 번호, 실행 오류 줄 번호(PDB) + 쉬운 설명, 무한 반복·재귀·출력 폭주 자동 중단, Console.ReadLine 입력, 최상위 await.
- 실험실 화면(예제 11개, 편집기 줄 번호·자동 들여쓰기·Ctrl+Enter, 측정값).
