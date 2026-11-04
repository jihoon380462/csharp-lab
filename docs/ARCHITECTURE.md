# 구조와 동작 원리

## 1. 한눈에

```
[페이지 (메인 스레드)]                 [Web Worker (백그라운드)]
 lab.js 또는 다른 사이트                engine-worker.js
   │ import                               │ import
   ▼                                      ▼
 core/cs-engine.js ──postMessage──▶  _framework/dotnet.js  (.NET 10 런타임, WebAssembly)
   ▲   (run / stop)                       │ getAssemblyExports
   │                                      ▼
   └──── progress / ready / output ◀── Browser/Exports.cs  [JSExport]
         / result                         │
                                          ▼
                                     Core/Engine.cs ── Roslyn(Microsoft.CodeAnalysis.CSharp)
                                          │  1. 원본으로 컴파일 검사 → 오류면 끝
                                          │  2. GuardRewriter 로 감시 코드 삽입
                                          │  3. Emit (PE + PDB) → Assembly.Load
                                          │  4. 콘솔 가로채고 진입점 실행
                                          ▼
                                     RunResult (JSON) → 페이지
```

- 메인 스레드는 화면만 담당한다. 컴파일·실행이 아무리 오래 걸려도 화면이 멈추지 않는다.
- **중지** = Worker 를 통째로 `terminate()` 하고 새 Worker 를 띄운다. .NET 쪽에 취소 기능이 필요 없다.

## 2. 파일별 역할

### 엔진 (.NET)

| 파일 | 역할 |
|---|---|
| `engine/CsEngine.csproj` | `Microsoft.NET.Sdk.WebAssembly`(Blazor 아님). 한국어 문화권·트리밍·루트 지정·압축 설정 |
| `engine/LabRefs.props` | 학습자 코드 컴파일용 **참조 어셈블리 12개**를 SDK 참조 팩에서 골라 엔진에 리소스로 넣음(`labref.*.dll`). 테스트 프로젝트도 같이 씀 |
| `engine/Core/Engine.cs` | 엔진 본체. `RunAsync`/`Run`, 컴파일 옵션, 진입점 처리(async Main), 콘솔 입출력 연결, 실행 오류 해석(쉬운 설명·줄 번호) |
| `engine/Core/GuardRewriter.cs` | 무한 반복·재귀 감시 코드 삽입 (줄 번호 보존) |
| `engine/Core/RunResult.cs` | 결과 모양 + JSON 소스 생성기(트리밍 환경용) |
| `engine/Core/CappedWriter.cs` | 콘솔 출력 받기: 상한 초과 시 중단, 첫 출력은 바로·이후 0.1초마다 바깥으로 흘려보냄(`Flush` 도 전송) |
| `engine/Core/Analyzer.cs` | 구조 분석(`Engine.Analyze`): Roslyn 의미 모델로 타입·멤버·관계·문법 사용·호출을 뽑고 구조 규칙 평가 |
| `engine/Core/Libraries/UnityLite.csx` | Unity 흉내 라이브러리(`namespace UnityEngine`) + 프레임 루프(`UnityLiteHost`). 엔진 리소스로 들어가 Unity 모드에서 학습자 코드와 함께 컴파일됨 |
| `engine/Browser/Exports.cs` | JS 에서 부르는 진입점(`[JSExport]`), 실행 중 출력 → JS(`[JSImport] globalThis.labPostOutput`) |
| `engine/Browser/Program.cs` | 빈 Main (WebAssembly SDK 가 Exe 를 요구) |

`Core/` 는 브라우저 의존이 없다 → 데스크톱 .NET 에서 그대로 컴파일된다(`tests/EngineTests`).

### 웹 (engine/wwwroot)

| 파일 | 역할 |
|---|---|
| `core/cs-engine.js` | **재사용 모듈(계약)**. Worker 만들기·메시지 주고받기·중지/재시작·진행률 계산 |
| `core/engine-worker.js` | Worker 본체. 압축본(brotli→gzip→원본) 직접 받아 풀기, 런타임 시작, 한국어 리소스 확인, 예열, 실행 대기열(`check` 는 우회), Unity 입력 보관 |
| `core/code-editor.js` | 편집기: textarea(글자 투명) 뒤에 색칠 layer·밑줄 layer 를 겹쳐 그림, 줄 번호, 키 처리 |
| `core/symbol-bar.js` | 폰 기호 칩 |
| `core/class-diagram.js` | 구조 분석 결과 → SVG 클래스 다이어그램 (계층 배치·UML 선) |
| `index.html` `lab.js` `lab.css` `examples.js` | 실험실 화면(편집기·예제·진행률·실행/중지·출력·측정값) |
| `labs/grading/` | 채점 실험 페이지 |
| `labs/unity/` | Unity 시뮬레이터 페이지 (캔버스 그리기·키 입력) |
| `labs/patterns/` | 디자인 패턴 실험 페이지 + `patterns.json` |
| `labs/shared/` | 실험 페이지 공용(`boot.js` 엔진 부팅·로딩 막대, `labs.css`) |

### 검사·도구

| 파일 | 역할 |
|---|---|
| `qa/cases.json` | 테스트 케이스(코드·입력·기대 결과). 데스크톱 테스트와 브라우저 QA 가 함께 씀 |
| `qa/api-cases.json` | 엔진 API 케이스(runFiles·grade·check·unity·analyze). 역시 양쪽 공용 |
| `tools/data/make_patterns.py` | 디자인 패턴 데이터 원본 → `labs/patterns/patterns.json` 생성 (데스크톱 테스트도 이 JSON 을 돌림) |
| `tests/EngineTests/` | 데스크톱 .NET 에서 cases.json 실행 (CI 에서 매번) |
| `qa/browser/cdp.js` | npm 없이 크롬 DevTools 프로토콜로 페이지 조작 |
| `qa/browser/qa.js` | 브라우저 QA 전체(케이스·예제·편집기·중지·반응성·실시간 출력·연속 실행·모바일·로딩 시간) |
| `tools/ship.sh` `fetch-build.sh` `deploy.sh` | 커밋→빌드 대기 / 빌드 결과 받기 / 배포 |
| `.github/workflows/build.yml` | main push 마다: 데스크톱 테스트 → `dotnet publish` → 용량 기록(`lab-size.json`, `BUILD_INFO.txt`) → `build-output` 브랜치에 저장. **배포 안 함** |
| `.github/workflows/deploy.yml` | 수동 실행: `build-output` 그대로 GitHub Pages 에 배포 (QA 한 것과 같은 파일) |

## 3. 실행 한 번의 흐름 (Engine.RunAsync)

1. 빈 코드(주석·using 만)면 바로 `ok`.
2. 코드 끝에 `#pragma checksum` 한 줄을 붙여 파싱(줄 번호 안 바뀜, 배경은 PITFALLS 3).
3. **원본 트리**로 컴파일 → 진단(오류·경고) 수집. 오류가 있으면 `compile-error` 로 끝. 줄 번호는 원본 기준.
4. `GuardRewriter` 로 감시 코드를 넣은 트리 + `__LabGuard` 클래스로 다시 컴파일 → `Emit`(PE + Portable PDB).
5. `Assembly.Load(pe, pdb)` → 감시 마감 시각·재귀 상한 설정.
6. 콘솔 가로채기: `SetOut/SetError` → `CappedWriter`, 입력 → `StringReader(stdin)`.
7. 진입점 실행. `<Main>`(async 래퍼)이면 진짜 async 메서드(`<Main>$`)를 찾아 `await`.
8. 예외 → 쉬운 설명 + PDB 로 학습자 코드 줄 찾기. 감시 예외면 `stopped`.

## 3-1. 채점·진단·Unity 의 흐름

- **grade**: `CompileAsync` 한 번 → 테스트마다 `ExecuteAsync`(같은 바이트를 `Assembly.Load` 로 새로 올림 → 정적 변수 초기화, 감시 마감 새로) → `NormalizeOutput` 으로 비교.
- **check**: 파싱 + `GetDiagnostics` 만(Emit 없음). Worker 가 대기열에 넣지 않고 바로 처리 → 긴 실행·Unity 실시간 중에도 응답.
- **runUnity**: 파일 목록에 `UnityLite.cs` 를 붙이고 기본 using 을 Unity 식으로 바꿔 컴파일(UnityLite 파싱·감시 삽입 결과는 캐시) → 실행 전에 `UnityLiteHost` 정적 필드(프레임 수·실시간·입력 대본·입력/장면 통로)를 리플렉션으로 설정 → `Main` 이 MonoBehaviour 마다 오브젝트를 만들고 프레임 루프. 프레임마다 감시 마감을 2초로 다시 잡음. 실시간이면 프레임마다 `Console.Out.Flush()`(출력 전송) + 장면 문자열을 `labPostFrame` 으로 보내고 `Task.Delay` 로 약 16ms 쉼(그 사이 Worker 가 입력 메시지를 받음).

- **analyze**: check 처럼 Emit 없이 컴파일만 → 학습자 트리의 타입 선언마다 `GetDeclaredSymbol` 로 타입·멤버, 필드·속성 타입(모음 안의 타입까지)으로 has, 본문의 `new` 로 creates, 메서드 매개변수·반환으로 uses, 문법 노드 개수와 호출 이름을 셈 → 규칙을 주면 평가. Worker 에서 대기열 우회.

## 4. 로딩 (웹)

- 받는 것: .NET 런타임(`dotnet.native.wasm`), 어셈블리(webcil `.wasm`), ICU 한국어 조각(`icudt_CJK.dat`), Roslyn 한국어 리소스. gzip 합계 약 8.4MB, brotli 약 6.3MB.
- 파일 이름에 해시가 붙어 있어(.NET 9+ 지문) 브라우저 캐시를 안전하게 쓴다.
- Worker 의 리소스 로더가 `파일.br`(브라우저가 brotli 풀기를 지원할 때) 또는 `파일.gz` 를 받아 `DecompressionStream` 으로 푼다. GitHub Pages 의 자동 압축에 기대지 않는다.
- 진행률 = 받은 바이트 / `lab-size.json`(빌드 때 계산한 합계).
- 런타임이 뜨면 바로 `ready` → 예열(작은 코드 한 번 컴파일)은 뒤에서. 그 사이 실행 요청은 대기열에서 예열 뒤에 실행.
