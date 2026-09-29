# NPC 아키텍처

## State
NPC는 ID, 이름/나이, 위치/집 ID, 직업, 생존 여부, Needs, 성격 6축, Food/Wood 소지품, 재산, 방향성 관계, 기억, 목표, 진행 중 Action, 일별 인출량, 판단 이유와 후보 Utility를 가진다. 상태에는 함수나 클래스 인스턴스를 저장하지 않는다.

## Needs와 Utility
욕구는 0~100으로 제한한다. Utility AI는 가능한 행동만 후보로 만들고 욕구·성격·시간·자원·거리·목표의 점수를 합산한다. 높은 점수부터 도달 가능한 후보를 선택한다. 매 틱 LLM을 호출하지 않는다. 진행 중 행동은 생존 위급도 또는 목표물 무효화에 의해 중단할 수 있다. UI는 현재 행동을 선택했던 점수와 이유를 보여 준다.

## Goal ≠ Action
Goal은 `secure_food`, `help_neighbor`, `earn_wealth`, `expand_farm`, `secure_storage`, `build_home`, `make_friend`의 제한된 장기 의도다. Planner는 허용된 목표를 기존 행동(Work/Gather/StoreItem/Talk/Share 등)의 가중치와 검증 가능한 프로젝트로 변환한다. Action은 종류, 대상 위치/주민, 경로, 진행도, 예상 소요 틱을 가진다. 매 실행 시 거리, 생존, 소유량, 대상 존재, 재고, 가격을 재검증한다. 조건이 바뀌면 실패를 기록하고 재계획한다.

## 관계와 기억
관계는 상대 ID와 familiarity/trust/affection/fear/resentment/respect, 가족 여부, 의미 해석과 근거 사건 ID를 가진다. 관계는 방향성이 있다. 공유, 절도 목격, 대화, 상환/연체처럼 실제 사건 처리만 숫자를 변경한다. 소문은 `직접 목격`과 구별하고 출처 사건을 유지한다.

기억은 ID, 유형, 설명, 중요도, 감정, 생성 틱, 주민/장소 ID, sourceEventId를 저장한다. 낮은 중요도는 매일 감쇠하여 제거하고 강렬한 기억은 더 오래 보존한다. 반복 사건은 같은 원인/유형·날짜 단위로 묶고 주민당 기억 상한을 둔다. 기억이 사라져도 원래 사건과 관계 근거는 이력에 남는다.

## 확장 경계
현재 Utility planner는 작은 실행 가능한 행동 그래프로 충분하다. GOAP/Behavior Tree는 별도 decision 모듈로 교체 가능하다. 생존·자원·사회 규칙을 planner 또는 LLM으로 옮기지 않는다.
