#!/bin/sh
# phonefix installer: copies the skill into a project and writes a thin adapter for your agent.
#   curl -fsSL https://raw.githubusercontent.com/kp6801-ai/phonefix/main/skills/phonefix/scripts/install.sh | sh -s -- --agent cursor
#   sh install.sh --agent all            # cursor, codex (AGENTS.md), windsurf, copilot, gemini + Claude Code project skill
#   sh install.sh --agent claude --global  # ~/.claude/skills/phonefix instead of ./.claude/skills/phonefix
#   sh install.sh --agent codex --dir ./my-app
# Idempotent: re-running refreshes the skill copy and rewrites only the block between <!-- phonefix:start/end -->.
set -eu
REPO="${PHONEFIX_REPO:-https://github.com/kp6801-ai/phonefix.git}"
AGENT="all"; DIR="."; GLOBAL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --agent) AGENT="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --global) GLOBAL=1; shift ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "phonefix: unknown flag $1" >&2; exit 2 ;;
  esac
done
command -v git >/dev/null || { echo "phonefix: git is required" >&2; exit 2; }
command -v node >/dev/null || { echo "phonefix: node 18+ is required" >&2; exit 2; }
DIR="$(cd "$DIR" && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echo "phonefix: fetching $REPO"
git clone -q --depth 1 "$REPO" "$TMP/repo"
SRC="$TMP/repo/skills/phonefix"

copy_skill() { # $1 = destination dir
  rm -rf "$1"; mkdir -p "$(dirname "$1")"; cp -R "$SRC" "$1"; echo "phonefix: skill → $1"
}

case "$AGENT" in
  claude)
    if [ "$GLOBAL" = 1 ]; then copy_skill "$HOME/.claude/skills/phonefix"; else copy_skill "$DIR/.claude/skills/phonefix"; fi ;;
  all)
    copy_skill "$DIR/.phonefix/skills/phonefix"
    copy_skill "$DIR/.claude/skills/phonefix"
    node "$TMP/repo/adapters/sync.mjs" --write-to "$DIR" --skill-path .phonefix/skills/phonefix --agent all ;;
  cursor|codex|windsurf|copilot|gemini)
    copy_skill "$DIR/.phonefix/skills/phonefix"
    node "$TMP/repo/adapters/sync.mjs" --write-to "$DIR" --skill-path .phonefix/skills/phonefix --agent "$AGENT" ;;
  *) echo "phonefix: --agent must be one of claude, cursor, codex, windsurf, copilot, gemini, all" >&2; exit 2 ;;
esac

# keep reports out of the user's git
if [ -d "$DIR/.git" ] && ! grep -qs '^phonefix-report/' "$DIR/.gitignore" 2>/dev/null; then
  printf '\nphonefix-report/\n' >> "$DIR/.gitignore"; echo "phonefix: added phonefix-report/ to .gitignore"
fi
echo "phonefix: done. Next in your agent: \"make this mobile-perfect\" (Playwright: npx playwright install chromium webkit)"
