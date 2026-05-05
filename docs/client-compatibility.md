# Client Compatibility

Use this route for OpenAI-compatible client behavior, Anthropic-compatible client behavior, response translation, and streaming compatibility. Product overview snippets remain in [README.md](../README.md), and full setup lives in [INSTALLATION.md](INSTALLATION.md).

## Supported local surfaces

| Surface | Endpoint | Source anchors | Tests |
| --- | --- | --- | --- |
| Health | `GET /health` | [src/server/create-server.ts](../src/server/create-server.ts) | `test/server.test.ts` |
| OpenAI models | `GET /v1/models` | [src/server/create-server.ts](../src/server/create-server.ts), `src/providers` | `test/server.test.ts`, `test/openrouter.test.ts`, `test/nvidia.test.ts` |
| OpenAI chat | `POST /v1/chat/completions` | [src/server/create-server.ts](../src/server/create-server.ts), [src/server/sse.ts](../src/server/sse.ts) | `test/server.test.ts` |
| Anthropic messages | `POST /anthropic/v1/messages`, `POST /anthropic/messages` | [src/server/create-server.ts](../src/server/create-server.ts), [src/server/translate.ts](../src/server/translate.ts) | `test/server.test.ts`, `test/translate.test.ts` |
| Anthropic token count | `POST /anthropic/v1/messages/count_tokens`, `POST /anthropic/messages/count_tokens` | [src/server/create-server.ts](../src/server/create-server.ts) | `test/server.test.ts` |

## Compatibility model

- OpenAI-compatible clients should set `url=http://localhost:4567/v1` (some clients spell this `baseURL` or `base_url`).
- Anthropic-compatible clients should set `ANTHROPIC_BASE_URL=http://localhost:4567/anthropic` and may use local placeholder auth because upstream auth comes from the provider key configured for the routed model.
- Clients can request `omfm` to route across the entire selected pool, or `omfm/fast`, `omfm/balanced`, or `omfm/capable` to filter to a group; `haiku`, `sonnet`, and `opus` are accepted aliases for those same groups. Any specific model ID returned by `omfm model` also pins the request.
- Anthropic requests first try a provider-supplied Anthropic-compatible endpoint when one exists, then fall back to Anthropic/OpenAI translation for text and client tool-use blocks.
- Anthropic token counting returns a local conservative estimate for client compatibility; it is not provider-tokenizer exact.
- Multimodal Anthropic blocks are best-effort pass-through when a provider exposes an Anthropic-compatible surface; otherwise they remain unsupported or rejected.

## Required route for compatibility work

1. Start at `AGENTS.md`, then `docs/index.md`, then this file.
2. Read `research/client-compatibility.md` for client-specific findings and known gaps.
3. Inspect `src/server` for endpoint, translation, and SSE behavior.
4. Inspect tests: `test/server.test.ts` and `test/translate.test.ts`.
5. Verify both protocol surfaces when changing request/response shape.

## Contract checks

- Do not expose non-chat endpoints as supported unless source and tests implement them.
- Preserve selected-model/free-model filtering before forwarding client requests upstream.
- Preserve local-only auth semantics: accept local client headers but use configured upstream provider keys server-side.
- Keep streaming content types compatible with the selected client surface.

## Update rule

Update this page and `research/client-compatibility.md` when endpoint support, translation behavior, streaming behavior, or client setup guidance changes. Keep client-specific experiments in research/decisions.
