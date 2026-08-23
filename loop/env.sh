#!/usr/bin/env bash
# Shell settings for loop/loop.sh.  Values on the command line override these.

: "${LOOP_MODEL:=gpt-5.4}"
: "${LOOP_MAX_TURNS:=10}"
: "${LOOP_DELAY_SECONDS:=30}"
# 0 means run without a cycle limit.
: "${LOOP_MAX_CYCLES:=0}"

# Kept separate so a service can use a stable Codex installation path when needed.
: "${LOOP_CODEX_BIN:=codex}"
