# C# 실험실

브라우저 안에서 C# 코드를 컴파일·실행하는 엔진과, 그 위에 올릴 기능들을 시험하는 **실험실**입니다.
검증이 끝난 기능은 [FEATURES.md](FEATURES.md)에 모아 두고, 파이썬 아카데미의 C# 코스(타이핑 전용)에서 가져다 씁니다.

- 주소: https://jihoon380462.github.io/csharp-lab/
- 엔진: .NET 10 WebAssembly + Roslyn 컴파일러, Web Worker(백그라운드)에서 실행. 서버·계정·API 키 없음.

## 구조
- `engine/` — C# 엔진(Engine.cs, GuardRewriter.cs, Exports.cs)과 페이지(wwwroot)
  - `wwwroot/core/` — 다른 페이지에서도 쓰는 검증된 모듈 (cs-engine.js, engine-worker.js)
  - `wwwroot/labs/` — 실험 중인 기능 (예정)
- `tests/EngineTests/` — 데스크톱 .NET에서 엔진 로직을 검사하는 테스트
- `qa/cases.json` — 테스트 케이스 (데스크톱 테스트와 브라우저 QA가 함께 사용)

## 빌드·배포 흐름
1. `main`에 push → `build` 워크플로가 테스트 + 빌드 후 결과물을 `build-output` 브랜치에 저장
2. `build-output`으로 브라우저 QA (PC·모바일)
3. QA 통과 후 `deploy` 워크플로를 수동 실행 → GitHub Pages 배포
