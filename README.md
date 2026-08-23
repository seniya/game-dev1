# game-dev1 자율 작업 루프

`loop/loop.sh`는 작업 한 바퀴마다 완전히 새 헤드리스 Codex 세션을 엽니다. 이전 세션을 재개하지 않으므로, 필요한 맥락은 대화가 아니라 `docs/` 안의 파일로 관리합니다.

## 파일 구성

- `loop/env.sh`: 모델, 바퀴당 최대 턴 수, 바퀴 사이 대기 시간, 최대 바퀴 수를 설정합니다.
- `loop/PROMPT.md`: 새 세션마다 먼저 읽고 따라야 할 작업 지시서입니다.
- `docs/PROJECT.md`: 프로젝트의 변하지 않는 기획을 기록합니다.
- `docs/STATUS.md`: 현재 진행 상태와 다음 작업을 기록합니다.
- `docs/feedback/INBOX.md`: 사용자가 넣는 가장 우선순위가 높은 지시입니다.
- `logs/YYYY-MM-DD.log`: 날짜별 실행 로그입니다. Git에는 커밋되지 않습니다.
- `loop/STOP`: 현재 바퀴를 끝낸 뒤 정상 종료하게 하는 로컬 중지 스위치입니다. Git에는 커밋되지 않습니다.

`PROJECT.md`, `STATUS.md`, `INBOX.md`와 `PROMPT.md`의 빈 항목을 먼저 채운 뒤 루프를 시작하세요. 합격 기준과 INBOX에 실제 지시가 없으면, 루프는 저장소를 바꾸지 않고 사용자 지시를 기다립니다.

## 설정

`loop/env.sh`에서 기본값을 조정할 수 있습니다.

```bash
LOOP_MODEL=gpt-5.4
LOOP_MAX_TURNS=10
LOOP_DELAY_SECONDS=30
LOOP_MAX_CYCLES=0
```

`LOOP_MAX_CYCLES=0`은 무한 반복입니다. 최대 턴 수는 매 세션에 전달되는 작업 한도입니다.

## 시작과 중지

수동으로 실행하려면:

```bash
./loop/loop.sh
```

설치된 Linux 사용자 서비스를 시작하려면:

```bash
systemctl --user start game-dev1-loop.service
```

서비스는 로그인 시 자동으로 시작되도록 등록되어 있지만, 설치 과정에서는 시작하지 않았습니다.

현재 작업 바퀴를 끝낸 뒤 멈추려면:

```bash
touch loop/STOP
```

중지 후 다시 시작하려면 먼저 STOP 파일을 지웁니다.

```bash
rm loop/STOP
systemctl --user start game-dev1-loop.service
```

즉시 중지하려면:

```bash
systemctl --user stop game-dev1-loop.service
```

비정상적으로 종료된 서비스는 자동으로 다시 시작합니다. `loop/STOP`으로 인한 정상 종료는 다시 시작하지 않습니다.

## 상태와 로그 확인

```bash
systemctl --user status game-dev1-loop.service
journalctl --user -u game-dev1-loop.service -f
tail -f logs/$(date +%F).log
```

자동 시작 등록을 해제하려면:

```bash
systemctl --user disable game-dev1-loop.service
```
