---
name: onboard
description: Set up possessed-pen for local dev — Bun, Node 22, .dev.vars, one-click launch. Use when onboarding, first run, or env issues.
---

# Onboard — possessed-pen

## Prerequisites

- **Node.js 22+** — `nvm use` (`.nvmrc` pins 22)
- **Bun** — `curl -fsSL https://bun.sh/install | bash`

## Setup

```bash
cd possessed-pen
nvm use          # or: nvm install 22
bun install
cp .dev.vars.example .dev.vars
# Fill AWS_BEARER_TOKEN_BEDROCK + AWS_REGION
```

## One-click launch (Cursor)

**Run and Debug → Dev — install + start**

- Pre-launch: `bun install`
- Dev: `scripts/vite-dev.sh` → `bun run dev` (Vite + Cloudflare worker)
- Opens Cursor browser at `http://127.0.0.1:5173/`

## Demo without Bedrock

Press **D** or click **Demo** — hardcoded auth-flow Mermaid. No API keys needed.

## Bedrock generation

Command bar (⌘K) calls `/api/generate-mermaid`. Requires `.dev.vars` with Bedrock credentials.

See [SETUP.md](./SETUP.md) for troubleshooting.
