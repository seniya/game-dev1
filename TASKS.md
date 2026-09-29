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
- [x] 6. 실제 LLM: 서버 어댑터, 중요한 목표/해석/대화, 비용 제어와 장애 시 연속 실행
- [ ] 6A. Chrome 내장 AI 우선 선택: 구조화 목표 선택·한국어 표시, 기기 실행권·서버 검증, 외부 API의 명시적 선택
- [ ] 7. 생애/세대: 가족 형성, 출생/양육/노화/사망, 상속/기술 전승
- [ ] 8. 여러 마을: 토지/건축, 이주/교역, 수백 명 LOD, 사회 변화와 환경 확장

## v0.3 지속 세계 완료

- Worker/D1 서버 권위 세계, 서버 시간 기반 진행, 기본 비접속 정지와 opt-in 최대 144틱 반영.
- 원자적 리비전 비교·명령 ID 중복 방지·실패 rollback, 다른 기기 충돌 안내.
- 체크포인트의 참조 폐쇄 압축, 원본 사건 아카이브와 주민·날짜·원인 색인, 페이지 조회.
- 서버 JSON 내보내기/가져오기, 기기 저장 마이그레이션, 교체 전 백업 복원, 기존 로컬 모드 유지.
- 코어·서버 32개 / 브라우저 5개 통과, TypeScript와 production Worker/UI build 확인.
- 서버 장기 보관의 한계와 운영 방식은 SERVER_WORLD.md에 기록. v0.3 당시 실제 LLM·세대·여러 마을(6~8단계)은 후속 범위였으며, 실제 LLM 구현은 아래 v0.4에 추가했다.

## v0.4 서버 모델과 근거 있는 회상

- Ollama/구조화 JSON Chat Completions 호환 서버 어댑터, 서버 전용 설정과 인증, Mock/off/remote 선택.
- D1 호출 예약·전역 lease·UTC 일일 예산, 출력/본문/timeout 상한과 backoff, 모델 응답을 기다리지 않는 세계 진행.
- 사건/개인 기억의 근거 ID 검증, 허용 목표·관계 의미만 반영, 기억에 근거한 말과 사건 링크.
- 세계·AI 설정 세대와 리비전 재검증, 승인 결과 저장 후 재개, 초기화에도 유지되는 시도별 감사와 사용량.
- 코어·서버 42개, 브라우저 7개, production Worker/UI build 및 장기 회귀 확인.
- 실제 공급자 호출은 미설정 상태로 배포한다. 실모델 응답 품질·공급자별 호환성은 설정 후 확인해야 하며 검증 경계는 LLM_ARCHITECTURE.md에 명시한다.

## 6A Chrome 내장 AI 시험 구현과 남은 수용 검증

개발 방향은 2026-09-29 사용자 결정으로 확정했다. 코드·모의 API 검증을 추가했으며 실제 Gemini Nano 추론 확인은 남아 있다. 상세 명세는 [CHROME_AI_PLAN.md](CHROME_AI_PLAN.md)를 따른다.

- [x] 공급자별 지원 기능, 영어 구조화 context와 목표/이유 코드/근거 계약, 한국어 문구 생성
- [x] Chrome API 가용성·다운로드 상태, 사용자 활성화, session 정리·취소·timeout
- [x] 서버의 기기별 실행권 할당, 응답 제출·검증·영구 저장과 중복/만료 처리
- [x] Chrome / 외부 API / Mock / off 선택과 기기별 상태, 공급자별 감사 표시
- [x] 외부 API의 사용자 설정·선택 유지, Chrome 미지원/실패 시 외부 자동 호출 차단
- [x] 다중 탭/기기 실행권, 미지원·다운로드 실패·숨김·변조, 저장 및 모바일 관찰 자동 검증
- [x] 마지막 프롬프트/표시 수정 후 브라우저 전체 재실행과 추가 timeout 테스트 — 환경 제한 해소, 코어·서버 51개 / 브라우저 15개 통과
- [x] 기기 입력량 측정·한도 초과 분리, 서버 거부 시 실행 중단, 취소 후 늦은 다운로드 정리, 최근 20회 기기 진단 JSON
- [x] 실제 모델 테스트를 설치된 정식 Chrome으로 분리하고 미지원 결과를 성공으로 계산하지 않도록 수정
- [ ] 실제 지원 기기에서 Gemini Nano 목표 선택과 한국어 근거 반영 수용 검증

검증 환경과 재현 명령은 [CHROME_AI_VALIDATION.md](CHROME_AI_VALIDATION.md)에 기록한다. 6A 전체 완료 및 7단계 착수는 실제 모델 수용 검증 이후다.

2026-09-29 재확인: 설치된 Google Chrome 148.0.7778.178은 영어 text `availability()`가 `unavailable`이다. 사용자도 현재 지원 기기가 없다고 확인했다. 실제 추론 완료를 주장하거나 7~8단계로 넘어가지 않는다. 지원 기기 확보 후 같은 수용 테스트를 재개한다.
