#!/usr/bin/env bash
# Vite under Cursor/WSL: raise nofile, prefer polling, ensure Node 22+.
set -euo pipefail
ulimit -n 65536 2>/dev/null || true
export VITE_USE_POLLING="${VITE_USE_POLLING:-1}"

if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
	# shellcheck disable=SC1091
	source "${HOME}/.nvm/nvm.sh"
	nvm use 22 >/dev/null 2>&1 || nvm install 22
fi

cd "$(dirname "$0")/.."
BUN="${BUN:-${HOME}/.bun/bin/bun}"
if [[ ! -x "$BUN" ]]; then
	BUN="$(command -v bun)"
fi
exec "$BUN" run dev
