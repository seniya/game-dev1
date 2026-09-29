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

## 검증 기록
- 코어 테스트 17개: 결정성, 저장 연속성, 경로, 자원 보존, 사회적 인과관계, LLM 권한/오류, 100일 실행.
- 브라우저 테스트 3개: 실제 조작·저장 복원, 모바일/잘못된 파일, 초기화 백업/재접속.
- TypeScript 검사와 Vite production build.
- Seed 42 / 12명 / 100일: 사망 0, 공유 21, 절도 2, Mock 해석 48, 사건 40,364.
- 100명 / 100일 / AI off: 공유 278, 절도 99, 자원 부족 사망 88. 자동 자원 확충은 하지 않음.
- 데스크톱 1440px 및 모바일 390px 화면 직접 검토.

## 후속 백로그
- 실제 LLM 공급자용 서버 어댑터와 인증/비밀 관리
- Worker 실행, 대규모 이력 저장/색인, LOD
- 토지 소유와 실제 건물 배치, 동물/질병/전투
- 여러 마을, 세대 변화, 가족 형성
