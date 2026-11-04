# labs — 실험 중인 기능

기능 하나당 폴더 하나: `labs/<이름>/index.html`. 엔진은 `../../core/cs-engine.js`(또는 `../shared/boot.js` 의 `bootEngine`)로 불러 쓴다.
QA 를 통과하면 재사용할 코드를 `core/` 로 옮기고 저장소 루트 `FEATURES.md` 의 ✅ 표에 기록한다. 절차는 `docs/ADD.md` 2·8절.

| 폴더 | 내용 |
|---|---|
| `grading/` | 여러 파일(학습자 + 숨은 채점 코드) 컴파일 + 테스트 일괄 채점 (`engine.grade`) |
| `unity/` | Unity 시뮬레이터 — UnityLite 로 MonoBehaviour·Start·Update 를 실시간 실행, 캔버스에 그림 (`engine.runUnity`) |
| `patterns/` | 디자인 패턴 24개 — 실시간 클래스 다이어그램(`core/class-diagram.js`) + 구조 체크(`engine.analyze`) + 채점. 데이터는 `patterns.json`(생성: `tools/data/make_patterns.py`) |
| `shared/` | 실험 페이지 공용 스타일·엔진 부팅(`boot.js`) |
