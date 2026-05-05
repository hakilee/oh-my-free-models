# Installation and Setup

English | [한국어](./INSTALLATION.ko.md) | [简体中文](./INSTALLATION.zh-CN.md) | [繁體中文](./INSTALLATION.zh-TW.md) | [日本語](./INSTALLATION.ja.md)

This document covers installing `oh-my-free-models` (`omfm`), configuring provider keys, selecting models, running the local proxy, and connecting clients. For the project's purpose and motivation, see [README.md](../README.md).

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

In an interactive terminal, this opens a model picker. Each row shows provider, model, context size, cached or measured latency, recommendation, and probe status. Rows are sorted by current selection, health/recommendation, cached latency, and provider catalog rank — the best-known choices appear first.

Picker indicators:

- `▶` — current row, highlighted
- `●` — selected
- `○` — unselected

Picker keys:

- `Tab`, `Left`/`Right`, `h`/`l`, or `[`/`]` — switch the top tabs (`All`, `Fast`, `Balanced`, `Capable`)
- `Up`/`Down` or `j`/`k` — move
- `Space` — toggle selection
- `Enter` — save
- `q` or `Esc` — cancel

The `All` tab controls the global eligible model list. Group tabs assign models to `fast`, `balanced`, and `capable`; selecting a model in a group also keeps it eligible in `All`. Saved selections keep the displayed order. That order becomes the deterministic routing fallback when no latency is known yet.

Latency probes run in small parallel batches with conservative pacing. A `rate-limit` response marks that model and lets the remaining rows continue probing. A `quota`/payment response stops any probes not yet started for that run, but doesn't overwrite cached latency.

When stdout is not a TTY, `omfm model` prints a static ANSI-free table and skips probing. Non-interactive forms:

```bash
omfm model --all
omfm model --select google/gemini-2.0-flash-exp:free,meta-llama/llama-3.2-3b-instruct:free
omfm model --group fast --select google/gemini-2.0-flash-exp:free
omfm model --group capable --best
omfm model --json
omfm model --best
omfm model --best --json
```

Use `--group fast|balanced|capable` to maintain separate model pools for coding-agent modes. Requests for `omfm/fast`, `omfm/balanced`, or `omfm/capable` route inside that group; `haiku`, `sonnet`, and `opus` are accepted as friendly aliases.

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

While the proxy is running, it refreshes selected-model latency in conservative background probe batches about every 5 minutes. Probes reuse the same cooldown rules as the picker.

Default port is `4567`. Override with `--port`:

```bash
omfm start --port 4600
```

## 5. Connect clients

For clients that let you choose a model per mode, use `omfm/fast`, `omfm/balanced`, or `omfm/capable`. `haiku`, `sonnet`, and `opus` are accepted as aliases for those three groups.

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

`omfm` accepts the local Anthropic auth header and forwards requests with the matching provider key. If the provider exposes its own Anthropic-compatible endpoint (e.g. OpenRouter's Anthropic surface), `omfm` uses it directly; otherwise it falls back to a minimal text-only Anthropic-to-OpenAI translation.

## 6. Diagnostics

```bash
omfm doctor
omfm usage
omfm usage --json
```

`doctor` reports config paths, provider key sources, selected model count, cached model count, and daemon state. It doesn't modify any settings.

`usage` reports per-model request counts, success/failure counts, and token totals observed in non-streaming provider responses. Streaming requests are counted, but token totals are usually unavailable from the stream passthrough.

## 7. Routing and latency rules

- Only models you selected with `omfm model` are eligible for routing.
- If a request names a selected model, `omfm` routes to it directly. Provider-prefixed local model names also resolve to the matching upstream model id.
- Generic or unknown model names route to the selected model with the lowest locally observed latency.
- Group model names (`omfm/fast`, `omfm/balanced`, `omfm/capable`, plus `haiku`/`sonnet`/`opus`) route only within the configured group when that group has selected models; empty groups fall back to the full selected list.
- Models that just hit rate-limit (HTTP 429) or quota (HTTP 402) are skipped for ~10 minutes before becoming candidates again. If every selected model is cooling, routing falls back to the full latency-ordered list so requests still proceed.
- Successful requests update the local latency cache.
- `omfm start` also refreshes selected-model latency in the background while the proxy is running.
- With no latency data, routing falls back to the deterministic selected order. The interactive picker and `omfm model --all` save that order from the recommendation-sorted display.
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
