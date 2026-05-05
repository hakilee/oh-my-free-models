# Client Compatibility

Use this route for OpenAI-compatible client behavior, Anthropic-compatible client behavior, response translation, and streaming compatibility. Product overview snippets remain in [README.md](../README.md), and full setup lives in [INSTALLATION.md](INSTALLATION.md).

## Supported local surfaces

| Surface | Endpoint | Source anchors | Tests |
| --- | --- | --- | --- |
| Health | `GET /health` | [src/server/create-server.ts](../src/server/create-server.ts) | `test/server.test.ts` |
| OpenAI models | `GET /v1/models` | [src/server/create-server.ts](../src/server/create-server.ts), `src/providers` | `test/server.test.ts`, `test/openrouter.test.ts`, `test/nvidia.test.ts` |
| OpenAI chat | `POST /v1/chat/completions` | [src/server/create-server.ts](../src/server/create-server.ts), [src/server/sse.ts](../src/server/sse.ts) | `test/server.test.ts` |
| Anthropic messages | `POST /anthropic/v1/messages`, `POST /anthropic/messages` | [src/server/create-server.ts](../src/server/create-server.ts), [src/server/translate.ts](../src/server/translate.ts) | `test/server.test.ts`, `test/translate.test.ts` |

## Compatibility model

- OpenAI-compatible clients should set `baseURL=http://localhost:4567/v1`.
- Anthropic-compatible clients should set `ANTHROPIC_BASE_URL=http://localhost:4567/anthropic` and may use local placeholder auth because upstream auth comes from the provider key configured for the routed model.
- Clients that support per-mode model settings can request `omfm/fast`, `omfm/balanced`, or `omfm/capable`; `haiku`, `sonnet`, and `opus` are accepted aliases for those same groups.
- Anthropic requests first try a provider-supplied Anthropic-compatible endpoint when one exists, then fall back to minimal text-only Anthropic-to-OpenAI translation for supported cases.
- Tool-use and multimodal Anthropic blocks are best-effort pass-through when a provider exposes an Anthropic-compatible surface; otherwise they remain unsupported or rejected.

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
