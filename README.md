# game-dev1 autonomous loop

`loop/loop.sh` launches a fresh, headless Codex session for every work cycle. It never resumes a previous session; the durable context is the files in `docs/`.

## Files

- `loop/env.sh`: model, maximum turns per cycle, delay, and maximum cycle count.
- `loop/PROMPT.md`: the instructions each fresh session must read.
- `docs/PROJECT.md`: durable project brief.
- `docs/STATUS.md`: current progress and next work.
- `docs/feedback/INBOX.md`: highest-priority user instructions.
- `logs/YYYY-MM-DD.log`: ignored runtime output, appended by date.
- `loop/STOP`: ignored local stop switch; the current cycle finishes, then exits normally.

## Control

Start manually:

```bash
./loop/loop.sh
```

Stop after the current cycle:

```bash
touch loop/STOP
```

Start again after stopping:

```bash
rm loop/STOP
systemctl --user start game-dev1-loop.service
```

The Linux user service is registered but not started during setup. It starts on login after being enabled. It restarts after an abnormal process exit, but a normal `STOP` exit remains stopped.

View service state and logs:

```bash
systemctl --user status game-dev1-loop.service
journalctl --user -u game-dev1-loop.service -f
tail -f logs/$(date +%F).log
```

Manage the automatic service:

```bash
systemctl --user start game-dev1-loop.service
systemctl --user stop game-dev1-loop.service
systemctl --user disable game-dev1-loop.service
```
