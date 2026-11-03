# 개발 안내 — 빌드·QA·배포

## 1. 작업 환경 제약 (Claude 작업 샌드박스 기준, 2026-11 확인)

| 할 수 있다 | 할 수 없다 → 대신 |
|---|---|
| git(GitHub) clone·push, `gh run list`, `gh api` 일부 REST | .NET SDK 설치·NuGet 받기 (`api.nuget.org`, `builds.dotnet.microsoft.com` 차단) → **빌드·데스크톱 테스트는 GitHub Actions** |
| 헤드리스 크롬(`/usr/bin/google-chrome`), Node 22 | npm 설치(레지스트리 차단) → QA 스크립트는 패키지 없이 Node 내장 기능만 사용 |
| | `*.github.io`(배포된 사이트) 접속 → 배포 전 `build-output` 을 로컬 서버로 띄워 QA. 배포 후 실제 주소 확인은 사용자 기기 또는 연결된 브라우저 |
| | GitHub Pages 설정 API(`repos/.../pages`) → 사용자가 저장소 Settings → Pages → Source: GitHub Actions 로 한 번 켜 둠(완료) |
| | GraphQL(`gh pr create`, `gh workflow run`) → REST 로: `gh api repos/<o>/<r>/pulls ...`, `gh api -X POST .../actions/workflows/<f>/dispatches -f ref=main` |

로컬에 .NET 10 SDK 가 있는 환경이면 `dotnet run --project tests/EngineTests -- qa/cases.json`, `dotnet publish engine/CsEngine.csproj -c Release -o out` 를 그대로 돌려도 된다.

## 2. 한 바퀴 (수정 → QA → 배포)

```bash
# 1) 고치고 커밋·push → CI 테스트+빌드 → 결과물 받기
tools/ship.sh "엔진: ○○ 고침

Co-Authored-By: ..." /tmp/lab-serve

# 2) 브라우저 QA (PC + 모바일). 실패 0 이어야 함
node qa/browser/qa.js /tmp/lab-serve qa/cases.json /tmp/lab-shots all

# 3) 스크린샷 눈으로 확인 (/tmp/lab-shots/*.png) — 레이아웃·문구

# 4) 배포 (QA 통과한 build-output 그대로)
tools/deploy.sh
```

- CI 데스크톱 테스트가 실패해도 빌드는 계속된다(결과는 `build-output` 의 `TEST_RESULT.txt`). 실패가 있으면 배포하지 않는다.
- `BUILD_INFO.txt` 에 용량(gzip/brotli 합계, 큰 파일 15개, 파일 목록)이 남는다. 용량이 갑자기 늘면 트리밍 루트를 확인.
- 배포 후 사용자에게: 페이지 맨 위 버전(vX.Y.Z)으로 확인, 최대 10분은 이전 버전이 보일 수 있음(Pages 캐시).

## 3. 버전

- `engine/Core/Engine.cs` 의 `EngineVersion` 과 `engine/wwwroot/index.html` 의 `<span id="ver">` 를 함께 올린다. 실험실 화면 맨 위에 보인다.
- 기능 추가 = 0.x.0, 수정·문서 = 0.x.y. `docs/CHANGELOG.md` 에 기록.

## 4. 테스트 케이스 추가

`qa/cases.json` 에 항목 추가 → 데스크톱(CI)·브라우저 QA 양쪽에서 자동으로 돈다.

```json
{ "id": "새-케이스", "code": "Console.WriteLine(1);", "stdin": "선택", "expect": {
    "status": "ok",                      // 필수에 가까움
    "stdoutEquals": "1\n",               // 출력 전체 비교
    "errorType": "IndexOutOfRangeException",
    "errorLine": 3,                      // 브라우저 QA 에서는 '참고'로만 표시
    "diagLines": [1, 3],                 // 컴파일 오류 줄 목록
    "hasWarning": true } }
```

새 기능에는 반드시 케이스를 붙인다. 브라우저 전용 동작(중지·실시간 출력 등)은 `qa/browser/qa.js` 에 `mark(조건, "이름", 상세)` 로 추가.

## 5. 학습자 코드용 라이브러리 늘리기

두 군데를 **짝으로** 고친다.
1. `engine/LabRefs.props` 의 `LabRefName` — 컴파일할 때 보이는 타입(참조 어셈블리).
2. `engine/CsEngine.csproj` 의 `TrimmerRootAssembly` — 실행할 때 필요한 구현(트리밍으로 지워지지 않게).
   - 형식 전달(facade) 어셈블리(`System.Runtime` 등)도 루트로 둬야 한다(PITFALLS 5).
3. `qa/cases.json` 의 `bcl-coverage` 처럼 새 라이브러리를 실제로 쓰는 케이스 추가 → 컴파일·실행 둘 다 확인.

## 6. 새 기능 실험 → 검증 → 모음 (FEATURES.md)

1. `engine/wwwroot/labs/<이름>/index.html` 에 실험 페이지를 만든다(엔진은 `../../core/cs-engine.js` 로 import). 엔진(.NET) 변경이 필요하면 `Engine.cs` 에 추가하되 기존 결과 모양은 유지.
2. FEATURES.md 「🧪 실험 중」에 한 줄.
3. 케이스·브라우저 QA 추가 → 통과.
4. 재사용할 부분을 `core/` 로 옮기고 FEATURES.md 「✅ 검증 완료」 표에 위치·사용법·검증 근거·버전 기록. 실험 페이지는 남겨도 된다(데모).

## 7. CI 워크플로 요약

- `build.yml` (main push, 수동): setup-dotnet 10 → `tests/EngineTests` 실행(실패해도 계속) → `dotnet publish` → `lab-size.json`·`BUILD_INFO.txt`·`TEST_RESULT.txt` → `build-output` 브랜치 강제 push.
- `deploy.yml` (수동만): `build-output` 체크아웃 → Pages 배포.
- Node 20 액션 경고는 무시해도 됨(러너가 Node 24 로 실행).
