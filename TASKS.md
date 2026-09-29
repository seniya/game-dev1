# 구현 작업

아래 목록은 구현·검증 완료 시 실제 결과로 갱신한다.

- [x] Phase 0: 7개 설계 문서 작성, MVP/후속 범위 확정
- [x] Phase 1: serializable state, seeded RNG, world, tick, pathfinding, events
- [x] Phase 2: needs, utility decision, action execution, debug reasons
- [x] Phase 3: production, consumption, sleep, storage, market, loans
- [x] Phase 4: relationships, memories, decay, event provenance
- [x] Phase 5: scarcity, sharing, theft, witnesses, rumors
- [x] Phase 6: importance gate, Mock provider, validated results, budget/error handling
- [x] Phase 7: dashboard, map, inspector, event history, speed/experiments
- [x] Phase 8: save/load, headless CLI, tests, browser validation, README

## v0.2 변경과 검증

- 코어 테스트 26개: 기존 17개와 거래/임금/가격/상환/소문 중복/경험 기반 선택/저장 변환/투자/재계획 검증 9개.
- 브라우저 테스트 4개: 기존 저장/복원/모바일 검증과 경제 그래프·표·실제 사건 근거·관측 내보내기·생애 타임라인.
- TypeScript 검사 및 Vite production build.
- `npm run regression`: 시드 7/42/123 × 100/365일 × 정상/가뭄/100명 조건. 회계 보존, 저장 연속성, 독립 재실행, 참조 무결성, 행동 정체를 검증하며 결과는 `reports/regression.json`에 저장한다.
- 데스크톱 1440px 및 모바일 390px 경제 화면 직접 검토.
- 기존 저장 데이터는 v2로 변환하며 회계/그래프는 변환 이후부터 기록한다.

## MVP 이후 개발 순서

세부 범위·의존 순서·완료 기준: [ROADMAP.md](ROADMAP.md).
최종 제품 경험: [GAME_DESIGN.md](GAME_DESIGN.md)의 ‘최종적으로 만들 세계’.

- [x] 1. 경제 순환: 주민 간 거래, 노동 보상, 수요/재고 가격, 부분/연체 상환, 생산 투자
- [x] 2. 사회적 선택: 관계 기반 상대 선택, 경험의 누적 영향, 목격/소문 구분과 중복 방지
- [x] 3. 관찰 UI: 인과 타임라인, 주민 생애 기록, 날짜별 경제·인구·갈등 그래프
- [x] 4. 장기 검증: 여러 시드의 100일/365일 실행, 불변식·행동 정체·성능·재현성 확인
- [x] 5. 지속 세계: 서버 저장, 기기 간 공유, 비접속 진행 정책, 사건 아카이브/색인
- [ ] 6. 실제 LLM: 서버 어댑터, 중요한 목표/해석/대화, 비용 제어와 장애 시 연속 실행
- [ ] 7. 생애/세대: 가족 형성, 출생/양육/노화/사망, 상속/기술 전승
- [ ] 8. 여러 마을: 토지/건축, 이주/교역, 수백 명 LOD, 사회 변화와 환경 확장

## v0.3 지속 세계 완료

- Worker/D1 서버 권위 세계, 서버 시간 기반 진행, 기본 비접속 정지와 opt-in 최대 144틱 반영.
- 원자적 리비전 비교·명령 ID 중복 방지·실패 rollback, 다른 기기 충돌 안내.
- 체크포인트의 참조 폐쇄 압축, 원본 사건 아카이브와 주민·날짜·원인 색인, 페이지 조회.
- 서버 JSON 내보내기/가져오기, 기기 저장 마이그레이션, 교체 전 백업 복원, 기존 로컬 모드 유지.
- 코어·서버 32개 / 브라우저 5개 통과, TypeScript와 production Worker/UI build 확인.
- 서버 장기 보관의 한계와 운영 방식은 SERVER_WORLD.md에 기록. 실제 LLM·세대·여러 마을(6~8단계)은 후속 범위.
