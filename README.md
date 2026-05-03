# oh-my-free-models

`oh-my-free-models` (`omfm`) is a local free-model proxy for coding agents. It exposes OpenAI-compatible `/v1` routes and Anthropic-compatible `/anthropic` routes on localhost, then routes requests to the selected free model with the lowest locally observed latency.

## Install

```bash
npm install -g oh-my-free-models
```

The package does **not** auto-start a background process during install. Start it explicitly.

## API key

`omfm` reads provider keys in this order:

1. `OPENROUTER_API_KEY` / `NVIDIA_API_KEY` from the process/global environment
2. `~/.oh-my-free-models/.env`

Example `.env`:

```bash
OPENROUTER_API_KEY=sk-or-...
NVIDIA_API_KEY=nvapi-...
```

## Select models

```bash
omfm model
```

In an interactive terminal, the command opens a lightweight model picker. It shows provider, model, context size, cached or measured latency, recommendation, and probe status. Rows are ordered by current selection, health/recommendation, cached latency, and provider catalog rank so the best known choices are easiest to review. The current row is marked with `▶` and highlighted; selected rows use `●` and unselected rows use `○`. Use Up/Down or j/k to move, Space to toggle, Enter to save, and q/Esc to cancel. Saved selections keep the displayed order, which becomes the deterministic routing fallback when no latency is known. Latency probes run in small bounded parallel batches with conservative pacing; row-level `rate-limit` responses are shown for that model and later rows continue probing, while `quota`/payment responses stop the remaining unstarted probes for that run without overwriting cached latency.

When stdout is not a TTY, `omfm model` prints a static ANSI-free table and does not probe. Non-interactive modes are available:

```bash
omfm model --all
omfm model --select google/gemini-2.0-flash-exp:free,meta-llama/llama-3.2-3b-instruct:free
omfm model --json
omfm model --best
omfm model --best --json
```

## Diagnostics

```bash
omfm doctor
```

`doctor` reports config paths, provider key sources, selected model count, cached model count, and daemon state without modifying client tool settings.

## Start the local proxy

Foreground mode, exits on `Ctrl+C`:

```bash
omfm start
```

Background daemon:

```bash
omfm start --daemon
omfm status
omfm stop
```

Default port is `4567`; override with `--port`.

## OpenAI-compatible clients

Configure OpenCode, Hermes Agent, OpenClaw, or any OpenAI-compatible client with:

```text
baseURL=http://localhost:4567/v1
```

Required endpoints in 0.0.1:

- `GET /v1/models`
- `POST /v1/chat/completions`

## Claude Code / Anthropic-compatible clients

Configure Claude Code with:

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

Required endpoints in 0.0.1:

- `POST /anthropic/v1/messages`
- `POST /anthropic/messages` alias

`omfm` accepts local Anthropic auth headers and forwards requests with the matching provider key for the chosen model. When a provider exposes an Anthropic-compatible endpoint (for example OpenRouter's Anthropic surface), `omfm` prefers it; otherwise it falls back to a minimal text-only Anthropic-to-OpenAI translation.

## Routing and latency

- Only models selected by `omfm model` are used.
- If a request names a selected model, `omfm` honors it. For provider-prefixed local models, the matching upstream model id is honored too.
- Generic/unknown requests use the selected model with the lowest locally observed latency.
- Selected models that just hit rate-limit (HTTP 429) or quota (HTTP 402) are skipped for ~10 minutes before becoming candidates again; if every selected model is cooling, routing falls back to the full latency-ordered list so requests still proceed.
- Successful requests update the local latency cache.
- If no latency is known, routing falls back to deterministic selected order. The interactive picker and `omfm model --all` save that order from the recommendation-sorted display.
- No hosted latency service is used in 0.0.1.

## 0.0.1 limitations

- OpenRouter and NVIDIA chat models only.
- No hosted latency service.
- No install-time daemon autostart.
- No embeddings, image, audio, video, or non-chat endpoints.
- Tool-use and multimodal Anthropic blocks are best-effort pass-through when a provider exposes an Anthropic-compatible surface, otherwise rejected/unsupported.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```
