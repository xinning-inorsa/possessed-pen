#!/usr/bin/env bash
set -euo pipefail

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
exec "$BUN" install
