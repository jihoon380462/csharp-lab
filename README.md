# C# 실험실 (엔진 테스트)

브라우저 안에서 C# 코드를 컴파일·실행하는 엔진 시제품입니다. 파이썬 아카데미에 C# 코스를 넣기 전에 로딩 속도와 동작을 확인하는 용도입니다.

- 주소: https://jihoon380462.github.io/csharp-lab/
- 엔진: Blazor WebAssembly(.NET 8) + Roslyn 컴파일러. 서버·계정·API 키 없음.
- 보호 장치: 실행 5초 제한, 재귀 2,000단계 제한, 출력 10만 자 제한 (반복문·메서드에 감시 코드를 자동 삽입).

## 구조
- `engine/` — 엔진(Engine.cs, GuardRewriter.cs)과 테스트 페이지(wwwroot)
- `tests/EngineTests/` — 데스크톱 .NET에서 엔진 로직을 검사하는 테스트
- `qa/cases.json` — 테스트 케이스 (데스크톱 테스트와 브라우저 QA가 함께 사용)

## 빌드·배포 흐름
1. `main`에 push → `build` 워크플로가 테스트 + 빌드 후 결과물을 `build-output` 브랜치에 저장
2. `build-output`으로 브라우저 QA
3. QA 통과 후 `deploy` 워크플로를 수동 실행 → GitHub Pages 배포
