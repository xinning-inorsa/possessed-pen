# Cursor configuration — possessed-pen

Hackathon project: canvas-first agent that only draws (no chat UI).

## Rules (`.cursor/rules/`)

| File | Scope | Purpose |
|------|-------|---------|
| `possessed-pen.mdc` | Always | Stack, product boundaries, kill criteria |
| `package-manager.mdc` | Always | Bun only — no npm/yarn |
| `agent-judgment.mdc` | Always | Minimal scope, clarify before workarounds |

## Skills (`.cursor/skills/`)

| Skill | Purpose |
|-------|---------|
| `onboard` | One-click dev setup — Bun, `.dev.vars`, launch config |

## Launch

Use **Run and Debug → Dev — install + start** (`.vscode/launch.json`). Pre-launch runs `bun install`; dev server via `scripts/vite-dev.sh`.
