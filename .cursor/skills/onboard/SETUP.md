# Workstation setup — possessed-pen

Cursor × AITX hackathon project. Canvas-first agent; ink only.

## Mental model

| Process | Port | Job |
|---------|------|-----|
| **Vite + Worker** | `:5173` | React canvas UI + Cloudflare Worker (`/stream`, `/api/generate-mermaid`) |
| **Bedrock** | (AWS) | Claude via bearer token or IAM — Mermaid text only |

## 0. Before you start

- **Node 22+** — Vite 8 / Rolldown fails on Node 21 (`styleText` error).
- **Bun** — package manager; `~/.bun/bin` on PATH for launch tasks.
- **`.dev.vars`** — copy from `.dev.vars.example`; required for command-bar generation, not Demo.

## 1. Install

```bash
nvm use
bun install
cp .dev.vars.example .dev.vars
```

## 2. Run

**Cursor:** Run and Debug → **Dev — install + start**

**Terminal:**

```bash
bun run dev
```

## 3. Demo flow

1. **Demo (D)** — offline Mermaid seed
2. **⌘K** — command bar; type e.g. "add rate limiter between gateway and auth"
3. **Lasso + ⌘K** — redo selection in place
4. **Layer timeline** — scrub generations

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on Node 21 | `nvm use 22` |
| `bun: command not found` | Install Bun; add `~/.bun/bin` to PATH |
| Command bar 500 | Check `.dev.vars` Bedrock credentials |
| EMFILE / watch errors (WSL) | Launch uses `scripts/vite-dev.sh` (raises nofile, polling) |
