#!/usr/bin/env bash
# Run one fresh, headless Codex session per cycle.  No session is resumed.
set -u -o pipefail

loop_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_dir="$(CDPATH= cd -- "$loop_dir/.." && pwd)"

# shellcheck source=env.sh
source "$loop_dir/env.sh"

require_nonnegative_integer() {
  case "$2" in
    ''|*[!0-9]*)
      printf '%s must be a non-negative integer; got %s\n' "$1" "$2" >&2
      exit 2
      ;;
  esac
}

require_nonnegative_integer LOOP_MAX_TURNS "$LOOP_MAX_TURNS"
require_nonnegative_integer LOOP_DELAY_SECONDS "$LOOP_DELAY_SECONDS"
require_nonnegative_integer LOOP_MAX_CYCLES "$LOOP_MAX_CYCLES"

mkdir -p "$repo_dir/logs"
cycle=0

while :; do
  if [ "$LOOP_MAX_CYCLES" -ne 0 ] && [ "$cycle" -ge "$LOOP_MAX_CYCLES" ]; then
    exit 0
  fi

  cycle=$((cycle + 1))
  log_file="$repo_dir/logs/$(date +%F).log"
  started_at="$(date -Is)"

  {
    printf '\n=== cycle %s started %s ===\n' "$cycle" "$started_at"
    "$LOOP_CODEX_BIN" \
      --sandbox workspace-write \
      --ask-for-approval never \
      --cd "$repo_dir" \
      exec \
      --ephemeral \
      --model "$LOOP_MODEL" \
      "This is autonomous loop cycle $cycle. Read and follow loop/PROMPT.md before doing any work. Work only from the files in this repository; do not resume or rely on any earlier conversation. End this session after at most $LOOP_MAX_TURNS turns."
    codex_status=$?
    printf '=== cycle %s finished %s (codex exit %s) ===\n' "$cycle" "$(date -Is)" "$codex_status"
  } >>"$log_file" 2>&1

  # STOP is intentionally checked after a complete cycle so in-progress work can commit.
  if [ -e "$loop_dir/STOP" ]; then
    printf '%s STOP found after cycle %s; exiting normally.\n' "$(date -Is)" "$cycle" >>"$log_file"
    exit 0
  fi

  if [ "$LOOP_MAX_CYCLES" -ne 0 ] && [ "$cycle" -ge "$LOOP_MAX_CYCLES" ]; then
    exit 0
  fi

  sleep "$LOOP_DELAY_SECONDS"
done
