#!/usr/bin/env bash
# Thin shim — all deployment logic lives in deploy/deploy.sh.
set -Eeuo pipefail
exec "$(dirname "$0")/deploy/deploy.sh" "$@"
