# 문서 안내

정리 기준: 2026-10-02, 앱 v0.27.0 / 세계 저장 형식 v9. 앱 버전(v0.x), 저장 형식(v1~v9), Sites 배포 버전은 서로 다른 번호다.

## 현재 상태를 확인하는 순서

1. [README](README.md): 실행, 현재 기능, 사용법과 운영 한계.
2. [ROADMAP](ROADMAP.md): 단계별 완료 범위와 버전별 확장.
3. [DEVELOPMENT_PLAN](DEVELOPMENT_PLAN.md): 남은 검증·확장 후보와 완료 판단.
4. [TASKS](TASKS.md): 당시 실행한 테스트, 수정·재검증, 배포의 누적 기록.
5. [검증 보고서 안내](reports/README.md): 최신 증거와 과거 보고서의 대응 관계.

새 관찰 경험의 완료 기준은 [v0.20 매력 완성 로드맵](APPEAL_ROADMAP.md), 실제 실행 결과는 [검증 보고서](reports/appeal-validation.json)를 따른다.

현재 개발 범위는 [v0.27 내 아바타가 남긴 삶](DYNASTY_PLAN.md)이다. [v0.26 함께 준비하는 마을과 현장 관찰](COOPERATION_PLAN.md)은 이전 릴리스 기록이다. [v0.25 행동으로 이어지는 세계](LIVING_ACTIONS_PLAN.md)는 이전 릴리스 기록이다. 이전 모바일 UI 개발 범위는 [v0.24 모바일 UI 계획](MOBILE_UI_PLAN.md)에 기록한다. [v0.23 지속 운영·대화·공사·규모](CONTINUITY_PLAN.md)는 이전 릴리스 기록이다. [v0.22 범위](EXPANSION_PLAN.md)는 이전 릴리스 기록이다. 이전 저장 기능은 [v0.21 계획](OPERATIONS_PLAN.md)에 보존한다.

## 주제별 기준 문서

| 주제 | 문서 | 읽는 범위 |
| --- | --- | --- |
| 작업·배포 지침 | [AGENTS](AGENTS.md) | 지속되는 사용자 결정과 같은 사이트 배포 원칙 |
| 제품 목표 | [GAME_DESIGN](GAME_DESIGN.md) | 관찰 경험과 장기 목표 |
| 시스템 구조 | [ARCHITECTURE](ARCHITECTURE.md) | 서버·코어·화면·모델의 책임 |
| 세계와 주민 | [SIMULATION_DESIGN](SIMULATION_DESIGN.md), [NPC_ARCHITECTURE](NPC_ARCHITECTURE.md) | 현재 코어의 상태·행동·기억·저장 경계 |
| 지속 저장 | [SERVER_WORLD](SERVER_WORLD.md) | v0.16 저장 정책, 현재 권한·개인 기록·조회 |
| 공동 접속 | [SHARED_WORLD](SHARED_WORLD.md) | 초대 전용 접근, 역할, 개인 관찰, 공동 역사 |
| AI | [LLM_ARCHITECTURE](LLM_ARCHITECTURE.md), [CHROME_AI_PLAN](CHROME_AI_PLAN.md) | Chrome 우선·외부 API 명시 선택, 입력·검증·예산 |
| Chrome 실행 증거 | [CHROME_AI_VALIDATION](CHROME_AI_VALIDATION.md) | 사용자 수용과 실기기/모의 실행의 구분 |
| 가족·계승 | [CIVILIZATION](CIVILIZATION.md) | v0.6 도입 규칙; 당시 규모·저장 번호는 과거 기록 |
| 도시·산업 | [URBANISM](URBANISM.md) | v0.7~v0.9 확장; 이후 지도·생활 확장은 후속 문서 참조 |
| 역사·생태·공동체 | [HERITAGE](HERITAGE.md) | v0.8 도입 규칙과 당시 대규모 검증 범위 |
| 생활·외형·삶의 이야기 | [LIVING_SYSTEM_DESIGN](LIVING_SYSTEM_DESIGN.md) | 저장 v6/v7 도입 기록부터 앱 v0.18/v0.19 확장까지 |
| 기억 검색·성찰·계획 | [SMALLVILLE_RESEARCH](SMALLVILLE_RESEARCH.md) | v0.14 연구 적용과 후속 범위 |
| 약속·정기 모임 | [COMMUNITY_ACTIVITIES](COMMUNITY_ACTIVITIES.md) | v0.15 기본 규칙, v0.17 전달·조율, v0.18 정기 제안 |
| 최초 납품 | [MVP_SPEC](MVP_SPEC.md) | 초기 MVP의 범위와 수용 기준을 보존한 기록 |

## 기록을 해석하고 갱신하는 기준

현재 정책은 해당 주제의 최신 절을 따른다. 과거 버전의 인구·지도·저장·접근 정책이나 테스트 개수를 현재 제한으로 읽지 않는다. 실행 결과는 실제 보고서의 버전·조건·소스 커밋과 함께 해석한다. 이전 보고서를 현재 코드로 다시 실행한 결과처럼 표시하지 않는다.

기능 변경 시 주제 문서에 규칙을 기록하고, TASKS와 reports에 실제 실행·배포 결과를 남긴다. README와 ROADMAP에는 요약과 링크를 갱신한다. 사용자 수용, 모의 API 검증, 실기기 추론, 로컬 부하, 운영 배포 확인은 구분한다. 문서 정리만으로 과거 실패·건너뜀·배포 손실 경계를 지우거나 새 검증 성공을 추가하지 않는다.
