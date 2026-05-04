<p align="center">
  <img src="./oh-my-free-models-character.png" height="96" alt="oh-my-free-models character" />
</p>

# oh-my-free-models

English | [한국어](./README.ko.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md)

`oh-my-free-models` (`omfm`) is a local proxy that routes your coding agent to the fastest free model across providers. Point your OpenAI- or Anthropic-compatible agent at `localhost`, pick a few free models, and `omfm` keeps requests flowing as latency, rate limits, and quotas shift underneath.

## Why this exists

Free-tier coding agents look great on paper and break in practice. Four things go wrong:

**Rate limits stop your work mid-task.** Free models on OpenRouter or NVIDIA hit 429 unpredictably. A clean run becomes a stalled tool call, and you have to retry by hand.

**Latency drifts hour to hour.** The same free model is fast in the morning and unusable by afternoon. No model is "the fast one" — only "the fast one *right now*."

**Quotas force manual provider swapping.** When one provider's free quota runs out, you're manually swapping keys and base URLs. Your agent doesn't adapt.

**The free catalog churns.** Models appear, disappear, get deprecated, or quietly start returning errors. You find out by hitting the wall, not from a dashboard.

## What omfm does about it

You give `omfm` an allowlist of free models you actually want to use. It runs as a local proxy on `http://localhost:4567` and:

- measures and caches per-model latency from your machine
- routes generic requests to the lowest-latency live candidate
- cools off models that just hit 429 or 402 for ~10 minutes, so the agent doesn't retry into the same wall
- exposes one OpenAI-compatible (`/v1`) and one Anthropic-compatible (`/anthropic`) surface, so any drop-in client works without code changes

Your agent points at `localhost`. Provider switching, rate-limit retries, and picking the currently-fast model all happen below it.

## 30-second try-it

```bash
npm install -g oh-my-free-models
mkdir -p ~/.oh-my-free-models && echo 'OPENROUTER_API_KEY=sk-or-...' > ~/.oh-my-free-models/.env
omfm model        # pick a few free models in the picker
omfm start        # serves http://localhost:4567
```

## Use it from your agent

OpenAI-compatible clients (OpenCode, Hermes Agent, OpenClaw, etc.):

```text
baseURL=http://localhost:4567/v1
```

Anthropic-compatible clients (Claude Code, etc.):

```bash
export ANTHROPIC_BASE_URL=http://localhost:4567/anthropic
export ANTHROPIC_AUTH_TOKEN=omfm-local
export ANTHROPIC_API_KEY=
```

## More

- Setup, all CLI flags, daemon control, diagnostics: [INSTALLATION.md](./INSTALLATION.md)
- Routing internals: [docs/latency-routing.md](./docs/latency-routing.md)
- Provider catalog: [docs/provider-guide.md](./docs/provider-guide.md)
