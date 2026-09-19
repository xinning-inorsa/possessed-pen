# Setup — possessed-pen

Cursor Austin × AITX hackathon. Voice-first canvas agent; ink only. Human quick start also lives in [README.md](./README.md).

## Mental model

| Process | Port | Job |
|---------|------|-----|
| **Vite + Worker** | `:5173` | React canvas + Cloudflare Worker (`/stream`, `/api/generate-mermaid`, `/api/transcribe`) |
| **Bedrock** | AWS | Claude — Mermaid text only |
| **Transcribe** | AWS | Streaming STT for the call button |

## 0. Before you start

- **Node 22+** — Vite 8 / Rolldown fails on Node 21 (`styleText` error). `nvm use` (see `.nvmrc`).
- **Bun 1.3+** — `curl -fsSL https://bun.sh/install | bash`. Put `~/.bun/bin` on PATH for launch tasks.
- **`.dev.vars`** — copy from `.dev.vars.example`. Required for voice generate/edit, **not** for Demo.

## 1. Install

```bash
nvm use
bun install
cp .dev.vars.example .dev.vars
```

Fill `.dev.vars`:

- **Demo only:** leave keys empty; press **D**.
- **Generate / edit:** `AWS_BEARER_TOKEN_BEDROCK` + `AWS_REGION`.
- **Voice call:** IAM keys with `transcribe:StartStreamTranscriptionWebSocket`. The Bedrock bearer token does not sign Transcribe.

Never commit `.dev.vars`.

## 2. Run

**Cursor:** Run and Debug → **Dev — install + start**

- Pre-launch: `bun install`
- Dev: `scripts/vite-dev.sh` → `bun run dev`
- Opens http://127.0.0.1:5173/ when ready

**Terminal:**

```bash
bun run dev
```

## 3. Demo flow

1. **Demo (D)** — offline Mermaid seed (`client/seed/authFlow.mmd`)
2. **Call** — talk over the empty canvas to generate a diagram
3. **Hover / lasso + talk** — surgical edit (“make this a decision”)
4. **Layer timeline** — scrub generations
5. **Thinking panel** — transcribe → prompt → Mermaid

**Esc** ends a call or cancels inking.

## Verify

```bash
bun run typecheck
bun run build
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on Node 21 | `nvm use 22` |
| `bun: command not found` | Install Bun; add `~/.bun/bin` to PATH |
| Command / generate 500 | Check `.dev.vars` Bedrock bearer token + region |
| Call button transcribe error | IAM keys, not bearer token; Transcribe permission in `AWS_REGION` |
| Mic denied | Allow microphone for localhost in the browser |
| EMFILE / watch errors (WSL) | Use `scripts/vite-dev.sh` (raises nofile, polling) |
