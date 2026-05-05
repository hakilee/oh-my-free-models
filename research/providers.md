# Provider Research

Update this page when provider credentials, endpoints, model metadata, supported providers, or provider tests change.

## Current local anchors

- Implementation: `src/providers/openrouter.ts`, `src/providers/nvidia.ts`, `src/providers/catalog.ts` (multi-provider aggregation entry point), `src/providers/types.ts`
- Tests: `test/openrouter.test.ts`, `test/nvidia.test.ts`, `test/catalog.test.ts`, provider-related coverage in `test/server.test.ts`, `test/model-command.test.ts`, and `test/probe.test.ts`
- Product docs: `README.md` sections “API key”, “Select models”, and “0.0.1 limitations”

## Current findings

- The package supports OpenRouter and NVIDIA chat model adapters in version `0.0.1`.
- API-key lookup is documented as provider-specific process/global environment variables, then `~/.oh-my-free-models/.env`.
- Provider work should preserve OpenAI-compatible and Anthropic-compatible proxy behavior unless the task explicitly changes compatibility.
- OpenRouter rows without explicit `source` metadata should continue to route through OpenRouter, even when a model ID contains a provider-like prefix.
- NVIDIA rows use local `nvidia/` IDs and preserve upstream IDs for provider API calls.
- The provider metadata catalog is used as a runtime enrichment source for context length. `scripts/update-model-metadata.mjs` refreshes it from public OpenRouter `/api/v1/models`, the NVIDIA NGC endpoint catalog used by Build NVIDIA, per-endpoint NVIDIA details, and Build NVIDIA model cards as a final context-length fallback. On 2026-05-05, the NVIDIA public endpoint catalog returned 164 unique endpoint rows; rows without a reliable context length stay present so the UI can display `-` instead of hiding the model. `.github/workflows/update-model-metadata.yml` runs the refresh daily and force-updates the data-only `model-metadata` branch instead of opening daily PRs against `main`. The catalog is no longer bundled in the npm package; runtime fetches the raw URL on the `model-metadata` branch and leaves context length empty when that fetch fails.
- NVIDIA `/v1/models` metadata does not currently expose context limits. The adapter accepts common direct aliases such as `context_length`, `max_context_length`, `max_model_len`, and nested metadata/capability/config aliases for future compatibility. When those are missing, it checks the raw `model-metadata` branch catalog; if still missing, runtime leaves context empty so `omfm model` does not wait on Build NVIDIA scraping.
- Model catalog cache entries are fresh for 5 minutes. Fresh caches avoid repeated provider list requests, but cached rows are deduplicated by local model ID and filtered to sources with currently configured API keys so stale multi-provider caches do not surface inaccessible or duplicate rows. Stale caches trigger provider refresh and remain available only as a fallback when refresh fails. Generic `failed` probe observations are treated as temporary list suppression, not permanent provider eligibility, because they can include transient provider 5xx or network errors.

## Open questions

- What provider-specific rate limits, auth headers, streaming modes, and model-list formats affect compatibility?
- Which smoke tests prove new provider support without regressing existing providers?

## Provider-change checklist

1. Update this research page with provider facts and credential assumptions.
2. Update `docs/provider-guide.md` with navigation or verification changes.
3. Add or adjust provider tests before implementation behavior changes.
4. Run `npm test`, `npm run typecheck`, and `npm run build`.
5. Record durable tradeoffs in `research/decisions/` when changing provider boundaries.
