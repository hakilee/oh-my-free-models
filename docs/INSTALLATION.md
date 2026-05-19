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

In an interactive terminal, this opens a model picker. Each row shows provider, model, context size, cached or measured latency, recommendation, and probe status. Rows are sorted by current selection, health/recommendation, cached latency, and provider catalog rank, so the best-known choices appear first.

Picker indicators:

| Indicator | Meaning |
| --- | --- |
| `▶` | Current highlighted row. |
| `●` | Selected model. |
| `○` | Unselected model. |

Picker keys:

| Key | Action |
| --- | --- |
| `Tab`, `Left`/`Right`, `h`/`l`, or `[`/`]` | Switch the top tabs (`All`, `Fast`, `Balanced`, `Capable`). |
| `Up`/`Down` or `j`/`k` | Move the cursor. |
| `Space` | Toggle selection. |
| `Enter` | Save. |
| `q` or `Esc` | Cancel. |

The `All` tab controls the global eligible model list. Group tabs assign models to `fast`, `balanced`, and `capable`; selecting a model in a group also keeps it eligible in `All`. Saved selections keep the displayed order. That order becomes the deterministic routing fallback when no latency is known yet.

Latency probes run in small parallel batches with conservative pacing. A `rate-limit` response marks that model and lets the remaining rows continue probing. A `quota`/payment response stops any probes not yet started for that run, but doesn't overwrite cached latency.

When stdout is not a TTY, `omfm model` prints a static ANSI-free table and skips probing. Use these non-interactive forms as needed.

| Command | Use |
| --- | --- |
| `omfm model --all` | Print every eligible model. |
| `omfm model --select google/gemini-2.0-flash-exp:free,meta-llama/llama-3.2-3b-instruct:free` | Save an explicit selected-model list. |
| `omfm model --group fast --select google/gemini-2.0-flash-exp:free` | Save a model list for one group. |
| `omfm model --group capable --best` | Probe a group and print its best candidate. |
| `omfm model --json` | Print model rows as JSON. |
| `omfm model --best` | Probe selected models and print the best candidate. |
| `omfm model --best --json` | Print the best candidate as JSON. |
| `omfm model --no-tui` | Force the static model table even on a TTY. |

Use `--group fast|balanced|capable` to maintain separate model pools for coding-agent modes. Requests for `omfm/fast`, `omfm/balanced`, or `omfm/capable` route inside that group; `haiku`, `sonnet`, and `opus` are accepted as friendly aliases.

## 4. Start the local proxy

Use the command that matches how you want the proxy to run.

| Command | Use |
| --- | --- |
| `omfm start` | Start the proxy in the foreground with request/response routing logs. Stop it with `Ctrl+C`. |
| `omfm start --daemon` | Start the proxy as a background daemon. |
| `omfm status` | Show daemon, config, and best-route status. |
| `omfm stop` | Stop the background daemon. |

While the proxy is running, it refreshes selected-model latency in conservative background probe batches about every 5 minutes. Probes reuse the same cooldown rules as the picker.

Foreground `omfm start` also prints one-line request and response logs, including the requested model, routed model, route reason, cached latency, status, duration, and stream flag when available.

Default port is `4567`. Override it when needed.

| Command | Use |
| --- | --- |
| `omfm start --port 4600` | Start the proxy on port `4600`. |

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
- `POST /anthropic/v1/messages/count_tokens`
- `POST /anthropic/messages/count_tokens` (alias)

`omfm` accepts the local Anthropic auth header and forwards requests with the matching provider key. If the provider exposes its own Anthropic-compatible endpoint (e.g. OpenRouter's Anthropic surface), `omfm` uses it directly; otherwise it falls back to Anthropic/OpenAI translation for text and common client tool-use flows. Token counting returns a local compatibility estimate, not an exact provider tokenizer count.

## 6. Diagnostics

| Command | Use |
| --- | --- |
| `omfm doctor` | Report config paths, provider key sources, selected models, cache size, and daemon state. |
| `omfm usage` | Show per-model request counts and token totals when available. |
| `omfm usage --json` | Print usage observations as JSON. |

`doctor` does not modify settings. Streaming requests are counted by `usage`, but token totals are usually unavailable from the stream passthrough.

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

Use these commands to work on `omfm` itself.

| Command | Use |
| --- | --- |
| `git clone https://github.com/hakilee/oh-my-free-models` | Clone the repository. |
| `cd oh-my-free-models` | Enter the project directory. |
| `npm install` | Install dependencies. |
| `npm test` | Run the test suite. |
| `npm run typecheck` | Run TypeScript type checking. |
| `npm run build` | Build `dist`. |
