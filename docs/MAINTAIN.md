# 🔧 유지보수할 때 — 고치기·점검·업그레이드·배포

버그를 고치거나, 문제가 생겼거나, 버전을 올리거나, 배포할 때 보는 문서입니다.
위치·API 는 [REFERENCE.md](REFERENCE.md), 새로 넣는 절차는 [ADD.md](ADD.md), 과거에 겪은 함정은 [PITFALLS.md](PITFALLS.md).

목차: 0 작업 환경 · 1 한 바퀴(수정→QA→배포) · 2 버그 고치는 순서 · **3 증상별 진단표** · 4 계약 지키기 · 5 업그레이드 · 6 되돌리기 · 7 정기 점검

---

## 0. 작업 환경 제약 (Claude 작업 샌드박스, 2026-11 확인)

| 할 수 있다 | 할 수 없다 → 대신 |
|---|---|
| git clone·push(GitHub), `gh run list`, `gh api` REST 일부 | .NET SDK 설치·NuGet(`api.nuget.org`, `builds.dotnet.microsoft.com` 차단) → **빌드·데스크톱 테스트는 GitHub Actions** |
| 헤드리스 크롬(`/usr/bin/google-chrome`), Node 22 | npm 설치(차단) → QA 스크립트는 Node 내장 기능만 |
| | `*.github.io` 접속(배포된 사이트) → 배포 전 `build-output` 을 로컬 서버로 띄워 QA. 배포 후 확인은 사용자 기기 |
| | Pages 설정 API → 사용자가 저장소 **Settings → Pages → Build and deployment → Source: GitHub Actions** (설정 완료) |
| | GraphQL(`gh pr create`, `gh workflow run`) → REST: `gh api -X POST repos/jihoon380462/csharp-lab/actions/workflows/<파일>/dispatches -f ref=main` |

.NET 10 SDK 가 있는 PC 라면 로컬에서도: `dotnet run --project tests/EngineTests -c Release -- qa/cases.json`, `dotnet publish engine/CsEngine.csproj -c Release -o out`.

## 1. 한 바퀴: 수정 → QA → 배포

```bash
S=/tmp/lab        # 아무 작업 폴더
tools/ship.sh "고친 내용 요약

Co-Authored-By: ..." $S/serve                 # 커밋·push → CI 테스트+빌드 대기 → build-output 을 $S/serve/csharp-lab 에
node qa/browser/qa.js $S/serve qa/cases.json $S/shots all   # 실패 합계 0 이어야 함 (약 3분)
# $S/shots/*.png 를 눈으로 확인 (PC 로딩·완료·예제, 모바일 로딩·완료·오류)
tools/deploy.sh                                 # QA 한 build-output 그대로 Pages 에
```

- CI 데스크톱 테스트가 실패해도 빌드는 끝까지 간다 → `ship.sh` 출력의 `FAIL` 줄과 `tests:` 확인. 실패면 배포 금지.
- 배포 뒤 사용자 안내: 화면 맨 위 버전으로 확인, 최대 10분은 이전 버전이 보일 수 있음(Pages 캐시) → 새로고침.

## 2. 버그 고치는 순서

1. **재현 케이스 먼저**: `qa/cases.json`(엔진) 또는 `qa/browser/qa.js` `mark`(화면·Worker)에 넣고 실패하는 걸 확인.
2. 원인 찾기: 3절 진단표 → PITFALLS.md 검색 → `internal-error` 면 결과의 `error.message`(스택 1500자 포함).
3. 고치기. `Core/` 는 데스크톱·브라우저 둘 다 영향.
4. 1절 한 바퀴. 새 함정이면 PITFALLS.md 에 「증상 → 원인 → 해결 → 검증」으로 기록.
5. CHANGELOG(수정은 0.x.y).

## 3. 증상별 진단표

| 증상 | 먼저 볼 것 | 흔한 원인 → 해결 |
|---|---|---|
| 진행률이 멈추고 「준비 완료」가 안 뜸 | 브라우저 콘솔(Worker 포함), `__lab.failed` | 파일 404(빌드 구조 변경·경로) / `lab-size.json` 없음(진행률만 0) / `dotnet.js` 임포트 실패(모듈 Worker 미지원 브라우저) |
| 「엔진을 불러오지 못했습니다」 | `onError` 메시지 | 위와 같음. 로컬 QA 서버의 MIME(`.wasm` = `application/wasm`) |
| 컴파일 오류가 영어 | `info.diag` 의 `ko=` | 한국어 위성 리소스 미로딩 → csproj `SatelliteResourceLanguages=ko`, worker `loadAllSatelliteResources`, `InvariantGlobalization=false` (PITFALLS 4) |
| `internal-error` + `Cannot wait on monitors` | `error.message` 스택 | 막고 기다리는 코드(`.Result`, `.Wait()`) → async 로 / Roslyn Emit 이면 양보·재시도가 빠졌는지 (PITFALLS 2·3) |
| `runtime-error` + `TypeLoadException ... System.Runtime` | 어떤 타입인지 | 트리밍이 형식 전달 삭제 → facade 를 `TrimmerRootAssembly` 에 (PITFALLS 5) |
| `runtime-error` + `MissingMethodException` | 어떤 메서드인지 | 그 구현 어셈블리가 루트에 없음 → `TrimmerRootAssembly` 추가 |
| 정상 코드가 `compile-error` 「형식이나 네임스페이스를 찾을 수 없습니다」 | 그 타입의 어셈블리 | `LabRefs.props` 에 참조 없음 → ADD.md 4절 |
| 실행 오류 줄 번호가 null 또는 어긋남 | 케이스 `errorLine` | `GuardRewriter` 가 줄바꿈을 넣었는지, PDB Emit 이 빠졌는지 (PITFALLS 7) |
| 실행 중 화면이 멈춤 | `qa.js` 「타이머 지연」 | 엔진이 Worker 가 아니라 메인 스레드에서 돌고 있음(구조 변경 확인) |
| ■ 중지 후 다시 안 됨 | `__lab.state` | 재시작 실패 → Worker 생성 오류(콘솔) |
| 용량이 갑자기 늘어남 | `BUILD_INFO.txt` 큰 파일 15개 | 새 패키지가 트리밍 루트에 통째로 들어감 / `TrimMode` 변경 |
| CI `build` 실패: 참조 팩 못 찾음 | 로그의 `LabRefs:` 줄 | SDK 버전 변경으로 경로가 바뀜 → `LabRefs.props` `LabRefDir` 확인 |
| CI `build` 실패: 패키지 복원 | 로그 | 버전 표기(`4.14.0`) 오타, NuGet 장애 → 재실행 |
| `deploy` 실패 | `gh run view <id> --log` | Pages 가 꺼짐(0절 설정), `build-output` 브랜치 없음(빌드 먼저) |
| 배포했는데 옛 버전이 보임 | 화면 맨 위 버전 | Pages 캐시(최대 10분) → 새로고침. 파일 이름에 해시가 있어 엔진 파일은 섞이지 않음 |
| 폰에서만 문제 | 실제 기기 | 헤드리스 CPU 제한이 Worker 에 안 걸림(PITFALLS 12) → 사용자에게 화면·측정값(엔진 로딩·예열·컴파일) 캡처 요청 |

## 4. 계약 지키기 — 아카데미가 쓰는 것

- 고정: `core/cs-engine.js` 의 `createCsEngine`·`run`·`stop`·콜백 이름, 결과 모양(REFERENCE 4절), 경로 `/csharp-lab/core/cs-engine.js`.
- 추가는 자유(새 콜백·새 결과 필드·새 메서드).
- **깨야 할 때**: ① `engine/wwwroot/core/v2/` 에 새 모듈 ② 예전 `core/` 는 그대로 동작하게 유지(같은 Worker·엔진을 공유해도 됨) ③ FEATURES.md·REFERENCE.md 에 v2 표시 ④ 아카데미 쪽 이전은 그 저장소 절차(브랜치 → PR)로.
- 바꾸기 전 확인: python-academy 에서 `grep -rn "csharp-lab" .` 로 쓰는 곳.

## 5. 업그레이드

**.NET (예: 10 → 11)**
1. `build.yml` `dotnet-version`, 두 csproj `TargetFramework`, `LabRefs.props` 의 `ref/net10.0` 경로.
2. 빌드 → `BUILD_INFO.txt` 파일 목록이 크게 달라졌는지(`dotnet.js` 구조, 부팅 방식).
3. worker 의 `dotnet.with*` API 가 그대로인지(바뀌면 PITFALLS 9·10 참고해 수정).
4. 전체 QA. 첫 방문·재방문 시간 비교 기록(CHANGELOG).
- .NET 10 은 LTS(지원 2028-11). 그 전에 다음 LTS 로.

**Roslyn (Microsoft.CodeAnalysis.CSharp)**
1. 엔진 csproj 와 테스트 csproj 의 버전을 **같이** 올림.
2. 언어 버전 올릴 거면 `Engine.cs` `ParseOptions`.
3. 연속 실행 케이스(QA 「연달아 8번」)로 Emit 대기 문제 재발 확인(PITFALLS 3).

**GitHub Actions 액션 버전**: Node 버전 경고가 오류로 바뀌면 `actions/*` 메이저 올림.

## 6. 되돌리기

`build-output` 은 매번 덮어쓰므로 예전 빌드가 남지 않는다. 되돌리려면:
1. `git revert <문제 커밋>` → `tools/ship.sh "되돌림: ..."` (CI 가 예전 상태로 다시 빌드)
2. QA → `tools/deploy.sh`.

급할 때(QA 없이)도 이 순서가 가장 빠르다(빌드 약 1분 30초).

## 7. 정기 점검 (기능 추가 전후, 또는 한 달에 한 번)

- [ ] `tools/ship.sh` 없이도 `gh run list -R jihoon380462/csharp-lab -L 5` 로 최근 빌드가 초록인지
- [ ] 브라우저 QA `all` 실패 0, 로딩 시간이 이전 기록보다 크게 늘지 않았는지 (CHANGELOG 의 수치)
- [ ] `BUILD_INFO.txt` 용량 (gzip 약 8.4MB 기준)
- [ ] FEATURES.md ✅ 항목이 아직 사실인지(위치·파일 이름)
- [ ] .NET·Roslyn 지원 기한
