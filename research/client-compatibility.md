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
- Local Anthropic auth headers are accepted, while provider access uses configured provider keys.
- Per-mode model names are handled as local routing aliases before upstream forwarding, so clients can use `omfm/fast`, `omfm/balanced`, `omfm/capable`, or the `haiku`/`sonnet`/`opus` aliases without the upstream provider exposing those IDs.
- Tool-use and multimodal Anthropic blocks are best-effort pass-through through provider-compatible Anthropic routes; otherwise they are rejected or unsupported.

## Compatibility gaps to track

- Tool-use and multimodal Anthropic block handling.
- Streaming/SSE edge cases across local clients.
- Auth-header expectations for clients that require non-empty Anthropic keys.

## Compatibility-change checklist

1. Capture observed client behavior here before changing translation or server behavior.
2. Update `docs/client-compatibility.md` with route or verification changes.
3. Add or adjust `test/server.test.ts` and `test/translate.test.ts` coverage.
4. Run `npm test`, `npm run typecheck`, and `npm run build`.
5. Record durable compatibility tradeoffs in `research/decisions/` when needed.
