# LLM 아키텍처

## 원칙
시뮬레이션이 세계를 움직인다. LLM은 검증 가능한 Goal/Interpretation/Dialogue만 반환한다. 코어는 네트워크, 공급자 SDK, API 키에 의존하지 않는다. 기본 Mock은 비용 없이 동작하며 LLM off에서도 동일한 생존/사회 시스템이 동작한다.

## Provider 계약
`LLMProvider`는 `decideGoal(context)`, `interpretEvent(context)`, `generateDialogue(context)` 비동기 함수를 제공한다. Context는 NPC의 복사본, 이미 알고 있는 사건, 제한된 최근 기억/관계와 허용 목표 목록을 포함한다. 결과는 제한된 JSON 타입이며 실제 공급자 어댑터는 향후 이 인터페이스를 구현한다. 브라우저에 비밀키를 저장하거나 직접 외부 API를 호출하지 않는다.

## Importance Gate와 비용
중요도 65 이상인 사건만 고려한다. 실제 사건 관련 주민/목격자만 큐에 넣는다. NPC+사건 종류별 하루 중복 제거, 주민별 일일 2요청, 전역 일일 12요청, bounded queue, 동시 실행 1개, timeout 및 최대 2회 재시도를 적용한다. 주민이 모르는 범인 정보를 context로 전달하지 않는다. 대화는 외부 provider 호출 대신 Mock/명시 요청을 사용하며 보통 Talk은 코어가 처리한다.

## World Authority
코디네이터가 snapshot에서 context를 구성 → provider 호출 → 엔진 `applyInterpretation` 명령 제출 → request ID/NPC/사건 유효성·목표 allowlist·문자 길이·해석 대상 관계·허용 필드 검증 → 다음 명령 경계에서 Goal과 의미만 반영한다. 임의 action, inventory, wealth, 위치, 관계 점수는 거부한다. 결과는 사건으로 남아 같은 명령 순서로 replay 가능하다. 공급자가 context를 변조해도 엔진의 원본 상태에 영향이 없다.

## 저장·오류·재현성
요청과 재시도 횟수/상태는 저장된다. snapshot에 실제 결과를 기록한다. 외부 모델 응답 자체의 결정성을 주장하지 않는다. 같은 시드 + 승인된 결과/명령 순서가 replay 계약이다. CLI Mock은 틱 경계에서 큐를 drain하여 재현 가능하다. 브라우저는 비동기 처리하고 리셋/로드 시 이전 코디네이터를 폐기한다. 시간 초과/잘못된 응답/오류는 실패 상태로 기록하고 시뮬레이션은 계속 진행한다.
