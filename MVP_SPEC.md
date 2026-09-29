# MVP 명세

## 이번 납품
- 32×24 타일 마을: 땅·물·나무·집·창고·농장·시장·우물.
- 기본 12명, seed 기반 성격/직업/욕구/자산, 최대 100명 headless.
- Idle, Move, Sleep, Eat, Drink, Gather, Work, Talk, StoreItem, TakeItem, Share, Theft, Trade, Borrow, Repay.
- Food/Wood 생산·소비·저장, 시장 교환, 대여 만기와 관계 영향.
- 주변 목격, 출처를 보존하는 소문, 관계 6축, 중요 기억/감쇠.
- 중요 사건 큐, provider 인터페이스, Mock, 결과 검증과 예산/timeout/retry.
- 지도·주민 inspector·Utility 이유·목표·기억·관계 근거·필터 가능한 사건 이력.
- 일시정지/배속/한 틱, seed 재시작, 가뭄/식량 투입 실험, localStorage/JSON 저장·로드.
- CLI 100일 통계, 결정성 및 권한 경계 테스트, production build.

## 수용 기준
1. `npm install && npm run dev`로 API 키 없이 관찰할 수 있다.
2. `npm run simulate -- --days 100 --seed 42`가 실제 상태로 통계를 만든다.
3. 같은 seed/명령의 snapshot이 같으며 저장 전후 연속 실행도 같다.
4. 굶주린 이웃과 여분의 식량이라는 조건에서 공유가, 탐욕·식량 부족 조건에서 경쟁/절도·목격이 발생한다. 특정 이름의 주민을 위한 이야기 분기는 없다.
5. 관계/기억의 sourceEventId를 따라 실제 원인과 소문 출처를 찾을 수 있다.
6. LLM은 돈/물건/위치/관계 점수를 수정할 수 없고 중요도가 낮은 일상은 호출을 만들지 않는다.
7. 잘못된 저장 파일이나 LLM 결과는 원본 세계를 훼손하지 않는다.

## 후속 범위
출생/세대·복수 마을·LOD·전투·동물·정교한 질병·대규모 이력 아카이브. 실제 모델 어댑터/서버 비밀키 설정은 v0.4에 추가했으며 LLM_ARCHITECTURE.md를 따른다. 현재 가옥 프로젝트는 기존 집의 개선이며 독립 토지 분할/새 건물 배치는 후속 범위다.
