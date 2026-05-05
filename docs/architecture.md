# Architecture

This package is a local Node.js proxy that lets coding agents point OpenAI-compatible and Anthropic-compatible clients at selected free chat models. Keep this page as a routing map; product usage remains in [README.md](../README.md), while task-specific routes live in `docs/index.md`.

## Runtime shape

| Area | Source anchors | Responsibility | Verification |
| --- | --- | --- | --- |
| CLI entrypoint | [src/cli.ts](../src/cli.ts), `src/commands/*` | Parse `omfm` commands for model selection, daemon lifecycle, status, usage, and stop. | `test/cli.test.ts`, `test/model-command.test.ts`, `test/model-view.test.ts`, `test/model-tui.test.ts`, `test/usage.test.ts` |
| Config/store | [src/config/store.ts](../src/config/store.ts), [src/config/env.ts](../src/config/env.ts), [src/config/paths.ts](../src/config/paths.ts) | Persist selected model IDs, latency observations, usage counters, daemon metadata, and API-key lookup. | `test/config.test.ts` |
| Provider adapters | [src/providers/openrouter.ts](../src/providers/openrouter.ts), [src/providers/nvidia.ts](../src/providers/nvidia.ts), [src/providers/catalog.ts](../src/providers/catalog.ts) | List and normalize eligible free models, aggregate them through `listAvailableFreeModels`, preserve provider-specific IDs, and forward provider requests. | `test/openrouter.test.ts`, `test/nvidia.test.ts`, provider-related server/probe tests |
| Latency layer | [src/latency/router.ts](../src/latency/router.ts), [src/latency/probe.ts](../src/latency/probe.ts), [src/latency/probe-scheduler.ts](../src/latency/probe-scheduler.ts), [src/latency/background-prober.ts](../src/latency/background-prober.ts) | Choose selected models by request match, observed latency, or deterministic fallback; probe with conservative pacing during model picking and server runtime. | `test/router.test.ts`, `test/probe.test.ts`, `test/probe-scheduler.test.ts`, `test/background-prober.test.ts` |
| Local server | [src/server/create-server.ts](../src/server/create-server.ts), [src/server/translate.ts](../src/server/translate.ts), [src/server/sse.ts](../src/server/sse.ts) | Expose `/v1` and `/anthropic` routes, translate fallback payloads, and stream SSE responses. | `test/server.test.ts`, `test/translate.test.ts` |

## Boundary rules

- Docs-only changes must not alter runtime behavior under `src/` unless the task explicitly asks for implementation.
- Provider work starts from `docs/provider-guide.md`, then checks `research/providers.md`, `src/providers`, and provider tests.
- Latency work starts from `docs/latency-routing.md`, then checks `research/latency-routing.md`, `src/latency`, and latency tests.
- Client compatibility work starts from `docs/client-compatibility.md`, then checks `research/client-compatibility.md`, `src/server`, and protocol tests.

## Reliability and security notes

- API keys come from provider-specific environment variables or `~/.oh-my-free-models/.env`; do not log secrets in docs, tests, daemon logs, or provider error handling.
- Routing is local and stateful: successful requests update latency cache, failures record failure state, and unknown or generic model requests should not bypass the selected-model allowlist.
- Free-model filtering is a safety boundary. New provider work must define how free/text-eligible models are identified before exposing them through `/v1/models` or request routing.

## Update rule

Update this page when a top-level module, protocol boundary, or verification route is added. Keep it compact and link to domain pages instead of duplicating detailed behavior.
