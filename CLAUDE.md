# csharp-lab — 다른 세션을 위한 첫 안내

이 저장소는 사용자(jihoon380462)의 **C# 관련 개발의 기준 저장소**다. 다른 프로젝트에서 C# 을 다룰 때 이 저장소를 먼저 참조한다.
사용자는 한국어로 대화한다.

## 무엇이 있나

- **브라우저 안 C# 실행 엔진**: .NET 10 WebAssembly + Roslyn 컴파일러, Web Worker 에서 실행. 서버 없음.
  - 주소: https://jihoon380462.github.io/csharp-lab/ (실험실 화면)
- **검증된 기능 목록**: `FEATURES.md` — ✅ 표시된 것만 다른 프로젝트에 가져다 쓴다. 🧪 는 실험 중.
- **문서** (`docs/`, 목적별 — 안내는 `docs/README.md`)
  - 🔎 찾아볼 때 `REFERENCE.md` — 위치 색인, 웹·데스크톱 API, 결과 형식(계약), 지원 범위, 제한값, 용어
  - ➕ 추가할 때 `ADD.md` — 기능·케이스·라이브러리·예제·오류 설명 추가 절차와 체크리스트
  - 🔧 유지보수할 때 `MAINTAIN.md` — 작업 환경 제약, 수정→QA→배포, 증상별 진단표, 업그레이드, 되돌리기, 정기 점검
  - 보조: `ARCHITECTURE.md`(구조), `PITFALLS.md`(브라우저 .NET 함정 — 다른 C#/WebAssembly 작업에도 유용), `CHANGELOG.md`

## 작업 규칙 (사용자 지시)

1. **QA 먼저, 배포는 나중**: push 는 빌드만 한다. `build-output` 브랜치로 테스트(데스크톱 + 브라우저 PC·모바일)를 직접 다방면으로 돌리고 통과한 뒤에만 `deploy` 를 실행한다.
2. **실험실 → 검증 → 모음**: 새 기능은 `engine/wwwroot/labs/<이름>/` 에서 실험하고, QA 를 통과하면 `core/` 또는 엔진으로 옮긴 뒤 `FEATURES.md` ✅ 표에 위치·사용법·검증 근거를 적는다.
3. **계약을 깨지 않는다**: `core/cs-engine.js` 의 `createCsEngine` 와 실행 결과 모양(docs/REFERENCE.md 4절)은 아카데미(python-academy)가 쓴다. 바꿔야 하면 새 경로(`core/v2/`)로 낸다.
4. 오래 걸리는 작업은 진행률(%)을 알리고, 한 단계를 끝내면 다음 선택지를 번호 목록으로 제시한다.
5. 설정을 바꾸라고 안내할 때는 어느 화면 → 어느 탭/섹션 → 어느 칸인지 위치까지.

## 빠른 명령

```bash
tools/ship.sh "메시지" <serve폴더>        # 커밋·push → CI 테스트+빌드 대기 → build-output 받기
node qa/browser/qa.js <serve폴더> qa/cases.json <스크린샷폴더> all   # 브라우저 QA (PC+모바일)
tools/deploy.sh                           # QA 통과 후 GitHub Pages 배포
```

작업 샌드박스에는 .NET SDK·NuGet 이 없을 수 있다 → 빌드와 데스크톱 테스트는 GitHub Actions(`build` 워크플로)에서 한다. 자세한 건 `docs/MAINTAIN.md`.

## 관련 저장소

- `jihoon380462/python-academy` — 학습 사이트. C# 코스(타이핑 전용)가 이 엔진을 `/csharp-lab/core/cs-engine.js` 로 불러 쓸 예정 (그 저장소 EXPANSION.md 15절).
