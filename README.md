# C# 실험실

브라우저 안에서 C# 코드를 컴파일·실행하는 엔진과, 그 위에 올릴 기능들을 시험하는 **실험실**입니다.
C# 관련 개발의 기준 저장소로, 검증이 끝난 기능은 [FEATURES.md](FEATURES.md)에 모아 둡니다.

- 실험실 화면: https://jihoon380462.github.io/csharp-lab/
- 엔진: .NET 10 WebAssembly + Roslyn 컴파일러, Web Worker(백그라운드)에서 실행. 서버·계정·API 키 없음.

## 문서

| 문서 | 내용 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | 다른 세션이 처음 읽는 안내 (작업 규칙 포함) |
| [FEATURES.md](FEATURES.md) | ✅ 검증된 기능 / 🧪 실험 중 / 💡 후보 |
| [docs/MANUAL.md](docs/MANUAL.md) | 사용 설명서 — 웹·데스크톱에서 엔진 쓰기, 결과 형식(계약), 제한 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 구조와 실행 흐름, 파일별 역할 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 빌드·QA·배포 절차, 작업 환경 제약, 케이스·라이브러리 추가 |
| [docs/PITFALLS.md](docs/PITFALLS.md) | 브라우저에서 .NET/Roslyn 돌릴 때의 함정과 해결 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 버전별 변경 |

## 폴더

```
engine/
  CsEngine.csproj, LabRefs.props   .NET 10 WebAssembly 프로젝트 / 학습자용 참조 어셈블리 목록
  Core/       엔진 본체 (플랫폼 무관 — 데스크톱 .NET 에서도 그대로 사용)
  Browser/    브라우저 진입점 (JSExport)
  wwwroot/
    core/     재사용 모듈 (cs-engine.js, engine-worker.js) ← 다른 페이지가 import
    labs/     실험 중인 기능
    index.html, lab.js, lab.css, examples.js   실험실 화면
tests/EngineTests/   데스크톱 .NET 테스트 (CI)
qa/
  cases.json         테스트 케이스 (데스크톱·브라우저 공용)
  browser/           헤드리스 크롬 QA (npm 불필요)
tools/               ship.sh (커밋→빌드) · fetch-build.sh · deploy.sh
docs/                문서
.github/workflows/   build.yml (push 마다 테스트+빌드, 배포 안 함) · deploy.yml (수동 배포)
```

## 빌드·배포 흐름
1. `main` 에 push → `build` 워크플로가 테스트 + 빌드 후 결과물을 `build-output` 브랜치에 저장
2. `build-output` 으로 브라우저 QA (PC·모바일)
3. QA 통과 후 `deploy` 워크플로를 수동 실행 → GitHub Pages 배포
