# Client Compatibility Research

Update this page when endpoint behavior, translation semantics, authentication assumptions, or compatibility tests change.

## Current local anchors

- Implementation: `src/server/create-server.ts`, `src/server/sse.ts`, `src/server/translate.ts`
- Tests: `test/server.test.ts`, `test/translate.test.ts`
- Product docs: `README.md` sections “OpenAI-compatible clients” and “Claude Code / Anthropic-compatible clients”

## Current findings

- The local OpenAI-compatible base URL is `http://localhost:4567/v1`.
- Required OpenAI-compatible routes in `0.0.1` are `GET /v1/models` and `POST /v1/chat/completions`.
- The local Anthropic-compatible base URL is `http://localhost:4567/anthropic`.
- Required Anthropic-compatible routes in `0.0.1` are `POST /anthropic/v1/messages` and the `POST /anthropic/messages` alias.
- Anthropic-compatible token counting is available at `POST /anthropic/v1/messages/count_tokens` and `POST /anthropic/messages/count_tokens`; it returns a local estimate rather than an exact provider tokenizer count.
- Local Anthropic auth headers are accepted, while provider access uses configured provider keys.
- Per-mode model names are handled as local routing aliases before upstream forwarding, so clients can use `omfm/fast`, `omfm/balanced`, `omfm/capable`, or the `haiku`/`sonnet`/`opus` aliases without the upstream provider exposing those IDs.
- Tool-use Anthropic blocks are translated to OpenAI `tools`/`tool_calls` on fallback routes, and OpenAI tool calls are translated back to Anthropic `tool_use` blocks, including streaming `input_json_delta` events.
- Anthropic fallback translation preserves client tool history, common tool choices, base64/URL image inputs as OpenAI `image_url` content, and legacy OpenAI `function_call` output.
- Multimodal Anthropic blocks are best-effort pass-through through provider-compatible Anthropic routes; otherwise they are rejected or unsupported.

## Compatibility gaps to track

- Multimodal Anthropic block handling.
- Provider/model variance in OpenAI-compatible tool-call quality.
- Streaming/SSE edge cases across local clients.
- Auth-header expectations for clients that require non-empty Anthropic keys.

## Compatibility-change checklist

1. Capture observed client behavior here before changing translation or server behavior.
2. Update `docs/client-compatibility.md` with route or verification changes.
3. Add or adjust `test/server.test.ts` and `test/translate.test.ts` coverage.
4. Run `npm test`, `npm run typecheck`, and `npm run build`.
5. Record durable compatibility tradeoffs in `research/decisions/` when needed.
