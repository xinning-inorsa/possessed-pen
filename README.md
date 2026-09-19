# possessed-pen

**An agent that only draws** — steer with lasso + command bar, not chat.

Hackathon demo built on the [tldraw Agent starter kit](https://tldraw.dev/starter-kits/agent). The agent's only output is ink on an infinite canvas: structured Mermaid → native tldraw shapes via `@tldraw/mermaid`.

## Quick start

### One-click (Cursor / VS Code)

1. Open this folder in Cursor or VS Code.
2. Run and Debug → **Dev — install + start**.
3. Pre-launch runs `bun install`, then starts Vite + the Cloudflare worker.
4. Cursor opens the app at `http://127.0.0.1:5173/` when the dev server is ready.

### Manual

```bash
nvm use                    # Node 22+ required (.nvmrc)
bun install
cp .dev.vars.example .dev.vars
# Edit .dev.vars — set AWS_BEARER_TOKEN_BEDROCK and AWS_REGION
bun run dev
```

Open http://127.0.0.1:5173/

**Demo works without Bedrock** — click **Demo** for a hardcoded auth-flow diagram. Generate and selection→redo need Bedrock credentials in `.dev.vars`.

## Environment (`.dev.vars`)

Copy `.dev.vars.example` to `.dev.vars` (gitignored):

| Variable | Required | Notes |
|----------|----------|-------|
| `AWS_BEARER_TOKEN_BEDROCK` | For generate/redo | Preferred on Cloudflare Workers |
| `AWS_REGION` | Yes with Bedrock | e.g. `us-east-1` |
| `BEDROCK_MODEL_ID` | Optional | Default: Claude Sonnet 4.5 on Bedrock |

Optional IAM keys (`AWS_ACCESS_KEY_ID`, etc.) if not using bearer token.

## Demo script (~90s)

1. Open app — full-screen canvas, no chat.
2. Click **Demo** — auth flowchart appears; layer shows in the left strip.
3. Lasso a node → type e.g. “make this a decision with Yes/No paths” → **Draw**.
4. Neighbors stay put; scrub layers to compare generations.

Shortcuts: `⌘/Ctrl+K` focus command bar · `Esc` cancel inking.

## Architecture

```
┌─────────────┐     POST /api/generate-mermaid      ┌──────────────────┐
│ CommandBar  │ ─────────────────────────────────► │ Cloudflare Worker │
│ Demo button │                                    │  (Bedrock Claude) │
└──────┬──────┘                                    └────────┬─────────┘
       │                                                      │ Mermaid
       │ createMermaidDiagram                                 ▼
       └──────────────────────────────────────────► tldraw canvas
                                                      (meta.layerId)
       LayerTimeline ◄── LayerStore
```

| Path | Role |
|------|------|
| `client/` | React UI — command bar, layer strip, no chat panel |
| `worker/` | Cloudflare Worker + Durable Object, Bedrock, `/api/generate-mermaid` |
| `shared/` | Types, schemas, model definitions |
| `client/seed/authFlow.mmd` | Deterministic demo seed (no LLM) |

## Limitations

- Hackathon scope — no chat UI, no freehand art demos, no multiplayer
- Generate/redo requires Bedrock; Demo does not
- tldraw SDK watermark on canvas for dev/hobby use ([license](https://tldraw.dev/community/license))
- Selection→redo capped at 12 shapes

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Vite + worker dev server (`vite --host`) |
| `bun run build` | Production build |
| `bun run preview` | Preview production build |

Node **22+** required. On Linux/WSL, Vite 8 needs the rolldown native binding (listed in `optionalDependencies`).

## Cursor / agent setup

- `AGENTS.md` — agent front door
- `.cursor/rules/` — stack, product boundaries, kill criteria
- `.vscode/launch.json` — one-click dev launch

Based on the tldraw Agent template. See upstream docs for kit customization.
