# 전체 아키텍처

```text
src/ui (DOM, Canvas, localStorage)     src/cli.ts (파일, 인자, 통계)
                 ↓ commands / ↑ snapshots
                    src/sim/engine.ts
               ↙          ↓          ↘
       decision.ts     social.ts    world.ts / pathfinding.ts
                    types.ts / random.ts
                         ↑ validated intents only
                 src/llm/coordinator.ts
                         ↓
                   LLMProvider / Mock
```

## 책임
- `types.ts`: JSON state와 command/provider 경계 계약.
- `world.ts`: seed 기반 초기 마을, 엔티티, 환경 데이터.
- `decision.ts`: 순수 Utility 후보·실행 계획. 세계 변경 금지.
- `engine.ts`: 유일한 public 상태 변경 진입점. 틱/행동/명령/검증/저장.
- `economy.ts`: 엔진이 호출하는 회계/가격/일별 관측 reducer 및 보존 검사.
- `affinity.ts`: 본인의 관계·기억에 근거한 순수 상대 평가.
- `ui/observatory.ts`: 경제 그래프/표와 생애·인과 타임라인.
- `regression.ts`: 다중 시드·조건 장기 검증과 보고서.
- `social.ts`: 엔진 내부 이벤트 reducer. 관계/기억과 판단 큐.
- `llm/`: 공급자 교체, 예산 게이트 이후 비동기 처리. 복제된 context 사용.
- `ui/`: Canvas 지도와 한국어 debug dashboard. simulation state를 직접 수정하지 않는다.
- `cli.ts`: 브라우저 의존성 없는 실행과 JSON 분석/저장.

## 선택
TypeScript + Vite + DOM/Canvas. 렌더러 라이브러리나 외부 API 없이 실행한다. Node `node:test` + tsx로 코어를 검증한다. 순수 TS 코어이므로 향후 Worker/서버/다른 렌더러로 이동할 수 있다. 브라우저는 fixed tick accumulator를 사용하고 프레임당 처리량을 제한한다. 탭 복귀 시 누적 실시간을 버려 과도한 catch-up을 피한다.

## 불변식
자원/화폐는 유한한 0 이상의 값이다. 행동은 대상에 인접/도착한 경우만 실행한다. 죽은 주민은 행동하지 않는다. 모르는 범죄의 범인에 대한 관계 페널티는 없다. 모든 관계 변경과 고차원 해석은 실제 사건 ID를 가진다. 외부 입력은 검증 후 엔진에서만 적용된다. UI가 읽은 snapshot은 변조해도 원본 상태에 영향을 주지 않는다.

## 검증과 운영
`npm test`, `npm run build`, `npm run simulate -- --days 100`. 브라우저 smoke는 실행/정지/주민선택/저장·로드/필터를 확인한다. 성능 측정은 실제 실행 시간과 사건 수를 함께 보고한다. 코어에는 운영 환경 비밀이나 네트워크 의존성이 없다.


## v0.3 서버 경계

- `src/server/world.ts`: 서버 시계, 검증된 명령, 상한, 필요한 사건 참조만 남기는 체크포인트.
- `src/server/store.ts`: D1 원자적 리비전 비교/저장, 명령 중복 방지, 사건·참여자·근거 색인.
- `src/server/worker.ts`: 같은 출처 JSON API, 제한된 사건 페이지, 전체 파일 내보내기.
- `src/ui/cloud.ts`: 명령 직렬화, 응답 유실 재시도, 최신 리비전 적용.
- `src/main.ts`: 기본 서버 관측과 명시적인 기기 모드. 서버 snapshot은 표시용이며 브라우저에서 Simulation.load로 실행하지 않는다.

자세한 저장·동시성·배포 계약: [SERVER_WORLD.md](SERVER_WORLD.md).

## v0.4 서버 모델 경계

`server/model.ts`는 서버 환경 변수로만 연결되는 JSON 모델 어댑터와 근거 검증을 제공한다. `server/ai.ts`는 D1 예산/lease 예약, 비동기 호출, 결과 저장과 최신 세계 반영을 처리한다. UI는 모드·대화 요청만 제출하며 모델 주소나 인증 키를 받지 않는다. 로컬/CLI의 Mock 코디네이터와 코어의 무네트워크 계약은 유지한다. 자세한 운영 계약은 LLM_ARCHITECTURE.md를 참조한다.
