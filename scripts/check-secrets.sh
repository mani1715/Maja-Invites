#!/usr/bin/env bash
# Pre-commit secret guard for MAJA Invites. Blocks the commit if the staged diff
# contains real credential patterns or a tracked .env. Install as a git hook:
#   cp scripts/check-secrets.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
# (or run manually: bash scripts/check-secrets.sh)
set -euo pipefail

# 1. never allow a real .env (any depth) to be committed
if git diff --cached --name-only | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example' >/dev/null 2>&1; then
  echo "BLOCKED: a .env file is staged. Never commit secrets." >&2
  exit 1
fi

# 2. scan the staged diff for real credential shapes (placeholders allowed)
PATTERNS='AKIA[0-9A-Z]{16}|rzp_live_[A-Za-z0-9]{10,}|sk_live_[A-Za-z0-9]{10,}|AIza[A-Za-z0-9_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'
HITS=$(git diff --cached -U0 | grep -E '^\+' | grep -vE 'PLACEHOLDER|EXAMPLE|your_|<[a-z]' | grep -En "$PATTERNS" || true)
if [ -n "$HITS" ]; then
  echo "BLOCKED: possible secret in staged changes:" >&2
  echo "$HITS" | head >&2
  echo "Remove it (use an env var). Override once with: git commit --no-verify" >&2
  exit 1
fi
exit 0
