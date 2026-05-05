<p align="center">
  <img src="./oh-my-free-models-character.png" height="96" alt="oh-my-free-models character" />
</p>

# oh-my-free-models

English | [한국어](./docs/README.ko.md) | [简体中文](./docs/README.zh-CN.md) | [繁體中文](./docs/README.zh-TW.md) | [日本語](./docs/README.ja.md)

`oh-my-free-models` (`omfm`) is a local proxy that routes your coding agent to the fastest free model across providers. Point your OpenAI- or Anthropic-compatible agent at `localhost`, pick a few free models, and `omfm` keeps requests flowing as latency, rate limits, and quotas shift underneath.

https://github.com/user-attachments/assets/44c07928-1544-4b33-a472-41e82f7aa7d7

> `omfm` driving OpenCode against routed free models.

## Why this exists

Free-tier coding agents look great on paper and break in practice. Four things go wrong:

**Rate limits stop your work mid-task.** Free models on OpenRouter or NVIDIA hit 429 unpredictably. A clean run becomes a stalled tool call, and you have to retry by hand.

**Latency drifts hour to hour.** The same free model is fast in the morning and unusable by afternoon. No model is "the fast one"; only "the fast one *right now*" matters.

**Quotas force manual provider swapping.** When one provider's free quota runs out, you're manually swapping keys and base URLs. Your agent doesn't adapt.

**The free catalog churns.** Models appear, disappear, get deprecated, or quietly start returning errors. You find out by hitting the wall, not from a dashboard.

## What omfm does about it

You give `omfm` an allowlist of free models you actually want to use. It runs as a local proxy on `http://localhost:4567` and handles these jobs internally.

| Job | What happens |
| --- | --- |
| Latency tracking | Measures and caches per-model latency from your machine. |
| Request routing | Routes generic requests to the lowest-latency live candidate. |
| Cooldown | Keeps models that just hit 429 or 402 out of rotation for about 10 minutes. |
| Client compatibility | Exposes OpenAI-compatible `/v1` and Anthropic-compatible `/anthropic` surfaces, including Anthropic tool-use fallback and local token counting. |

Your agent points at `localhost`. Provider switching, rate-limit retries, and picking the currently-fast model all happen below it.

## 30-second try-it

```bash
npm install -g oh-my-free-models
mkdir -p ~/.oh-my-free-models && echo 'OPENROUTER_API_KEY=sk-or-...' > ~/.oh-my-free-models/.env
omfm model        # pick a few free models in the picker
omfm start        # serves http://localhost:4567
```

## Common commands

| Command | Use |
| --- | --- |
| `omfm model` | Open the picker and save selected free models. |
| `omfm model --all` | Print all eligible models without opening the picker. |
| `omfm model --group fast --best` | Probe the fast group and print the best current candidate. |
| `omfm start` | Run the local proxy in the foreground with request/response routing logs. |
| `omfm start --daemon` | Run the local proxy in the background. |
| `omfm status` | Show daemon, config, and best-route status. |
| `omfm stop` | Stop the background daemon. |
| `omfm doctor` | Inspect config paths, keys, model cache, and daemon state. |
| `omfm usage` | Show per-model request and token observations. |

## Use it from your agent

OpenAI-compatible clients (OpenCode, Hermes Agent, OpenClaw, etc.):

```text
url=http://localhost:4567/v1
model=omfm             # whole pool; or omfm/fast, omfm/balanced, omfm/capable
```

Anthropic-compatible clients (Claude Code, etc.):

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

For Claude Code, you can create a shell alias that routes Opus, Sonnet, and Haiku requests to `omfm` groups:

```bash
alias freeclaude='ANTHROPIC_BASE_URL=http://localhost:4567/anthropic ANTHROPIC_AUTH_TOKEN=omfm-local ANTHROPIC_API_KEY= CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 ANTHROPIC_DEFAULT_OPUS_MODEL=omfm/capable ANTHROPIC_DEFAULT_SONNET_MODEL=omfm/balanced ANTHROPIC_DEFAULT_HAIKU_MODEL=omfm/fast claude'
```

The bare `omfm` model routes across the entire selected pool, while `omfm/capable`, `omfm/balanced`, and `omfm/fast` filter to the matching model groups. The Claude-style aliases `opus`, `sonnet`, and `haiku` are equivalent to those same groups. You can also pass any specific model ID from `omfm model` to pin a request to it.

The Anthropic surface also supports local `count_tokens` estimates and translates common tool-use/tool-result flows when a request falls back to an OpenAI-compatible provider route.

## Keep context sizes consistent

`omfm` forwards each request to the routed model. It does not compact, summarize, or truncate the agent's accumulated conversation, so context-window errors are still possible. If a long session starts on a 1M-token model and later routes or fails over to a 128k or 200k model, the smaller model can reject the request once the prompt exceeds its context window. Client-side compaction can help, but do not rely on it happening automatically.

When selecting models, keep each model group in the same context tier. For example, use only ~1M-token models in `capable` if you run long sessions there, or keep all `fast`, `balanced`, and `capable` groups within the 128k-200k tier. The `omfm model` picker shows each model's context size; unknown context is shown as an unknown marker, so treat it as risky for long sessions.

## More

- Setup, all CLI flags, daemon control, diagnostics: [INSTALLATION.md](./docs/INSTALLATION.md)
- Routing internals: [docs/latency-routing.md](./docs/latency-routing.md)
- Provider catalog: [docs/provider-guide.md](./docs/provider-guide.md)
- License: [MIT](./LICENSE.md)
