# 전체 아키텍처

기준: 앱 v0.19.0. 기본 화면은 서버 세계를 관찰하고, 명시적인 기기 모드와 CLI는 같은 TypeScript 코어를 직접 실행한다.

```text
서버 모드: UI → cloud.ts → Worker API → 인증·역할 검사
                                      ↓
                            LiveWorldStore + 명령 검증
                                      ↓
                             Simulation / 도메인 규칙
                                      ↓
                          D1 체크포인트·원본 사건·시계

기기 모드 / CLI → Simulation ← 검증된 Mock·모델 결과
Chrome 기기 → 실행권·결과 제출 → 서버 검증·저장 → Simulation
외부 모델 ← 서버 어댑터·예산·감사 → 서버 검증·저장 → Simulation
```

## 책임과 모듈

| 경계 | 주요 파일 | 책임 |
| --- | --- | --- |
| 세계 계약 | `src/sim/types.ts`, `validation.ts`, `world.ts` | JSON 상태·저장 변환·입력 불변식·시드 기반 생성 |
| 실행 | `src/sim/engine.ts`, `decision.ts`, `pathfinding.ts` | 틱·명령·실행 검증, Utility 후보와 경로 |
| 도메인 | `src/sim/`의 경제·사회·생애·도시·생활·인지·공동 활동 모듈 | 엔진이 호출하는 규칙과 사건 처리 |
| 서버 진입 | `src/server/worker.ts`, `access.ts`, `world.ts` | 같은 출처 API·신원·역할·명령·서버 시계 |
| 저장 | `src/server/live-store.ts`, `store.ts` | 시계 행, 확정 저장, 리비전 비교, 구형 저널 복원, 보관 정리 |
| 조회 | `src/server/history.ts`, `observation.ts`, `biography.ts` | 아카이브 집계·페이지·근거 조회·스트리밍 내보내기 |
| 개인 관찰 | `src/server/personal-observation.ts` | 계정·세계별 관심 주민과 마지막 관찰 시점 |
| 화면 | `src/main.ts`, `src/ui/` | 서버 snapshot 표시, 명령 직렬화·재시도, 지도 보간과 관찰 UI |
| 모델 | `src/llm/`, `src/server/ai.ts`, `model.ts`, `chrome.ts` | 기능별 계약·예산·실행권·결과 검증과 반영 |
| headless | `src/cli.ts`, `src/*regression.ts` | 같은 코어 실행과 조건별 측정 |

## 상태와 저장 경계

Simulation은 게임 상태 변경의 공개 진입점이다. UI는 snapshot을 읽고 명령을 제출하며, 서버 snapshot을 브라우저에서 다시 시뮬레이션하지 않는다. 서버 시계·접근 권한·개인 관찰·모델 감사는 게임 규칙 밖에서 관리한다. 개인 관심 지정이나 이야기 조회가 NPC의 기억·선택을 변경하지 않는다.

현재 서버 요청은 `LiveWorldStore`를 사용한다. 2초 동기화는 작은 `world_live` 시계 행만 갱신하고 일반 진행은 최대 5분 간격으로 확정한다. 사용자 명령과 AI 결과는 즉시 확정한다. 같은 소스 지문에서는 체크포인트와 시계로 진행을 재구성하고, 지문이 다르면 마지막 확정 상태를 사용한다. 구형 `WorldStore`의 체크포인트+변경 저널은 읽기 호환과 과거 검증을 위해 유지한다. 보관·복구의 상세 계약은 [SERVER_WORLD](SERVER_WORLD.md)를 따른다.

Sites `custom` 경계와 서버의 역할 검증을 함께 적용한다. 초대 참여자는 관찰·자신의 NPC 생성, 소유자는 세계 제어·설정·개입을 수행한다. 생성자/계정 정보와 개인 관심 목록은 세계 저장 파일에 넣지 않는다. [공동 세계](SHARED_WORLD.md).

## AI 경계

Chrome은 서버가 만든 제한된 영어 입력에서 허용 목표를 고른다. `src/llm/chrome-contract.ts`는 입력·응답과 한국어 템플릿, `src/ui/chrome.ts`는 기기 session, `src/server/chrome.ts`와 `chrome-schedule.ts`는 실행권·호출 간격·검증·저장을 담당한다. 세계 상태·시계의 권위는 서버에 남는다.

외부 모델은 서버 연결 설정과 명시적 모드 선택이 있을 때만 호출한다. `model.ts`는 어댑터, `ai.ts`는 예산·작업 수명·저장된 결과 반영을 담당한다. 인증 키는 클라이언트로 전달하지 않는다. Chrome 실패 시 외부 자동 전환은 없고 로컬/CLI의 Mock/off와 무네트워크 코어를 유지한다. [LLM 계약](LLM_ARCHITECTURE.md).

6A는 사용자 수용 완료다. 새 실기기 자동 추론 성공과 구별하며 [기존 검증 기록](CHROME_AI_VALIDATION.md)을 보존한다.

## 구현과 불변식

TypeScript + Vite + DOM/Canvas, Cloudflare Worker/D1을 사용한다. 서버 모드의 렌더링은 확인된 위치를 보간한다. 기기 모드만 브라우저의 고정 틱 누적기로 코어를 실행하며 탭 복귀 시 과도한 시간 따라잡기를 제한한다.

자원·화폐는 유한한 0 이상의 값이고, 행동은 거리·대상·소유량·생존·재고를 재검증한다. 주민은 모르는 사건의 정보를 선택에 사용하지 않는다. 관계·기억·모델 제안의 근거는 원본 사건에 연결한다. 모델이 자원·위치·관계 수치를 직접 변경하지 않는다. 난수 상태와 승인된 입력을 저장해 재현한다.

## 검증

`npm test`, `npm run test:browser`, `npm run build`와 변경 영역의 회귀를 사용한다. 최신 v0.19 결과와 과거 규모 측정은 [보고서 안내](reports/README.md)에서 구분한다. 코어/로컬 Worker 검증을 운영 부하나 실제 모델 품질의 증거로 확대하지 않는다.
