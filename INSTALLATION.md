# Installation and Setup

This document covers installing `oh-my-free-models` (`omfm`), configuring provider keys, selecting models, running the local proxy, and connecting clients. For the project's purpose and motivation, see [README.md](./README.md). 한국어: [INSTALLATION.ko.md](./INSTALLATION.ko.md).

## 1. Install

```bash
npm install -g oh-my-free-models
```

The package does **not** auto-start a background process during install. Start it explicitly when you want it running.

Requires Node.js 20 or newer.

## 2. Configure provider API keys

`omfm` reads provider keys in this order:

1. `OPENROUTER_API_KEY` / `NVIDIA_API_KEY` from the process or global environment
2. `~/.oh-my-free-models/.env`

Example `~/.oh-my-free-models/.env`:

```bash
OPENROUTER_API_KEY=sk-or-...
NVIDIA_API_KEY=nvapi-...
```

Only the providers whose keys are present are used.

## 3. Select models

```bash
omfm model
```

In an interactive terminal, this opens a model picker. It shows provider, model, context size, cached or measured latency, recommendation, and probe status. Rows are ordered by current selection, health/recommendation, cached latency, and provider catalog rank, so the best known choices are easiest to review.

Picker indicators:

- `▶` — current row, highlighted
- `●` — selected
- `○` — unselected

Picker keys:

- `Up`/`Down` or `j`/`k` — move
- `Space` — toggle selection
- `Enter` — save
- `q` or `Esc` — cancel

Saved selections keep the displayed order. That order becomes the deterministic routing fallback when no latency is known yet.

Latency probes run in small bounded parallel batches with conservative pacing. Row-level `rate-limit` responses are shown for that model and later rows continue probing. `quota`/payment responses stop the remaining unstarted probes for that run, but cached latency is not overwritten.

When stdout is not a TTY, `omfm model` prints a static ANSI-free table and does not probe. Non-interactive forms:

```bash
omfm model --all
omfm model --select google/gemini-2.0-flash-exp:free,meta-llama/llama-3.2-3b-instruct:free
omfm model --json
omfm model --best
omfm model --best --json
```

## 4. Start the local proxy

Foreground mode (exits on `Ctrl+C`):

```bash
omfm start
```

Background daemon:

```bash
omfm start --daemon
omfm status
omfm stop
```

Default port is `4567`. Override with `--port`:

```bash
omfm start --port 4600
```

## 5. Connect clients

### OpenAI-compatible clients

Configure OpenCode, Hermes Agent, OpenClaw, or any other OpenAI-compatible client with:

```text
baseURL=http://localhost:4567/v1
```

Required endpoints in `0.0.1`:

- `GET /v1/models`
- `POST /v1/chat/completions`

### Anthropic-compatible clients (Claude Code)

Set:

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

Required endpoints in `0.0.1`:

- `POST /anthropic/v1/messages`
- `POST /anthropic/messages` (alias)

`omfm` accepts the local Anthropic auth header and forwards requests with the matching provider key for the chosen model. When a provider exposes its own Anthropic-compatible endpoint (for example OpenRouter's Anthropic surface), `omfm` prefers it; otherwise it falls back to a minimal text-only Anthropic-to-OpenAI translation.

## 6. Diagnostics

```bash
omfm doctor
```

`doctor` reports config paths, provider key sources, selected model count, cached model count, and daemon state. It does not modify client tool settings.

## 7. Routing and latency rules

- Only models you selected with `omfm model` are eligible for routing.
- If a request names a selected model, `omfm` honors it. For provider-prefixed local models, the matching upstream model id is also honored.
- Generic or unknown model names route to the selected model with the lowest locally observed latency.
- Models that just hit rate-limit (HTTP 429) or quota (HTTP 402) are skipped for ~10 minutes before becoming candidates again. If every selected model is cooling, routing falls back to the full latency-ordered list so requests still proceed.
- Successful requests update the local latency cache.
- If no latency is known, routing falls back to deterministic selected order. The interactive picker and `omfm model --all` save that order from the recommendation-sorted display.
- No hosted latency service is used in `0.0.1`.

## 8. Development

To work on `omfm` itself:

```bash
git clone https://github.com/hakilee/oh-my-free-models
cd oh-my-free-models
npm install
npm test
npm run typecheck
npm run build
```
