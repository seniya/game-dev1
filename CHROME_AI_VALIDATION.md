# Chrome AI 시험 구현 검증 — 2026-09-29

v0.5는 로드맵 6A의 코드·모의 API 검증을 추가한 시험 구현이다. **실제 Gemini Nano 목표 선택 수용 검증은 완료하지 않았다.** 6A를 완료로 표시하거나 생애/세대 개발로 넘어가지 않는다.

## 구현과 자동 검증

- 영어 규칙 기반 사건/기억 context, 목격과 소문 분리, 비공개 원본·자유문장 제외, 허용 목표·이유 코드·근거 ID와 한국어 서버 템플릿.
- 네 AI 모드, 명시적 기기 다운로드·활성화, 진행률·중단, 주민별 빈 session 복제, 숨긴 탭 중단, 60초 실행 timeout.
- D1 원자적 실행권, context 해시·세계/설정 세대·만료 검사, 출력 영구 저장 후 최신 리비전에 한 번만 반영, Worker 복구·재전송·재현.
- 외부 API 설정만으로 호출하지 않으며 Chrome 실패에도 외부 호출 0회. Mock/off와 기존 저장/모델 설정 유지.

코어·서버 테스트 **51개**, 브라우저 테스트 **15개** 통과. 최종 프롬프트/표시 수정 뒤 전체 브라우저 테스트와 60초 timeout 검증을 다시 실행했다. 이전 `uv_interface_addresses` EPERM 환경 제한은 이번 실행에서 발생하지 않았다. TypeScript와 production Worker/UI build도 통과했다. 장기 회귀 18개 조건(3시드 × 100/365일 × 정상/가뭄/100명)과 100일 Mock 실행도 통과했으며 모든 자원 회계 오차가 0이고 저장 연속성·독립 재실행 결과가 일치했다.

모의 API의 영어 응답을 실제 서버·SQLite 트랜잭션·엔진에 연결하여 한국어 목표와 원본 사건 링크, 모바일 레이아웃을 확인했다. 입력 한도 초과 시 추론 전 중단, 서버의 잘못된 출력 거부 시 기기 중단, 취소 후 늦게 도착한 session 정리와 진단 JSON에 실행권 토큰이 없는 것도 검증했다. **모의 API 성공은 실제 모델 추론 성공이 아니다.** 기본 테스트는 실제 모델 수용 테스트 1개를 건너뛰며 성공 개수에 포함하지 않는다.

## 정식 Chrome 재검증과 현재 차단 조건

설치된 **Google Chrome 148.0.7778.178**을 Playwright의 `channel: 'chrome'`으로 실행했다. Prompt API를 대체하거나 실험 플래그를 추가하지 않았다. Secure context에서 `LanguageModel`은 존재하지만 영어 text `availability()`는 **`unavailable`**이다. 별도 실제 모델 수용 테스트는 이 조건에서 실패했고, 다운로드·추론·목표 반영을 성공으로 기록하지 않았다. 결과는 [기기 확인 기록](reports/chrome-device-probe.json)에 보존한다.

2026-09-29 사용자는 현재 지원 기기가 없다고 확인했다. 따라서 6A는 실기기 수용 검증 대기 상태이며, AGENTS.md의 선행 조건에 따라 7단계 생애/세대 및 8단계 여러 마을 개발에 착수하지 않는다. 지원되는 기기를 확보하면 아래 동일 테스트와 사이트의 실제 목표·근거 표시를 확인한다.

## 이전 Chromium 시도 (실제 모델 성공 아님)

Playwright의 Chromium 153.0.8010.12에서 API를 대체하지 않고 확인했다.

| 항목 | 관측 결과 |
| --- | --- |
| Secure context / LanguageModel | true / 존재 |
| 영어 text availability | `downloadable` |
| 사용자 클릭으로 create / clone | 성공 |
| session contextWindow | 1000 |
| 초기 prompt + schema 입력 | `QuotaExceededError: The input is too large.` |
| schema 입력 중복 제거 후 | 응답 도착, 서버에서 `invalid_output`으로 거부 |
| 세계 목표 반영 | 0회, 승인되지 않은 결과 반영 없음 |
| 실제 Gemini Nano 수용 검증 | 미완료 |

API 노출이나 session 생성만으로 Gemini Nano 사용 및 정상 추론을 증명하지 않는다. 이 Chromium 실행에서 실제 모델의 정상 목표 선택을 확인하지 못했다. 지원되는 일반 Chrome의 실제 기기에서 다운로드·추론·응답 품질을 다시 확인해야 한다. 입력/timeout 한도는 보수적인 임시 상한이며 실제 기기 측정 후 조정한다.

## 재현

```bash
npm test
# tsx CLI의 IPC 포트가 제한된 환경에서 동일 테스트:
node --import tsx --test tests/*.test.ts
npm run test:browser
npm run build

# 실제 모델 다운로드·추론은 명시적으로 선택한 별도 테스트:
CHROME_REAL_TEST=1 npm run test:browser -- tests/browser/chrome.spec.ts -g 'real Chrome model' --output=test-results-real
```

실제 모델 테스트는 설치된 정식 Google Chrome을 사용한다. 다운로드는 최대 10분, 추론은 최대 60초이며, 기기 미지원이면 명시적으로 실패한다. 일반 회귀용 Chromium의 API 노출만으로 완료 처리하지 않는다. 실제 모델 테스트는 기본 실행에서 건너뛴다. 기본 테스트의 성공 개수에 실제 모델 성공을 포함하지 않는다. 상세 실행환경·승인 여부·서버 감사 결과는 Playwright의 `real-chrome-inference` 첨부에 남긴다. 일반 Chrome에서도 관찰 실험실의 Chrome 선택 → 이 기기 다운로드·활성화 → 중요 사건 진행 → 처리 기록/근거 사건 확인 순으로 검증한다. 외부 API는 선택하지 않는다.

사이트에서 직접 검증할 때는 다음 기록을 남긴다.

1. 관찰 실험실 → Chrome 모드 → 이 기기에서 다운로드·활성화. 모델 준비가 끝나면 평소처럼 세계를 진행해 중요한 사건을 기다린다.
2. 최근 모델 처리 기록에서 `반영 완료`와 원본 사건을 확인하고 **판단 입력·결과 JSON 내보내기**를 저장한다.
3. **기기 진단 JSON 내보내기**로 브라우저·지원 상태·입력량·처리 시간·최근 결과를 함께 저장한다. 이 파일은 최근 20회만 포함하며 토큰·모델 원문을 보관하지 않는다.
4. 승인된 목표와 한국어 이유가 해당 주민 및 사건에 표시되는지, 외부 API 호출이 0회인지 확인한다. 서버 승인은 허용된 상태 변경의 증거이며 클라이언트가 실제 Gemini Nano를 실행했다는 독립적인 증명은 아니다.

공식 API 계약은 구현 시 [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)와 [기기 요구 조건](https://developer.chrome.com/docs/ai/get-started)을 재확인했다. 한국어 자유 대화는 이번 범위가 아니다.
