# Provider Guide

Use this route for provider support, model-list changes, free-model filtering, and provider-specific request behavior. Do not edit provider runtime code unless the active task owns provider implementation.

## Current provider model

- Implementation anchors: [src/providers/openrouter.ts](../src/providers/openrouter.ts), [src/providers/nvidia.ts](../src/providers/nvidia.ts), and [src/providers/catalog.ts](../src/providers/catalog.ts).
- `listAvailableFreeModels` in `src/providers/catalog.ts` is the multi-provider entry point used by `src/commands/model.ts` and `src/server/create-server.ts`; new providers must register here.
- OpenRouter model eligibility accepts `:free` IDs or zero prompt/completion/request pricing with text output support.
- NVIDIA model eligibility filters the upstream `/v1/models` list to chat-like entries: IDs, names, types, tasks, and tags must not match the non-chat pattern (embed/rerank/ocr/audio/speech/video/translation/safety/etc.), and any explicit `task` must read as chat/generate/completion/instruct.
- Provider context length is enriched from the raw metadata catalog on the `model-metadata` branch. The catalog is refreshed from public OpenRouter and NVIDIA metadata endpoints by `npm run metadata:update` and the daily `.github/workflows/update-model-metadata.yml` workflow. If the raw URL is unreachable, runtime leaves context length empty rather than blocking; `npm run metadata:update` writes a local `data/model-metadata.json` for development inspection only and is not packaged.
- The NVIDIA metadata refresh uses the public NGC endpoint catalog behind Build NVIDIA, per-endpoint details, and Build NVIDIA model cards as a final context-length fallback; rows without a reliable context length stay in the catalog and render as `-`.
- NVIDIA models are exposed with local `nvidia/` IDs while preserving upstream model IDs for API calls. Runtime context length is read only from upstream model metadata aliases or the raw metadata catalog; it does not fetch Build NVIDIA pages during `omfm model`.
- Provider model catalogs are cached for 5 minutes, deduplicated by local model ID, and filtered to providers with currently configured API keys before reuse; stale catalogs are refreshed before normal use, with stale-cache fallback only when provider catalog fetches fail. Recent generic probe failures are hidden from `omfm model` briefly, then become listable again so transient provider/network failures can recover on a later probe.
- Provider request helpers forward chat completions and Anthropic-compatible messages where supported.

## Required route for provider work

1. Start at `AGENTS.md`, then `docs/index.md`, then this file.
2. Read `research/providers.md` for provider findings, candidate constraints, and decision records.
3. Inspect source anchors:
   - `src/providers` for adapters and model normalization.
   - [scripts/update-model-metadata.mjs](../scripts/update-model-metadata.mjs) for provider metadata enrichment (publishes to the `model-metadata` branch).
   - [src/server/create-server.ts](../src/server/create-server.ts) for selected-model filtering and request forwarding.
   - [src/commands/model.ts](../src/commands/model.ts) for catalog selection behavior.
4. Inspect tests:
   - `test/openrouter.test.ts`
   - `test/nvidia.test.ts`
   - `test/catalog.test.ts`
   - provider-related coverage in `test/server.test.ts`, `test/model-command.test.ts`, and `test/probe.test.ts`
5. Define verification before implementation: provider unit tests, CLI model-list behavior, server selected-model filtering, probe behavior, and secret handling.

## Contract checks

- New providers must not bypass selected-model allowlisting.
- New providers must document how free or text-eligible models are identified.
- Provider errors should remain local and actionable; never print API keys or provider tokens.
- Model IDs exposed through `/v1/models` must remain compatible with downstream OpenAI-compatible clients.
- Legacy cached OpenRouter rows must not be misrouted only because their model ID contains a provider-like prefix.

## Update rule

Update this page and `research/providers.md` whenever provider eligibility, provider catalog shape, credential handling, or request surfaces change. Keep detailed experiments in research or decision records.
