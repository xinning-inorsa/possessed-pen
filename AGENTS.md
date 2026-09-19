# AGENTS.md

Front door for coding agents on **possessed-pen**. Human quick start: [`README.md`](README.md).

## Setup

| Step | Action |
|------|--------|
| Node | **22+** — `nvm use` (see `.nvmrc`); required for Vite 8 / Rolldown |
| Bun | **1.3+** — `bun --version`; package manager + script runner |
| Env | Copy `.dev.vars.example` → `.dev.vars`; set `AWS_BEARER_TOKEN_BEDROCK` + `AWS_REGION` |
| Install | `bun install` (lockfile: `bun.lock`) |
| Run | `bun run dev` **or** Cursor/VS Code launch **Dev — install + start** |

Demo works **without** Bedrock (hardcoded Mermaid seed). Voice generate/edit needs Bedrock + Transcribe credentials in `.dev.vars`.

## Verify

```bash
bun run build      # production bundle
bun run typecheck  # tsc --noEmit
bun run dev        # Vite + Cloudflare worker on :5173
```

## Architecture

```
Call / Demo → Transcribe (optional) → /api/generate-mermaid (Bedrock) → Mermaid
            → createMermaidDiagram → tldraw shapes (meta.layerId)
LayerTimeline ← LayerStore
```

- `client/` — React UI (no chat panel)
- `worker/` — Cloudflare Worker, Bedrock, Durable Object
- `shared/` — models, schemas, types

## Do not touch

- `.dev.vars` — never commit
- Do not re-add chat UI for the demo path
- Do not ask the model for absolute coordinates for full diagrams — Mermaid only

## Always-on rules

Read `.cursor/rules/possessed-pen.mdc` and `.cursor/rules/agent-judgment.mdc` before product work.
